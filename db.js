import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'memes.json')

export const REACTION_IDS = ['laugh', 'fire', 'skull', 'love', 'mindblown']

let initialized = false

export function emptyReactions() {
  return Object.fromEntries(REACTION_IDS.map((id) => [id, 0]))
}

export function normalizeReactions(reactions) {
  const base = emptyReactions()
  if (!reactions || typeof reactions !== 'object') return base
  for (const id of REACTION_IDS) {
    const n = Number(reactions[id])
    if (Number.isFinite(n) && n > 0) base[id] = Math.floor(n)
  }
  return base
}

function normalizeMemeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null

  return {
    id: String(raw.id),
    title: String(raw.title ?? 'Untitled Meme'),
    imageFilename: String(raw.imageFilename ?? raw.image_filename ?? ''),
    templateId: String(raw.templateId ?? raw.template_id ?? 'top-bottom'),
    layers: Array.isArray(raw.layers) ? raw.layers : [],
    reactions: normalizeReactions(raw.reactions),
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
  }
}

function readStore() {
  if (!existsSync(DB_FILE)) {
    return { memes: [] }
  }

  try {
    const parsed = JSON.parse(readFileSync(DB_FILE, 'utf-8'))
    const memes = Array.isArray(parsed.memes) ? parsed.memes : Array.isArray(parsed) ? parsed : []
    return {
      memes: memes.map(normalizeMemeRecord).filter(Boolean),
    }
  } catch {
    return { memes: [] }
  }
}

function writeStore(store) {
  writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

export function initDb() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!existsSync(DB_FILE)) {
    writeStore({ memes: [] })
  }
  initialized = true
}

function assertInit() {
  if (!initialized) throw new Error('Database not initialized')
}

/**
 * @param {object} meme
 */
export function insertMeme(meme) {
  assertInit()
  const store = readStore()
  const record = normalizeMemeRecord({
    ...meme,
    reactions: normalizeReactions(meme.reactions),
  })

  store.memes = store.memes.filter((m) => m.id !== record.id)
  store.memes.unshift(record)
  writeStore(store)
  return record
}

export function listMemes() {
  assertInit()
  const { memes } = readStore()
  return [...memes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export function getMemeById(id) {
  assertInit()
  return readStore().memes.find((m) => m.id === id) ?? null
}

/**
 * @param {string} id
 * @param {Record<string, number>} reactions
 */
export function updateMemeReactions(id, reactions) {
  assertInit()
  const store = readStore()
  const index = store.memes.findIndex((m) => m.id === id)
  if (index < 0) {
    throw new Error('Meme not found')
  }

  const normalized = normalizeReactions(reactions)
  store.memes[index] = {
    ...store.memes[index],
    reactions: normalized,
  }
  writeStore(store)
  return normalized
}

export function deleteMemeById(id) {
  assertInit()
  const store = readStore()
  const meme = store.memes.find((m) => m.id === id)
  if (!meme) return null

  store.memes = store.memes.filter((m) => m.id !== id)
  writeStore(store)
  return meme
}
