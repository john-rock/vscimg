import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // This app lives in a subfolder of the extension repo, which has its own
  // lockfile. Pin the workspace root so Turbopack doesn't infer the parent.
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
