'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Tree, type NodeRendererProps } from 'react-arborist'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { decodeToImageData, encodeImage, type TargetFormat } from '@/lib/codec'
import { fmtBytes, iconFor, INITIAL_TREE, mapTree, type FileNode } from '@/lib/files'
import PreviewPanel from './PreviewPanel'
import styles from './Explorer.module.css'

const DEFAULT_QUALITY = 80
const SKIP_IF_LARGER = true // mirrors imageOptimizer.skipIfLargerOrEqual default
const TOAST_MS = 5000 // mirrors imageOptimizer.notificationSeconds default (5)

interface Toast {
  id: number
  text: string
  kind: 'good' | 'bad' | 'info'
}

export default function Explorer() {
  const [tree, setTree] = useState<FileNode[]>(INITIAL_TREE)
  const [preview, setPreview] = useState<FileNode | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ready, setReady] = useState(false)

  const blobs = useRef(new Map<string, Blob>())
  const toastId = useRef(0)

  const pushToast = useCallback((text: string, kind: Toast['kind']) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS)
  }, [])

  const setSize = useCallback((id: string, size: number, optimized: boolean) => {
    setTree((prev) => mapTree(prev, (n) => (n.id === id ? { ...n, size, optimized } : n)))
  }, [])

  // Preload the sample images so the tree shows real sizes and actions are instant.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const targets: FileNode[] = []
      const walk = (nodes: FileNode[]) =>
        nodes.forEach((n) => (n.children ? walk(n.children) : n.optimizable && targets.push(n)))
      walk(INITIAL_TREE)
      await Promise.all(
        targets.map(async (n) => {
          try {
            const blob = await (await fetch(n.src!)).blob()
            if (!alive) return
            blobs.current.set(n.id, blob)
            setTree((prev) => mapTree(prev, (x) => (x.id === n.id ? { ...x, size: blob.size } : x)))
          } catch {
            /* ignore — leaves size as "…" */
          }
        })
      )
      if (alive) setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const optimizeInPlace = useCallback(
    async (node: FileNode) => {
      const blob = blobs.current.get(node.id)
      if (!blob) return
      const format = node.format as TargetFormat
      const origSize = node.size ?? blob.size
      try {
        const image = await decodeToImageData(blob)
        const { blob: out, bytes } = await encodeImage(image, format, DEFAULT_QUALITY, false)
        if (SKIP_IF_LARGER && bytes >= origSize) {
          pushToast(`${node.name}: already optimal — kept original (no size win)`, 'info')
          return
        }
        blobs.current.set(node.id, out)
        setSize(node.id, bytes, true)
        const pct = Math.round((1 - bytes / origSize) * 100)
        pushToast(`${node.name}: ${fmtBytes(origSize)} → ${fmtBytes(bytes)} (−${pct}%)`, 'good')
      } catch (e) {
        pushToast(`${node.name}: failed — ${e instanceof Error ? e.message : String(e)}`, 'bad')
      }
    },
    [pushToast, setSize]
  )

  // ---- node renderer + per-image context menu ----
  function Node({ node, style }: NodeRendererProps<FileNode>) {
    const data = node.data
    const isFolder = !!data.children
    const row = (
      <div
        className={`${styles.row} ${node.isSelected ? styles.rowSelected : ''}`}
        style={style}
        onClick={() => {
          node.select()
          if (isFolder) node.toggle()
          else if (data.optimizable) setPreview(data)
        }}
      >
        <span className={styles.chevron}>
          {isFolder && (
            <i className={`codicon codicon-chevron-${node.isOpen ? 'down' : 'right'}`} />
          )}
        </span>
        <i
          className={`codicon codicon-${iconFor({ ...data, optimized: isFolder ? node.isOpen : data.optimized })}`}
        />
        <span className={styles.name}>{data.name}</span>
        {data.optimizable && <span className={styles.size}>{fmtBytes(data.size)}</span>}
      </div>
    )

    if (!data.optimizable) return row

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{row}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={styles.menu} alignOffset={4}>
            <ContextMenu.Item className={styles.menuItem} onSelect={() => optimizeInPlace(data)}>
              Optimize Image
            </ContextMenu.Item>
            <ContextMenu.Item className={styles.menuItem} onSelect={() => setPreview(data)}>
              Optimize Image: Preview…
            </ContextMenu.Item>
            <ContextMenu.Separator className={styles.menuSep} />
            <ContextMenu.Item className={styles.menuItem} disabled>
              Optimize Image As…
              <span className={styles.comingSoon}>Coming soon</span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    )
  }

  const previewBlob = preview ? blobs.current.get(preview.id) : undefined

  return (
    <div className={styles.window}>
      <div className={styles.titlebar}>
        <span className={styles.dots}>
          <span /> <span /> <span />
        </span>
        <span className={styles.title}>my-project — Visual Studio Code</span>
        <span style={{ width: 52 }} />
      </div>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHead}>Explorer</div>
          <Tree
            data={tree}
            openByDefault={false}
            initialOpenState={{ assets: true }}
            width="100%"
            height={400}
            rowHeight={26}
            indent={14}
            disableDrag
            disableDrop
            disableMultiSelection
          >
            {Node}
          </Tree>
        </aside>

        <main className={styles.editor}>
          {preview && previewBlob ? (
            <>
              <div className={styles.tabs}>
                <span className={styles.tab}>
                  <i className="codicon codicon-file-media" /> Optimize: {preview.name}
                  <i
                    className={`codicon codicon-close ${styles.tabClose}`}
                    onClick={() => setPreview(null)}
                  />
                </span>
              </div>
              <PreviewPanel
                key={preview.id}
                node={preview}
                blob={previewBlob}
                onSave={(bytes) => {
                  setSize(preview.id, bytes, true)
                  pushToast(`${preview.name}: saved (${fmtBytes(bytes)})`, 'good')
                  setPreview(null)
                }}
                onClose={() => setPreview(null)}
              />
            </>
          ) : (
            <div className={styles.welcome}>
              <p className={styles.kbd}>
                <i className="codicon codicon-inspect" /> Right-click any image in the tree
              </p>
              <p className={styles.muted}>
                {ready ? 'Try' : 'Loading samples…'} <code>Optimize Image</code> to compress it in
                place, or <code>Preview…</code> for the quality slider. Everything runs in your
                browser — nothing is uploaded.
              </p>
            </div>
          )}
        </main>
      </div>

      <div className={styles.toasts}>
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
            <i
              className={`codicon codicon-${t.kind === 'bad' ? 'error' : t.kind === 'good' ? 'check' : 'info'}`}
            />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
