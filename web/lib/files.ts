import type { TargetFormat } from './codec'

// A node in the simulated VS Code explorer. Folders have `children`; leaves are
// files. Image leaves carry a public `src` and are `optimizable`.
export interface FileNode {
  id: string
  name: string
  children?: FileNode[]
  src?: string
  format?: TargetFormat
  optimizable?: boolean
  size?: number // bytes; populated at runtime once the blob is fetched
  optimized?: boolean
}

const img = (name: string, format: TargetFormat): FileNode => ({
  id: `assets/${name}`,
  name,
  src: `/samples/${name}`,
  format,
  optimizable: true,
})

const plain = (id: string, name: string): FileNode => ({ id, name })

// Initial project tree shown in the demo explorer.
export const INITIAL_TREE: FileNode[] = [
  {
    id: 'assets',
    name: 'assets',
    children: [
      img('photo.jpg', 'jpeg'),
      img('banner.jpg', 'jpeg'),
      img('avatar.jpg', 'jpeg'),
      img('texture.webp', 'webp'),
      {
        id: 'assets/ui',
        name: 'ui',
        children: [img('screenshot.png', 'png')],
      },
    ],
  },
  {
    id: 'src',
    name: 'src',
    children: [plain('src/index.ts', 'index.ts'), plain('src/app.tsx', 'app.tsx')],
  },
  plain('package.json', 'package.json'),
  plain('README.md', 'README.md'),
]

export function fmtBytes(b: number | undefined): string {
  if (b == null) return '…'
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(2) + ' MB'
}

/** Codicon glyph name for a file, based on extension. */
export function iconFor(node: FileNode): string {
  if (node.children) return node.optimized ? 'folder-opened' : 'folder'
  if (node.optimizable) return 'file-media'
  if (node.name.endsWith('.json')) return 'json'
  if (node.name.endsWith('.md')) return 'markdown'
  if (/\.(ts|tsx|js|jsx)$/.test(node.name)) return 'file-code'
  return 'file'
}

/** Immutably map over every node in a tree, returning a new tree. */
export function mapTree(nodes: FileNode[], fn: (n: FileNode) => FileNode): FileNode[] {
  return nodes.map((n) => {
    const mapped = fn(n)
    if (mapped.children) return { ...mapped, children: mapTree(mapped.children, fn) }
    return mapped
  })
}

/** Insert a new node as a sibling immediately after the node with `afterId`. */
export function insertSibling(nodes: FileNode[], afterId: string, node: FileNode): FileNode[] {
  const out: FileNode[] = []
  for (const n of nodes) {
    const next = n.children ? { ...n, children: insertSibling(n.children, afterId, node) } : n
    out.push(next)
    if (n.id === afterId) out.push(node)
  }
  return out
}
