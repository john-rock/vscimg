const esbuild = require('esbuild')

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts', 'src/worker.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outdir: 'dist',
    // `vscode` is provided by the host; `wasm-vips` must stay external so its
    // .wasm files are loadable at runtime from node_modules.
    external: ['vscode', 'wasm-vips'],
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
  })

  if (watch) {
    await ctx.watch()
    console.log('[esbuild] watching…')
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
