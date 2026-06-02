# Image Optimizer

A VS Code extension that compresses images in place, right from the Explorer
context menu — a local replacement for round-tripping through TinyPNG.

## What it does

- Right-click an image (or a folder, or a multi-selection) in the Explorer →
  **Optimize Image**. Files are re-encoded and overwritten in place.
- **Optimize Image As…** (single file) re-encodes to a new name/format you type.
- Folders recurse and optimize every supported image inside.
- Lossy, TinyPNG-class compression via [sharp](https://sharp.pixelplumbing.com/)
  (mozjpeg for JPEG, libimagequant palette quantization for PNG, plus WebP,
  AVIF, TIFF, and GIF).
- Everything runs locally — images never leave your machine.

## Settings

| Setting | Default | Description |
|---|---|---|
| `imageOptimizer.jpegQuality` | `80` | JPEG quality (1–100). |
| `imageOptimizer.pngQuality` | `80` | PNG palette-quantization quality target. |
| `imageOptimizer.webpQuality` | `80` | WebP / AVIF quality. |
| `imageOptimizer.skipIfLargerOrEqual` | `true` | When overwriting in place, keep the original if no size win. |
| `imageOptimizer.minSavingsPercent` | `0` | When overwriting in place, only write if savings meet this percent. |

## Develop

```bash
npm install
npm run watch        # esbuild in watch mode
# then press F5 in VS Code to launch an Extension Development Host
```

## Build & install locally

```bash
npm install
npm run package                       # produces image-optimizer-<version>.vsix
code --install-extension image-optimizer-0.1.0.vsix
```

## Architecture

The encoder is isolated in `src/optimize.ts` behind a single `optimize()`
function. Everything else — menu contributions, file walking, progress, and
reporting — is encoder-agnostic, so swapping sharp for a WASM encoder (e.g. for
a cross-platform Marketplace build) only touches that one file.
