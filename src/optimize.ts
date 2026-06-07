import { Worker } from 'node:worker_threads'
import * as path from 'node:path'

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
 * Runs wasm-vips inside a Node.js worker_thread so its Emscripten pthread
 * pool initialization (which uses Atomics.wait) doesn't deadlock against
 * Electron's Chromium event loop on the extension host main thread.
 */
export function optimize(
  input: Buffer,
  ext: string,
  opts: OptimizeOptions,
  fast = false
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'worker.js')
    const w = new Worker(workerPath, {
      workerData: { input: new Uint8Array(input), ext, opts, fast },
    })
    w.once('message', (msg: { result?: Buffer; error?: string }) => {
      if (msg.error) {
        reject(new Error(msg.error))
      } else {
        resolve(Buffer.from(msg.result!))
      }
    })
    w.once('error', reject)
    w.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Encoder worker exited with code ${code}`))
    })
  })
}
