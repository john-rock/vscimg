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
 */
export async function optimize(
  input: Buffer,
  ext: string,
  opts: OptimizeOptions
): Promise<Buffer> {
  const e = ext.toLowerCase()
  // Preserve animation frames for formats that can carry them.
  const pipeline = sharp(input, { animated: e === '.gif' || e === '.webp' })

  switch (e) {
    case '.jpg':
    case '.jpeg':
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
          compressionLevel: 9,
          effort: 10,
        })
        .toBuffer()
    case '.webp':
      return pipeline.webp({ quality: opts.webpQuality, effort: 6 }).toBuffer()
    case '.avif':
      return pipeline.avif({ quality: opts.webpQuality, effort: 5 }).toBuffer()
    case '.tiff':
    case '.tif':
      return pipeline.tiff({ quality: opts.jpegQuality }).toBuffer()
    case '.gif':
      return pipeline.gif().toBuffer()
    default:
      throw new Error(`Unsupported format: ${ext}`)
  }
}
