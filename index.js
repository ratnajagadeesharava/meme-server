import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Prefer server/.env*, fall back to repo root for local monorepo dev
for (const envFile of ['.env.local', '.env']) {
  dotenv.config({ path: path.join(__dirname, envFile) })
  dotenv.config({ path: path.join(__dirname, '..', envFile) })
}

import express from 'express'
import cors from 'cors'
import { nanoid } from 'nanoid'
import {
  deleteMemeById,
  getMemeById,
  initDb,
  insertMeme,
  listMemes,
  normalizeReactions,
  REACTION_IDS,
  updateMemeReactions,
} from './db.js'
import {
  deleteMemeImageFile,
  ensureUploadsDir,
  imagePathFromFilename,
  saveMemeImageFile,
  UPLOADS_DIR,
} from './fileStorage.js'

function parseFrontendOrigins() {
  const raw = process.env.FRONTEND_URL?.trim()
  if (!raw) return undefined
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

function memeToApi(meme, { includeLayers = false } = {}) {
  const imageUrl = imagePathFromFilename(meme.imageFilename)
  const reactions = normalizeReactions(meme.reactions)

  const base = {
    id: meme.id,
    title: meme.title,
    templateId: meme.templateId,
    createdAt: meme.createdAt,
    imageFilename: meme.imageFilename,
    imageUrl,
    thumbnailDataUrl: imageUrl,
    imageDataUrl: imageUrl,
    reactions,
  }

  if (includeLayers) {
    return { ...base, layers: meme.layers ?? [] }
  }

  return base
}

// ── app ──────────────────────────────────────────────────────────────────────

const app = express()
const allowedOrigins = parseFrontendOrigins()
app.use(
  cors(
    allowedOrigins
      ? {
          origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true)
            } else {
              callback(new Error('Not allowed by CORS'))
            }
          },
        }
      : {},
  ),
)
app.use(express.json({ limit: '50mb' }))
app.use('/uploads', express.static(UPLOADS_DIR))

/**
 * GET /api/memes
 */
app.get('/api/memes', (_req, res) => {
  try {
    const memes = listMemes()
    res.json(memes.map((m) => memeToApi(m)))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to read memes' })
  }
})

/**
 * POST /api/memes
 * Body: { title, imageDataUrl, templateId, layers }
 */
app.post('/api/memes', async (req, res) => {
  try {
    const { title, imageDataUrl, templateId, layers } = req.body
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required' })
    }

    const id = nanoid(10)
    const imageFilename = await saveMemeImageFile(id, imageDataUrl)
    const createdAt = new Date().toISOString()

    const meme = insertMeme({
      id,
      title: title ?? 'Untitled Meme',
      imageFilename,
      templateId: templateId ?? 'top-bottom',
      layers: layers ?? [],
      reactions: normalizeReactions(null),
      createdAt,
    })

    const imageUrl = imagePathFromFilename(imageFilename)
    console.log(`[+] Saved meme "${meme.title}" → id=${id} file=${imageFilename}`)

    res.status(201).json({
      id,
      shareUrl: `/meme/${id}`,
      imageUrl,
      imageFilename,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save meme' })
  }
})

/**
 * GET /api/memes/:id
 */
app.get('/api/memes/:id', (req, res) => {
  try {
    const meme = getMemeById(req.params.id)
    if (!meme) return res.status(404).json({ error: 'Meme not found' })
    res.json(memeToApi(meme, { includeLayers: true }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to read meme' })
  }
})

/**
 * POST /api/memes/:id/react
 */
app.post('/api/memes/:id/react', (req, res) => {
  try {
    const { reaction, previousReaction } = req.body ?? {}
    if (!REACTION_IDS.includes(reaction)) {
      return res.status(400).json({ error: 'Invalid reaction' })
    }
    if (previousReaction != null && !REACTION_IDS.includes(previousReaction)) {
      return res.status(400).json({ error: 'Invalid previousReaction' })
    }

    const meme = getMemeById(req.params.id)
    if (!meme) return res.status(404).json({ error: 'Meme not found' })

    const counts = normalizeReactions(meme.reactions)

    if (previousReaction && previousReaction !== reaction && counts[previousReaction] > 0) {
      counts[previousReaction] -= 1
    }

    if (!previousReaction || previousReaction !== reaction) {
      counts[reaction] += 1
    }

    const updated = updateMemeReactions(req.params.id, counts)
    res.json({ reactions: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to record reaction' })
  }
})

/**
 * DELETE /api/memes/:id
 */
app.delete('/api/memes/:id', async (req, res) => {
  try {
    const meme = deleteMemeById(req.params.id)
    if (!meme) {
      return res.status(404).json({ error: 'Meme not found' })
    }

    await deleteMemeImageFile(meme.imageFilename)
    console.log(`[-] Deleted meme id=${req.params.id}`)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete meme' })
  }
})

// ── start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001

initDb()
await ensureUploadsDir()

app.listen(PORT, () => {
  console.log(`🚀 Meme server  →  http://localhost:${PORT}`)
  console.log(`   DB: data/memes.json`)
  console.log(`   Images: uploads/{id}.png`)
  if (allowedOrigins?.length) {
    console.log(`   CORS: ${allowedOrigins.join(', ')}`)
  }
  console.log(`   GET  /api/memes`)
  console.log(`   POST /api/memes`)
  console.log(`   GET  /api/memes/:id`)
  console.log(`   POST /api/memes/:id/react`)
  console.log(`   DEL  /api/memes/:id`)
})
