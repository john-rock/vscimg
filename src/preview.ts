import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { optimize, type OptimizeOptions } from './optimize'

const PREVIEWABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])

export function isPreviewable(ext: string): boolean {
  return PREVIEWABLE.has(ext.toLowerCase())
}

export interface PreviewDefaults extends OptimizeOptions {
  skipIfLargerOrEqual: boolean
  minSavingsPercent: number
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.avif':
      return 'image/avif'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

function qualityOpts(q: number): OptimizeOptions {
  return { jpegQuality: q, pngQuality: q, webpQuality: q }
}

function defaultQualityFor(ext: string, d: PreviewDefaults): number {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return d.jpegQuality
    case '.png':
      return d.pngQuality
    case '.webp':
    case '.avif':
      return d.webpQuality
    default:
      return 80
  }
}

/**
 * Open a webview that previews the image at an adjustable quality and
 * writes the result in place on Save. The host owns sharp; the webview
 * only displays data URIs and posts slider/save events back.
 */
export async function openPreview(
  uri: vscode.Uri,
  defaults: PreviewDefaults,
  onSaved: (savedUri: vscode.Uri, before: number, after: number) => void
): Promise<void> {
  const ext = path.extname(uri.fsPath)
  const mime = mimeFor(ext)
  const originalBuf = await fs.readFile(uri.fsPath)
  const originalSize = originalBuf.byteLength
  const initialQuality = defaultQualityFor(ext, defaults)
  const isGif = ext.toLowerCase() === '.gif'

  const panel = vscode.window.createWebviewPanel(
    'imageOptimizerPreview',
    `Optimize: ${path.basename(uri.fsPath)}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  )

  panel.webview.html = getHtml(panel.webview, {
    name: path.basename(uri.fsPath),
    originalDataUri: `data:${mime};base64,${originalBuf.toString('base64')}`,
    originalSize,
    initialQuality,
    isGif,
  })

  panel.webview.onDidReceiveMessage(async (msg: { type: string; quality?: number; seq?: number }) => {
    if (msg.type === 'encode' && typeof msg.quality === 'number') {
      try {
        // `fast` keeps the slider responsive; the saved file re-encodes at full effort.
        const buf = await optimize(originalBuf, ext, qualityOpts(msg.quality), true)
        void panel.webview.postMessage({
          type: 'encoded',
          seq: msg.seq,
          dataUri: `data:${mime};base64,${buf.toString('base64')}`,
          size: buf.byteLength,
        })
      } catch (e) {
        void panel.webview.postMessage({
          type: 'error',
          seq: msg.seq,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    } else if (msg.type === 'save' && typeof msg.quality === 'number') {
      try {
        // Re-encode at full effort for the file we actually write — and
        // bypass skip rules: saving from preview is an explicit choice.
        const buf = await optimize(originalBuf, ext, qualityOpts(msg.quality), false)
        await fs.writeFile(uri.fsPath, buf)
        onSaved(uri, originalSize, buf.byteLength)
        panel.dispose()
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Image Optimizer: save failed — ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }
  })
}

function getNonce(): string {
  let text = ''
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return text
}

function getHtml(
  webview: vscode.Webview,
  data: {
    name: string
    originalDataUri: string
    originalSize: number
    initialQuality: number
    isGif: boolean
  }
): string {
  const nonce = getNonce()
  // CSP must allow data: images or the preview renders blank.
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 12px 16px;
  }
  .controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
  .slider-group { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 220px; }
  input[type=range] { flex: 1; accent-color: var(--vscode-button-background); }
  .qval { font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }
  button {
    font-family: inherit; font-size: 13px; padding: 5px 14px; border: none; border-radius: 2px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  .stats { display: flex; gap: 18px; margin-bottom: 12px; font-size: 13px; font-variant-numeric: tabular-nums; }
  .stats .saved { font-weight: 600; }
  .saved.good { color: var(--vscode-charts-green, #89d185); }
  .saved.bad { color: var(--vscode-charts-red, #f48771); }
  .muted { color: var(--vscode-descriptionForeground); }
  .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .pane { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .pane h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em; }
  .imgwrap {
    background-image:
      linear-gradient(45deg, rgba(128,128,128,0.18) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(128,128,128,0.18) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.18) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.18) 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 3px; display: flex; align-items: center; justify-content: center; min-height: 120px;
  }
  img { max-width: 100%; max-height: 65vh; display: block; object-fit: contain; }
  .busy { opacity: 0.55; transition: opacity 0.1s; }
</style>
</head>
<body>
  <div class="controls">
    <div class="slider-group">
      <label for="q">Quality</label>
      <input id="q" type="range" min="1" max="100" value="${data.initialQuality}" ${data.isGif ? 'disabled' : ''} />
      <span class="qval" id="qval">${data.initialQuality}</span>
    </div>
    <button id="save" disabled>Save</button>
  </div>
  ${data.isGif ? `<div class="muted" style="margin-bottom:10px;">GIF size is not affected by quality; saving simply re-optimizes the file.</div>` : ''}
  <div class="stats">
    <span>Original: <strong id="origSize">…</strong></span>
    <span>Optimized: <strong id="optSize">…</strong></span>
    <span class="saved muted" id="saved">—</span>
  </div>
  <div class="compare">
    <div class="pane">
      <h3>Original</h3>
      <div class="imgwrap"><img id="origImg" alt="original" /></div>
    </div>
    <div class="pane">
      <h3>Optimized</h3>
      <div class="imgwrap"><img id="optImg" alt="optimized" /></div>
    </div>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const ORIGINAL = ${JSON.stringify(data.originalDataUri)};
  const ORIGINAL_SIZE = ${data.originalSize};

  const q = document.getElementById('q');
  const qval = document.getElementById('qval');
  const saveBtn = document.getElementById('save');
  const origImg = document.getElementById('origImg');
  const optImg = document.getElementById('optImg');
  const origSizeEl = document.getElementById('origSize');
  const optSizeEl = document.getElementById('optSize');
  const savedEl = document.getElementById('saved');

  origImg.src = ORIGINAL;
  origSizeEl.textContent = fmt(ORIGINAL_SIZE);

  let seq = 0;          // generation counter — discard stale encode responses
  let timer = null;

  function fmt(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  function requestEncode() {
    const cur = ++seq;
    optImg.classList.add('busy');
    optSizeEl.textContent = '…';
    vscode.postMessage({ type: 'encode', quality: Number(q.value), seq: cur });
  }

  function debouncedEncode() {
    qval.textContent = q.value;
    clearTimeout(timer);
    timer = setTimeout(requestEncode, 120);
  }

  q.addEventListener('input', debouncedEncode);

  saveBtn.addEventListener('click', () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    vscode.postMessage({ type: 'save', quality: Number(q.value) });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'encoded') {
      if (msg.seq !== seq) return;   // a newer request superseded this one
      optImg.src = msg.dataUri;
      optImg.classList.remove('busy');
      optSizeEl.textContent = fmt(msg.size);
      const pct = ORIGINAL_SIZE > 0 ? Math.round((1 - msg.size / ORIGINAL_SIZE) * 100) : 0;
      savedEl.textContent = (pct >= 0 ? '−' : '+') + Math.abs(pct) + '% ' + (pct >= 0 ? 'smaller' : 'larger');
      savedEl.className = 'saved ' + (pct > 0 ? 'good' : 'bad');
      saveBtn.disabled = false;
    } else if (msg.type === 'error') {
      if (msg.seq !== seq) return;
      optImg.classList.remove('busy');
      optSizeEl.textContent = 'error';
      savedEl.textContent = msg.message;
      savedEl.className = 'saved bad';
    }
  });

  // Initial preview.
  requestEncode();
</script>
</body>
</html>`
}
