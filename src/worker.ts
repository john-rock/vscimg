import { workerData, parentPort } from 'node:worker_threads'
import type { OptimizeOptions } from './optimize'

interface WorkerInput {
  input: Uint8Array
  ext: string
  opts: OptimizeOptions
  fast: boolean
  targetRatio: number | undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _vipsInit: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getVips(): Promise<any> {
  if (_vipsInit === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const factory = require('wasm-vips') as (opts?: object) => Promise<any>
    // Only load vips-heif.wasm (AVIF); jxl and resvg are excluded from the VSIX.
    _vipsInit = factory({ dynamicLibraries: ['vips-heif.wasm'] })
  }
  return _vipsInit
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encode(im: any, e: string, q: number, fast: boolean): Uint8Array {
  switch (e) {
    case '.jpg':
    case '.jpeg':
      return im.jpegsaveBuffer({ Q: q, optimize_coding: true, strip: true })
    case '.png':
      return im.pngsaveBuffer({
        Q: q,
        palette: true,
        compression: fast ? 6 : 9,
        effort: fast ? 4 : 10,
        strip: true,
      })
    case '.webp':
      return im.webpsaveBuffer({ Q: q, effort: fast ? 3 : 6, strip: true })
    case '.avif':
      return im.heifsaveBuffer({ Q: q, compression: 'av1', effort: fast ? 1 : 5, strip: true })
    case '.tiff':
    case '.tif':
      return im.tiffsaveBuffer({ Q: q, strip: true })
    default:
      throw new Error(`Unsupported format: ${e}`)
  }
}

async function run(): Promise<void> {
  const { input, ext, opts, fast, targetRatio } = workerData as WorkerInput
  const vips = await getVips()
  const e = ext.toLowerCase()
  const animated = e === '.gif' || e === '.webp'
  const im = vips.Image.newFromBuffer(Buffer.from(input), animated ? '[n=-1]' : '')
  let out: Uint8Array
  try {
    if (e === '.gif') {
      out = im.gifsaveBuffer({})
    } else if (targetRatio !== undefined) {
      const targetBytes = Math.floor(input.byteLength * targetRatio)
      // Binary search quality (1–95) to find the encoding closest to targetBytes
      // without exceeding it. Min quality floor of 1 ensures we always produce output.
      let lo = 1
      let hi = 95
      let best: Uint8Array = encode(im, e, lo, fast)
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        const candidate = encode(im, e, mid, fast)
        if (candidate.byteLength <= targetBytes) {
          best = candidate
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      out = best
    } else {
      const q =
        e === '.jpg' || e === '.jpeg' || e === '.tiff' || e === '.tif'
          ? opts.jpegQuality
          : opts.webpQuality
      out = encode(im, e, q, fast)
    }
  } finally {
    im.delete()
  }
  parentPort!.postMessage({ result: Buffer.from(out!) })
}

run().catch((err) => {
  parentPort!.postMessage({ error: err instanceof Error ? err.message : String(err) })
})
