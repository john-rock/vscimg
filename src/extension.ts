import * as path from 'path'
import * as vscode from 'vscode'
import { isSupported, optimize, type OptimizeOptions } from './optimize'
import { isPreviewable, openPreview } from './preview'

interface Result {
  uri: vscode.Uri
  before: number
  after: number
  written: boolean
  error?: string
}

interface Settings extends OptimizeOptions {
  skipIfLargerOrEqual: boolean
  minSavingsPercent: number
  notificationSeconds: number
}

let output: vscode.OutputChannel | undefined

function channel(): vscode.OutputChannel {
  if (!output) {
    output = vscode.window.createOutputChannel('Image Optimizer')
  }
  return output
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'imageOptimizer.optimize',
      (clicked?: vscode.Uri, selected?: vscode.Uri[]) =>
        run(clicked, selected, false)
    ),
    vscode.commands.registerCommand(
      'imageOptimizer.optimizeAs',
      (clicked?: vscode.Uri, selected?: vscode.Uri[]) =>
        run(clicked, selected, true)
    ),
    vscode.commands.registerCommand(
      'imageOptimizer.preview',
      (clicked?: vscode.Uri, selected?: vscode.Uri[]) =>
        runPreview(clicked, selected)
    )
  )
}

export function deactivate(): void {
  output?.dispose()
}

function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration('imageOptimizer')
  return {
    jpegQuality: c.get('jpegQuality', 80),
    pngQuality: c.get('pngQuality', 80),
    webpQuality: c.get('webpQuality', 80),
    skipIfLargerOrEqual: c.get('skipIfLargerOrEqual', true),
    minSavingsPercent: c.get('minSavingsPercent', 0),
    notificationSeconds: c.get('notificationSeconds', 5),
  }
}

/** Resolves after `ms`, or immediately if the token is cancelled. */
function delay(ms: number, token: vscode.CancellationToken): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    token.onCancellationRequested(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Show a result as a progress notification held open for `seconds`, then
 * auto-dismissed. This is the only way to get an auto-hiding toast with a
 * caller-controlled duration — plain messages use a fixed short timeout and
 * messages with buttons never auto-hide. Cancellable so it can be dismissed early.
 */
async function autoHideToast(message: string, seconds: number): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Image Optimizer',
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message })
      await delay(Math.max(1, seconds) * 1000, token)
    }
  )
}

async function collectImages(uri: vscode.Uri): Promise<vscode.Uri[]> {
  const stat = await vscode.workspace.fs.stat(uri)
  if (stat.type === vscode.FileType.Directory) {
    const out: vscode.Uri[] = []
    for (const [name, type] of await vscode.workspace.fs.readDirectory(uri)) {
      const child = vscode.Uri.joinPath(uri, name)
      if (type === vscode.FileType.Directory) {
        out.push(...(await collectImages(child)))
      } else if (isSupported(path.extname(name))) {
        out.push(child)
      }
    }
    return out
  }
  return isSupported(path.extname(uri.fsPath)) ? [uri] : []
}

async function run(
  clicked: vscode.Uri | undefined,
  selected: vscode.Uri[] | undefined,
  asNew: boolean
): Promise<void> {
  const roots =
    selected && selected.length > 0 ? selected : clicked ? [clicked] : []
  if (roots.length === 0) {
    void vscode.window.showWarningMessage(
      'Image Optimizer: no file or folder selected.'
    )
    return
  }

  // Expand folders into a flat, de-duplicated list of image files.
  const seen = new Set<string>()
  const targets: vscode.Uri[] = []
  for (const root of roots) {
    for (const img of await collectImages(root)) {
      if (!seen.has(img.fsPath)) {
        seen.add(img.fsPath)
        targets.push(img)
      }
    }
  }

  if (targets.length === 0) {
    void vscode.window.showInformationMessage(
      'Image Optimizer: no supported images found.'
    )
    return
  }

  let destOverride: vscode.Uri | undefined
  if (asNew) {
    if (targets.length !== 1) {
      void vscode.window.showWarningMessage(
        'Image Optimizer: "Optimize Image As…" works on a single image at a time.'
      )
      return
    }
    const src = targets[0]
    const name = await vscode.window.showInputBox({
      prompt: 'New file name (the extension you type sets the output format)',
      value: path.basename(src.fsPath),
      validateInput: (v) =>
        isSupported(path.extname(v))
          ? undefined
          : 'Name must end in a supported image extension (.png, .jpg, .webp, .avif, …)',
    })
    if (!name) return
    destOverride = vscode.Uri.file(path.join(path.dirname(src.fsPath), name))
  }

  const settings = readSettings()
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Image Optimizer',
      cancellable: true,
    },
    async (progress, token) => {
      const out: Result[] = []
      let done = 0
      for (const uri of targets) {
        if (token.isCancellationRequested) break
        progress.report({
          message: `Optimizing ${++done}/${targets.length} — ${path.basename(uri.fsPath)}`,
          increment: 100 / targets.length,
        })
        out.push(await optimizeOne(uri, settings, destOverride))
      }

      logResults(out)
      // Hold the same toast open showing the summary, then let it auto-hide —
      // no second notification, so nothing flashes.
      if (!token.isCancellationRequested) {
        progress.report({ message: summarize(out), increment: 0 })
        await delay(Math.max(1, settings.notificationSeconds) * 1000, token)
      }
      return out
    }
  )
}

