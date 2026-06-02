import * as path from 'path'
import * as vscode from 'vscode'
import { isSupported, optimize, type OptimizeOptions } from './optimize'

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
    )
  )
}

export function deactivate(): void {
  // nothing to clean up
}

function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration('imageOptimizer')
  return {
    jpegQuality: c.get('jpegQuality', 80),
    pngQuality: c.get('pngQuality', 80),
    webpQuality: c.get('webpQuality', 80),
    skipIfLargerOrEqual: c.get('skipIfLargerOrEqual', true),
    minSavingsPercent: c.get('minSavingsPercent', 0),
  }
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
  const results = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Optimizing images',
      cancellable: true,
    },
    async (progress, token) => {
      const out: Result[] = []
      let done = 0
      for (const uri of targets) {
        if (token.isCancellationRequested) break
        progress.report({
          message: `${++done}/${targets.length} — ${path.basename(uri.fsPath)}`,
          increment: 100 / targets.length,
        })
        out.push(await optimizeOne(uri, settings, destOverride))
      }
      return out
    }
  )

  report(results)
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
    const optimized = await optimize(Buffer.from(data), ext, settings)
    const after = optimized.byteLength
    const overwritingSelf = dest.fsPath === uri.fsPath

    // Skip rules apply only to true in-place overwrites, never to "As…".
    if (overwritingSelf) {
      const savings = before > 0 ? ((before - after) / before) * 100 : 0
      if (settings.skipIfLargerOrEqual && after >= before) {
        return { uri, before, after, written: false }
      }
      if (savings < settings.minSavingsPercent) {
        return { uri, before, after, written: false }
      }
    }

    await vscode.workspace.fs.writeFile(dest, optimized)
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

function report(results: Result[]): void {
  const errors = results.filter((r) => r.error)
  const written = results.filter((r) => r.written)
  const skipped = results.filter((r) => !r.written && !r.error)

  if (written.length === 1 && errors.length === 0) {
    const r = written[0]
    void vscode.window.showInformationMessage(
      `${path.basename(r.uri.fsPath)}: ${fmt(r.before)} → ${fmt(r.after)} (−${pct(r.before, r.after)}%)`
    )
  } else if (written.length > 0) {
    const totalBefore = written.reduce((s, r) => s + r.before, 0)
    const totalAfter = written.reduce((s, r) => s + r.after, 0)
    void vscode.window.showInformationMessage(
      `Optimized ${written.length} image${written.length > 1 ? 's' : ''}: ` +
        `${fmt(totalBefore)} → ${fmt(totalAfter)} (−${pct(totalBefore, totalAfter)}%)` +
        (skipped.length ? `, ${skipped.length} skipped` : '') +
        (errors.length ? `, ${errors.length} failed` : '')
    )
  } else if (errors.length === 0) {
    void vscode.window.showInformationMessage(
      `Image Optimizer: nothing written (${skipped.length} already optimal).`
    )
  }

  if (errors.length) {
    void vscode.window.showErrorMessage(
      `Image Optimizer: ${errors.length} failed. First error: ${errors[0].error}`
    )
  }
}
