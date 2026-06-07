# vscimage - Local Image Optimizer

A VS Code extension that compresses images in place, right from the Explorer context menu — a fully local replacement for TinyPNG.

## Features

- Right-click an image (or a folder, or a multi-selection) in the Explorer → **Optimize Image**. Files are re-encoded and overwritten in place.
- **Preview & Optimize Image…** opens a side-by-side preview so you can see the result before committing.
- **Optimize Image As…** re-encodes a single file to a new name or format.
- Folders recurse and optimize every supported image inside.
- Lossy, TinyPNG-class compression via [sharp](https://sharp.pixelplumbing.com/) — mozjpeg for JPEG, libimagequant palette quantization for PNG, plus WebP, AVIF, TIFF, and GIF.
- Everything runs locally — images never leave your machine.

## Supported Formats

PNG, JPEG, WebP, AVIF, TIFF, GIF

## Settings

| Setting | Default | Description |
|---|---|---|
| `imageOptimizer.jpegQuality` | `80` | JPEG quality (1–100). |
| `imageOptimizer.pngQuality` | `80` | PNG palette-quantization quality target. |
| `imageOptimizer.webpQuality` | `80` | WebP / AVIF quality. |
| `imageOptimizer.skipIfLargerOrEqual` | `true` | Keep the original if optimization does not reduce file size. |
| `imageOptimizer.minSavingsPercent` | `0` | Only overwrite if savings meet this percent threshold. |
| `imageOptimizer.notificationSeconds` | `5` | How long the result notification stays on screen. |

## Contributing

```bash
git clone https://github.com/john-rock/vscimg.git
cd vscimg
npm install
npm run watch        # esbuild in watch mode
# press F5 in VS Code to launch an Extension Development Host
```

To package locally:

```bash
npm run package
code --install-extension vscimg-*.vsix
```
