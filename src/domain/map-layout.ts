// Positions for a tree drawn left to right: each leaf gets its own row,
// each parent sits midway between its first and last child, and depth
// sets the column.

export type TreeNode = { key: string; parent: string | null }

export type Layout = {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
}

export const layoutTree = (
  nodes: TreeNode[],
  { column, row }: { column: number; row: number },
): Layout => {
  const children = new Map<string, string[]>()
  let root: string | undefined
  for (const node of nodes) {
    if (node.parent === null) {
      root = node.key
    } else {
      children.set(node.parent, [
        ...(children.get(node.parent) ?? []),
        node.key,
      ])
    }
  }
  const positions = new Map<string, { x: number; y: number }>()
  if (root === undefined) {
    return { positions, width: 0, height: 0 }
  }
  let rows = 0
  let depthMax = 0
  // Iterative post-order, so deep trees can't overflow the stack
  const stack: { key: string; depth: number; visited: boolean }[] = [
    { key: root, depth: 0, visited: false },
  ]
  while (stack.length) {
    const entry = stack.pop() as (typeof stack)[number]
    const kids = children.get(entry.key) ?? []
    depthMax = Math.max(depthMax, entry.depth)
    if (!kids.length) {
      positions.set(entry.key, { x: entry.depth * column, y: rows++ * row })
      continue
    }
    if (!entry.visited) {
      stack.push({ ...entry, visited: true })
      for (const kid of [...kids].reverse()) {
        stack.push({ key: kid, depth: entry.depth + 1, visited: false })
      }
      continue
    }
    const first = positions.get(kids[0] as string)!
    const last = positions.get(kids.at(-1) as string)!
    positions.set(entry.key, {
      x: entry.depth * column,
      y: (first.y + last.y) / 2,
    })
  }
  return {
    positions,
    width: depthMax * column,
    height: Math.max(0, rows - 1) * row,
  }
}
