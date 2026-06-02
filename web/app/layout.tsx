import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import '@vscode/codicons/dist/codicon.css'
import './globals.css'

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

const title = 'vscimg — compress images in your editor'
const description =
  'A VS Code extension that compresses images in place, right from the Explorer — lossy, TinyPNG-class compression that runs entirely on your machine. Coming soon to the VS Code Extension Marketplace. Try the live demo.'

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  )
}