async function runPreview(
  clicked: vscode.Uri | undefined,
  selected: vscode.Uri[] | undefined
): Promise<void> {
  const uri = clicked ?? (selected && selected[0])
  if (!uri) {
    void vscode.window.showWarningMessage(
      'Image Optimizer: no image selected.'
    )
    return
  }
  if (!isPreviewable(path.extname(uri.fsPath))) {
    void vscode.window.showWarningMessage(
      `Image Optimizer: preview isn't available for ${path.extname(uri.fsPath)} files. Use "Optimize Image" instead.`
    )
    return
  }

  const settings = readSettings()
  await openPreview(uri, settings, (savedUri, before, after) => {
    channel().appendLine(
      `[preview] ${savedUri.fsPath}: ${fmt(before)} -> ${fmt(after)} (-${pct(before, after)}%)`
    )
    void autoHideToast(
      `${path.basename(savedUri.fsPath)}: ${fmt(before)} → ${fmt(after)} (−${pct(before, after)}%)`,
      settings.notificationSeconds
    )
  })
}

async function optimizeOne(
  uri: vscode.Uri,
  settings: Settings,
  destOverride: vscode.Uri | undefined
): Promise<Result> {
  try {
    const data = await vscode.workspace.fs.readFile(uri)
    const before = data.byteLength
    const dest = destOverride ?? uri
    const ext = path.extname(dest.fsPath)
    const optimized = await optimize(Buffer.from(data), ext, settings, false, 0.8)
    const payload = optimized.byteLength < before ? optimized : data
    const after = payload.byteLength
    await vscode.workspace.fs.writeFile(dest, payload)
    return { uri: dest, before, after, written: true }
  } catch (e) {
    return {
      uri,
      before: 0,
      after: 0,
      written: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function pct(before: number, after: number): number {
  return before > 0 ? Math.round(((before - after) / before) * 100) : 0
}

/** Append a per-file breakdown to the Output ▸ Image Optimizer channel. */
function logResults(results: Result[]): void {
  const c = channel()
  const written = results.filter((r) => r.written)
  c.appendLine(
    `[${new Date().toLocaleTimeString()}] optimized ${written.length}/${results.length}`
  )
  for (const r of results) {
    if (r.error) {
      c.appendLine(`  ✗ ${r.uri.fsPath} — ${r.error}`)
    } else if (r.written) {
      c.appendLine(
        `  ✓ ${path.basename(r.uri.fsPath)}: ${fmt(r.before)} -> ${fmt(r.after)} (-${pct(r.before, r.after)}%)`
      )
    } else {
      c.appendLine(`  – ${path.basename(r.uri.fsPath)}: skipped (no size win)`)
    }
  }
}

/** One-line summary for the auto-hiding result toast. */
function summarize(results: Result[]): string {
  const errors = results.filter((r) => r.error)
  const written = results.filter((r) => r.written)
  const skipped = results.filter((r) => !r.written && !r.error)

  if (written.length === 1 && errors.length === 0) {
    const r = written[0]
    return `${path.basename(r.uri.fsPath)}: ${fmt(r.before)} → ${fmt(r.after)} (−${pct(r.before, r.after)}%)`
  }
  if (written.length > 0) {
    const totalBefore = written.reduce((s, r) => s + r.before, 0)
    const totalAfter = written.reduce((s, r) => s + r.after, 0)
    return (
      `Optimized ${written.length} images: ` +
      `${fmt(totalBefore)} → ${fmt(totalAfter)} (−${pct(totalBefore, totalAfter)}%)` +
      (skipped.length ? `, ${skipped.length} skipped` : '') +
      (errors.length ? `, ${errors.length} failed` : '')
    )
  }
  if (errors.length > 0) {
    return `${errors.length} image${errors.length > 1 ? 's' : ''} failed — see Output ▸ Image Optimizer`
  }
  return `Nothing written (${skipped.length} already optimal)`
}
