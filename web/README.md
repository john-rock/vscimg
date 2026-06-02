# Image Optimizer — marketing site

The landing page for the **Image Optimizer** VS Code extension. It lives in the
extension repo as a self-contained Next.js app under `web/`; the extension build
and `vsce` packaging are unaffected (`web/**` is in the repo's `.vscodeignore`).

Minimal, developer-focused branding (black / white / monospace) with a **live,
in-browser demo** of the extension's quality preview.

## Develop

```bash
cd web
npm install
npm run dev      # http://localhost:3000 (or next free port)
```

## How the live demo works

The extension encodes with native `sharp`, which can't run in a browser, so the
demo swaps in the squoosh WASM codecs ([jSquash](https://github.com/jamsinclair/jSquash))
— the exact encoder swap the extension's README describes as a one-function
change. Everything runs client-side; uploaded images never leave the browser.

- `lib/codec.ts` — decode (`createImageBitmap` → canvas → `ImageData`) and
  re-encode to JPEG (mozjpeg) / WebP / AVIF / PNG. WASM is lazy-`import()`ed
  inside the encode path, so it never touches SSR or the initial bundle.
- `components/Demo.tsx` — the quality slider, format picker, before/after panes,
  size/savings stats, and download — mirroring `src/preview.ts` (debounced
  re-encode, seq-guarded responses).

> **PNG note:** the demo's PNG path is lossless (oxipng); browser codecs have no
> libimagequant equivalent, so the quality slider doesn't move PNG size. Default
> to JPEG/WebP to see the slider work. The extension itself does quantize PNG.

Regenerate the sample images (requires the parent extension's `sharp` to be
installed at the repo root) with the script in git history, or drop your own
into `public/samples/`.

## Deploy (Vercel)

This is a standard Next.js app. In the Vercel project settings:

- **Root Directory:** `web/`
- **Framework Preset:** Next.js (auto-detected)

No other configuration is required — `npm run build` produces the deployable
output.
