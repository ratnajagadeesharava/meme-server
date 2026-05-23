import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const UPLOADS_DIR = path.join(__dirname, 'uploads')

/**
 * @param {string} dataUrl
 * @returns {{ contentType: string, buffer: Buffer }}
 */
export function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) {
    throw new Error('Invalid imageDataUrl — expected a base64 data URL')
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function extensionForContentType(contentType) {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  return 'png'
}

export async function ensureUploadsDir() {
  if (!existsSync(UPLOADS_DIR)) {
    await mkdir(UPLOADS_DIR, { recursive: true })
  }
}

/**
 * Save image buffer as `{id}.{ext}` in server/uploads.
 * @returns {Promise<string>} filename only (e.g. `abc123.png`)
 */
export async function saveMemeImageFile(id, dataUrl) {
  await ensureUploadsDir()
  const { buffer, contentType } = dataUrlToBuffer(dataUrl)
  const ext = extensionForContentType(contentType)
  const filename = `${id}.${ext}`
  const filePath = path.join(UPLOADS_DIR, filename)
  await writeFile(filePath, buffer)
  return filename
}

/**
 * @param {string} filename
 */
export async function deleteMemeImageFile(filename) {
  if (!filename) return
  const safe = path.basename(filename)
  const filePath = path.join(UPLOADS_DIR, safe)
  if (!existsSync(filePath)) return
  await unlink(filePath)
}

export function imagePathFromFilename(filename) {
  return `/uploads/${filename}`
}
