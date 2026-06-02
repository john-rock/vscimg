// Regenerate the demo sample images as deliberately *under-compressed*
// originals, so the in-browser optimizer always shows a real size win.
//
// The live demo decodes each sample and re-encodes it with the squoosh/jSquash
// codecs (mozjpeg 4:2:0 for JPEG, lossy WebP, oxipng for PNG). If a source file
// is already leaner than that output, there's nothing to win — the demo then
// honestly reports "no size win". To keep the demo compelling we store the
// originals fat:
//   - JPEG: quality 100, 4:4:4 (no chroma subsampling), libjpeg (mozjpeg off)
//           → the demo's mozjpeg-4:2:0 beats it at every quality, including 100.
//   - WebP: lossless → the demo's lossy q80 webp crushes it.
//   - PNG : low compression / no adaptive filtering → the demo's oxipng wins.
//
// Content is preserved (we re-encode the images already in public/samples);
// only the encoding is loosened. Oversized samples are downscaled so the live
// WASM re-encode on each slider drag stays responsive.
//
// Run:  node web/scripts/gen-samples.cjs   (sharp is resolved from the parent repo)

const path = require('path')
const { createRequire } = require('module')

// sharp lives in the parent extension repo, not in web/.
const parentRequire = createRequire(path.join(__dirname, '../../package.json'))
const sharp = parentRequire('sharp')

const DIR = path.join(__dirname, '../public/samples')

// maxWidth: downscale if wider, to keep the live demo's per-drag encode fast.
const JOBS = [
  { file: 'photo.jpg', kind: 'jpeg', maxWidth: 1280 },
  { file: 'banner.jpg', kind: 'jpeg', maxWidth: 1600 },
  { file: 'avatar.jpg', kind: 'jpeg', maxWidth: 640 },
  { file: 'texture.webp', kind: 'webp', maxWidth: 1024 },
]

async function run() {
  for (const job of JOBS) {
    const p = path.join(DIR, job.file)
    const input = await sharp(p).toBuffer()
    const meta = await sharp(input).metadata()

    let pipe = sharp(input)
    if (meta.width && meta.width > job.maxWidth) {
      pipe = pipe.resize({ width: job.maxWidth })
    }

    if (job.kind === 'jpeg') {
      pipe = pipe.jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: false })
    } else if (job.kind === 'webp') {
      pipe = pipe.webp({ lossless: true })
    } else if (job.kind === 'png') {
      // Deliberately under-optimized: low deflate effort, no adaptive filtering,
      // full-color (no palette). oxipng in the demo then has real headroom.
      pipe = pipe.png({ compressionLevel: 1, adaptiveFiltering: false, palette: false })
    }

    const out = await pipe.toBuffer()
    require('fs').writeFileSync(p, out)
    console.log(`${job.file.padEnd(16)} ${meta.width}x${meta.height} -> ${out.length} bytes`)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
