# vscimage - Local Image Optimizer

A VS Code extension that compresses images in place, right from the Explorer context menu — a fully local replacement for TinyPNG.

## Features

- Right-click an image (or a folder, or a multi-selection) in the Explorer → **Optimize Image**. Files are re-encoded and overwritten in place.
- **Optimize Image** always writes — it targets 80% of the original file size by binary-searching the quality setting, and strips all metadata (EXIF, ICC, XMP). If the encoder can't reach the target, it uses the smallest result it can produce. The file never grows larger than the original.
- **Preview & Optimize Image…** opens a side-by-side preview so you can see the result before committing.
- **Optimize Image As…** re-encodes a single file to a new name or format.
- Folders recurse and optimize every supported image inside.
- Fully local — images never leave your machine.

## Supported Formats

PNG, JPEG, WebP, AVIF, TIFF, GIF

## Settings

| Setting | Default | Description |
|---|---|---|
| `imageOptimizer.jpegQuality` | `80` | JPEG quality ceiling for Preview/As… workflows (1–100). |
| `imageOptimizer.pngQuality` | `80` | PNG quality ceiling for Preview/As… workflows. |
| `imageOptimizer.webpQuality` | `80` | WebP / AVIF quality ceiling for Preview/As… workflows. |
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
