import Explorer from '@/components/Explorer'
import styles from './page.module.css'

const REPO = 'https://github.com/john-rock/vsimg'
const RELEASES = 'https://github.com/john-rock/vsimg/releases'
const VERSION = '0.3.0'

const FEATURES: { title: string; body: string; soon?: boolean }[] = [
  {
    title: 'Six formats',
    body: 'JPEG, PNG, WebP, AVIF, TIFF, and GIF — mozjpeg for JPEG, libimagequant palette quantization for PNG, plus modern WebP and AVIF.',
  },
  {
    title: 'Right from the Explorer',
    body: 'Right-click an image, a multi-selection, or a whole folder. Folders recurse and optimize every supported image inside.',
  },
  {
    title: 'Live quality preview',
    body: 'A quality slider with a side-by-side before/after and real-time size and savings — re-encoded as you drag.',
  },
  {
    title: 'Smart skip rules',
    body: 'Keep the original when there’s no size win, or only overwrite when savings clear a threshold you set.',
  },
  {
    title: 'Optimize As…',
    body: 'Re-encode a single image to a new name or a different format, bypassing the skip rules when you ask for it explicitly.',
    soon: true,
  },
  {
    title: '100% local',
    body: 'Images never leave your machine — no upload, no service, no round-trip. The encoder runs in-process via sharp.',
  },
]

export default function Page() {
  return (
    <main className={styles.main}>
      <nav className={styles.nav}>
        <a href="#top" className={styles.brand}>
          vscimg
        </a>
        <div className={styles.navLinks}>
          <a href="#demo">Demo</a>
          <a href="#features">Features</a>
          <a href="#install">Install</a>
          <a href={REPO}>GitHub</a>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero} id="top">
        <div className={styles.tag}>VS Code extension</div>
        <h1>Compress images in place, right from your editor.</h1>
        <p className={styles.lede}>
          Lossy, TinyPNG-class image compression — <strong>without the round-trip</strong>.
          Right-click an image in the Explorer and it’s re-encoded on the spot. Everything runs
          locally; your images never leave your machine. Coming soon to the VS Code Extension
          Marketplace.
        </p>
        <div className={styles.cta}>
          <span className={`${styles.btn} ${styles.btnPrimary}`}>Marketplace coming soon</span>
          <a className={styles.btn} href="#demo">
            Try the live demo ↓
          </a>
        </div>
      </section>

      {/* Live demo */}
      <section id="demo">
        <h2 className={styles.sectionHead}>Live demo — runs entirely in your browser</h2>
        <Explorer />
      </section>

      {/* Features */}
      <section id="features">
        <h2 className={styles.sectionHead}>What it does</h2>
        <div className={styles.grid}>
          {FEATURES.map((f) => (
            <div className={styles.cell} key={f.title}>
              <h3>
                {f.title}
                {f.soon && <span className={styles.comingSoon}>Coming soon</span>}
              </h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Install / quickstart */}
      <section id="install">
        <h2 className={styles.sectionHead}>Install &amp; use</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <h3>1. Install</h3>
            <p>
              The extension is coming soon to the VS Code Extension Marketplace. Installation will
              be available there once it launches.
            </p>
          </div>
          <div className={styles.step}>
            <h3>2. Run a command</h3>
            <p>Right-click in the Explorer, or open the Command Palette:</p>
            <code className={styles.code}>
              <span className={styles.cmdName}>Optimize Image</span>
              {`            — re-encode & overwrite in place (file, selection, or folder)\n`}
              <span className={styles.cmdName}>Optimize Image: Preview</span>
              {`    — open the quality slider before saving\n`}
              <span className={styles.cmdName}>Optimize Image As…</span>
              {`         — re-encode to a new name or format`}
            </code>
          </div>
          <div className={styles.step}>
            <h3>3. Tune it (settings.json)</h3>
            <p>Per-format quality and skip rules:</p>
            <code className={styles.code}>{`{
  "imageOptimizer.jpegQuality": 80,
  "imageOptimizer.pngQuality": 80,
  "imageOptimizer.webpQuality": 80,
  "imageOptimizer.skipIfLargerOrEqual": true,
  "imageOptimizer.minSavingsPercent": 0,
  "imageOptimizer.notificationSeconds": 5
}`}</code>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how">
        <h2 className={styles.sectionHead}>How it works</h2>
        <div className={styles.prose}>
          <p>
            In the editor the encoder is <a href="https://sharp.pixelplumbing.com/">sharp</a>:
            mozjpeg for JPEG, libimagequant palette quantization for PNG (the lossy step that gives
            TinyPNG-class savings), plus WebP, AVIF, TIFF and GIF.<br />It runs in-process, so files are
            re-encoded locally and overwritten in place — no service, no upload.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>vscimg · v{VERSION} · MIT</span>
        <span>
          <a href={REPO}>GitHub</a> · <a href={RELEASES}>Releases</a>
        </span>
      </footer>
    </main>
  )
}
