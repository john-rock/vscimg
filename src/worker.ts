import { workerData, parentPort } from 'node:worker_threads'
import type { OptimizeOptions } from './optimize'

interface WorkerInput {
  input: Uint8Array
  ext: string
  opts: OptimizeOptions
  fast: boolean
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

async function run(): Promise<void> {
  const { input, ext, opts, fast } = workerData as WorkerInput
  const vips = await getVips()
  const e = ext.toLowerCase()
  const animated = e === '.gif' || e === '.webp'
  const im = vips.Image.newFromBuffer(Buffer.from(input), animated ? '[n=-1]' : '')
  let out: Uint8Array
  try {
    switch (e) {
      case '.jpg':
      case '.jpeg':
        out = im.jpegsaveBuffer({ Q: opts.jpegQuality, optimize_coding: true })
        break
      case '.png':
        out = im.pngsaveBuffer({
          Q: opts.pngQuality,
          palette: true,
          compression: fast ? 6 : 9,
          effort: fast ? 4 : 10,
        })
        break
      case '.webp':
        out = im.webpsaveBuffer({ Q: opts.webpQuality, effort: fast ? 3 : 6 })
        break
      case '.avif':
        out = im.heifsaveBuffer({
          Q: opts.webpQuality,
          compression: 'av1',
          effort: fast ? 1 : 5,
        })
        break
      case '.tiff':
      case '.tif':
        out = im.tiffsaveBuffer({ Q: opts.jpegQuality })
        break
      case '.gif':
        out = im.gifsaveBuffer({})
        break
      default:
        throw new Error(`Unsupported format: ${ext}`)
    }
  } finally {
    im.delete()
  }
  parentPort!.postMessage({ result: Buffer.from(out!) })
}

run().catch((err) => {
  parentPort!.postMessage({ error: err instanceof Error ? err.message : String(err) })
})
