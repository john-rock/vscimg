'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeToImageData, encodeImage, qualityApplies, type TargetFormat } from '@/lib/codec'
import { fmtBytes, type FileNode } from '@/lib/files'
import styles from './Explorer.module.css'

interface Props {
  node: FileNode
  blob: Blob
  onSave: (newSize: number) => void
  onClose: () => void
}

const DEFAULT_QUALITY = 80

export default function PreviewPanel({ node, blob, onSave, onClose }: Props) {
  const format = (node.format ?? 'jpeg') as TargetFormat
  const originalSize = node.size ?? blob.size

  const [image, setImage] = useState<ImageData | null>(null)
  const [quality, setQuality] = useState(DEFAULT_QUALITY)
  const [origUrl, setOrigUrl] = useState<string | null>(null)
  const [optUrl, setOptUrl] = useState<string | null>(null)
  const [optBytes, setOptBytes] = useState<number | null>(null)
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const optUrlRef = useRef<string | null>(null)
  const seqRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qDisabled = !qualityApplies(format)

  const setOptimized = useCallback((url: string | null, bytes: number | null) => {
    if (optUrlRef.current) URL.revokeObjectURL(optUrlRef.current)
    optUrlRef.current = url
    setOptUrl(url)
    setOptBytes(bytes)
  }, [])

  const runEncode = useCallback(
    async (img: ImageData, q: number) => {
      const cur = ++seqRef.current
      setBusy(true)
      setError(null)
      try {
        const { blob: out, bytes } = await encodeImage(img, format, q, true)
        if (cur !== seqRef.current) return
        setOptimized(URL.createObjectURL(out), bytes)
      } catch (e) {
        if (cur !== seqRef.current) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (cur === seqRef.current) setBusy(false)
      }
    },
    [format, setOptimized]
  )

  // Decode the source once, then run the initial preview.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const decoded = await decodeToImageData(blob)
        if (!alive) return
        setImage(decoded)
        void runEncode(decoded, DEFAULT_QUALITY)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Object URL for the original preview, recreated whenever the source blob
  // changes. Created in an effect (not a useRef initializer) so React
  // StrictMode's mount→cleanup→mount can't leave the <img> pointing at a URL
  // it already revoked.
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    setOrigUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  useEffect(() => {
    return () => {
      if (optUrlRef.current) URL.revokeObjectURL(optUrlRef.current)
    }
  }, [])

  const onQuality = (q: number) => {
    setQuality(q)
    if (!image || qDisabled) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void runEncode(image, q), 120)
  }

  const onSaveClick = async () => {
    if (!image) return
    setSaving(true)
    try {
      // Full effort for the file we actually write back, like the extension.
      const { bytes } = await encodeImage(image, format, quality, false)
      // Mirror imageOptimizer.skipIfLargerOrEqual: never write a file bigger
      // than the source. If re-encoding doesn't shrink it, keep the original.
      onSave(Math.min(bytes, originalSize))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  // The slider can request any quality, but the optimizer never makes a file
  // larger: if the encode is >= the original, we keep the original (skip rule),
  // so the reported size is clamped and savings can't go negative.
  const noWin = optBytes != null && optBytes >= originalSize
  const effectiveBytes = optBytes == null ? null : noWin ? originalSize : optBytes
  const savedPct =
    effectiveBytes != null && originalSize > 0
      ? Math.round((1 - effectiveBytes / originalSize) * 100)
      : null

  return (
    <div className={styles.preview}>
      <div className={styles.previewControls}>
        <div className={styles.sliderGroup}>
          <label htmlFor="pq">Quality</label>
          <input
            id="pq"
            type="range"
            min={1}
            max={100}
            value={quality}
            disabled={qDisabled || saving}
            onChange={(e) => onQuality(Number(e.target.value))}
          />
          <span className={styles.qval}>{quality}</span>
        </div>
        <button className={styles.saveBtn} disabled={busy || saving || !!error} onClick={onSaveClick}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {qDisabled && (
        <div className={styles.muted} style={{ marginBottom: 10, fontSize: 12 }}>
          PNG is optimized losslessly (oxipng) here — quality doesn’t apply. The extension also
          applies lossy palette quantization for bigger PNG wins.
        </div>
      )}

      <div className={styles.stats}>
        <span>
          Original: <strong>{fmtBytes(originalSize)}</strong>
        </span>
        <span>
          Optimized: <strong>{busy ? '…' : effectiveBytes != null ? fmtBytes(effectiveBytes) : '…'}</strong>
        </span>
        {error ? (
          <span className={`${styles.saved} ${styles.bad}`}>{error}</span>
        ) : busy ? (
          <span className={styles.saved}>—</span>
        ) : noWin ? (
          <span className={styles.saved}>no size win — keeping original</span>
        ) : savedPct != null ? (
          <span className={`${styles.saved} ${styles.good}`}>−{savedPct}% smaller</span>
        ) : (
          <span className={styles.saved}>—</span>
        )}
      </div>

      <div className={styles.compare}>
        <div className={styles.pane}>
          <h4>Original</h4>
          <div className={styles.imgwrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {origUrl && <img src={origUrl} alt="original" />}
          </div>
        </div>
        <div className={styles.pane}>
          <h4>Optimized</h4>
          <div className={styles.imgwrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* When the encode is no smaller, we keep the original — so show it. */}
            {(noWin ? origUrl : optUrl) && (
              <img className={busy ? styles.busy : ''} src={(noWin ? origUrl : optUrl)!} alt="optimized" />
            )}
          </div>
        </div>
      </div>

      <button className={styles.closeLink} onClick={onClose}>
        Close preview
      </button>
    </div>
  )
}
