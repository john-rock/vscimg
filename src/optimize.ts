import sharp from 'sharp'

export interface OptimizeOptions {
  jpegQuality: number
  pngQuality: number
  webpQuality: number
}

const SUPPORTED = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.tiff',
  '.tif',
  '.gif',
])

export function isSupported(ext: string): boolean {
  return SUPPORTED.has(ext.toLowerCase())
}

/**
 * Compress an image buffer, emitting the format implied by `ext`.
 *
 * This is the single engine seam for the whole extension: everything
 * else (menus, file walking, reporting) is encoder-agnostic, so swapping
 * sharp for a WASM encoder later means rewriting only this function.
 *
 * `fast` trades a little compression for speed (lower effort levels) — it
 * exists for the live quality-preview slider, where re-encoding on every
 * drag must stay responsive. Final saves always pass `fast = false`.
 */
export async function optimize(
  input: Buffer,
  ext: string,
  opts: OptimizeOptions,
  fast = false
): Promise<Buffer> {
  const e = ext.toLowerCase()
  // Preserve animation frames for formats that can carry them.
  const pipeline = sharp(input, { animated: e === '.gif' || e === '.webp' })

  switch (e) {
    case '.jpg':
    case '.jpeg':
      // mozjpeg is already fast; no separate fast path needed.
      return pipeline
        .jpeg({ quality: opts.jpegQuality, mozjpeg: true })
        .toBuffer()
    case '.png':
      // `palette: true` enables libimagequant quantization — the
      // lossy step that gives TinyPNG-class PNG savings.
      return pipeline
        .png({
          quality: opts.pngQuality,
          palette: true,
          compressionLevel: fast ? 6 : 9,
          effort: fast ? 4 : 10,
        })
        .toBuffer()
    case '.webp':
      return pipeline
        .webp({ quality: opts.webpQuality, effort: fast ? 3 : 6 })
        .toBuffer()
    case '.avif':
      // AVIF is the slow one — high effort can take seconds, so previews
      // use the lowest effort and the real save re-encodes at full effort.
      return pipeline
        .avif({ quality: opts.webpQuality, effort: fast ? 1 : 5 })
        .toBuffer()
    case '.tiff':
    case '.tif':
      return pipeline.tiff({ quality: opts.jpegQuality }).toBuffer()
    case '.gif':
      return pipeline.gif().toBuffer()
    default:
      throw new Error(`Unsupported format: ${ext}`)
  }
}
