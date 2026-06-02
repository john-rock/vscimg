// Browser-side image codec layer for the live demo.
//
// The VS Code extension encodes with `sharp` (mozjpeg / libimagequant / WebP /
// AVIF) on the host. Sharp is native and can't run in a browser, so the demo
// swaps in the squoosh WASM codecs via jSquash — exactly the encoder swap the
// extension's README describes as a one-function change (`src/optimize.ts`).
//
// Each codec's WASM is loaded lazily with a dynamic `import()` inside the encode
// path, so nothing WASM-related touches SSR or the initial page bundle.

export type TargetFormat = 'jpeg' | 'png' | 'webp' | 'avif'

export interface EncodeResult {
  blob: Blob
  bytes: number
}

const MIME: Record<TargetFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
}

export const EXTENSION: Record<TargetFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
}

/** Whether a target format's output size responds to the quality slider. */
export function qualityApplies(format: TargetFormat): boolean {
  // PNG via oxipng is lossless — quality doesn't change the output. The
  // extension additionally applies lossy palette quantization (libimagequant),
  // which jSquash has no equivalent for, so the demo is honest about this.
  return format !== 'png'
}

export function mimeFor(format: TargetFormat): string {
  return MIME[format]
}

/** Guess a sensible default output format from a source file's MIME/name. */
export function formatFromFile(file: { type?: string; name?: string }): TargetFormat {
  const t = (file.type || '').toLowerCase()
  const n = (file.name || '').toLowerCase()
  if (t.includes('png') || n.endsWith('.png')) return 'png'
  if (t.includes('webp') || n.endsWith('.webp')) return 'webp'
  if (t.includes('avif') || n.endsWith('.avif')) return 'avif'
  // jpeg, gif, tiff, bmp, anything else → re-encode as JPEG by default, the
  // one format where the quality slider is most legible.
  return 'jpeg'
}

/**
 * Decode any browser-decodable image (JPEG/PNG/WebP/AVIF/GIF first frame/…)
 * into ImageData via `createImageBitmap` + a canvas — the universal entry the
 * jSquash encoders expect.
 */
export async function decodeToImageData(source: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(source)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Re-encode ImageData to the target format at the given quality.
 *
 * `fast` mirrors the extension's preview path: it trades a little compression
 * for speed (lower effort) so dragging the quality slider stays responsive. The
 * download path passes `fast = false` to get the smallest file, matching the
 * extension's full-effort save (see `src/optimize.ts`).
 */
export async function encodeImage(
  image: ImageData,
  format: TargetFormat,
  quality: number,
  fast = false
): Promise<EncodeResult> {
  let buffer: ArrayBuffer

  switch (format) {
    case 'jpeg': {
      // mozjpeg is fast; no separate fast path needed (same as the extension).
      const { default: encode } = await import('@jsquash/jpeg/encode')
      buffer = await encode(image, { quality })
      break
    }
    case 'webp': {
      const { default: encode } = await import('@jsquash/webp/encode')
      // method 0–6: higher = slower/smaller. Mirrors sharp webp effort 3↔6.
      buffer = await encode(image, { quality, method: fast ? 3 : 6 })
      break
    }
    case 'avif': {
      const { default: encode } = await import('@jsquash/avif/encode')
      // AVIF is the slow one. speed 0–10: higher = faster/worse. Previews use a
      // high speed; the download re-encodes slower for a smaller file. Mirrors
      // sharp avif effort 1↔5.
      buffer = await encode(image, { quality, speed: fast ? 9 : 5 })
      break
    }
    case 'png': {
      // Lossless: encode RGBA → PNG, then oxipng optimise. level 0–6.
      const { default: encode } = await import('@jsquash/png/encode')
      const { default: optimise } = await import('@jsquash/oxipng/optimise')
      const png = await encode(image)
      buffer = await optimise(png, { level: fast ? 2 : 4 })
      break
    }
  }

  const blob = new Blob([buffer], { type: MIME[format] })
  return { blob, bytes: blob.size }
}
