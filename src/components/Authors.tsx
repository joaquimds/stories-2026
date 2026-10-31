// "By X, Y and Z", most prolific first, ties in order of appearance
export const Authors = ({
  authors,
  className,
}: {
  authors: ({ name: string } | null)[]
  className?: string
}) => {
  const counts = new Map<string, { count: number; first: number }>()
  authors.forEach((author, i) => {
    if (author) {
      const entry = counts.get(author.name) ?? { count: 0, first: i }
      entry.count++
      counts.set(author.name, entry)
    }
  })
  const names = [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
    .map(([name]) => name)
  if (!names.length) {
    return null
  }
  const last = names.pop()
  return (
    <p className={className}>
      By {names.length ? `${names.join(', ')} and ${last}` : last}
    </p>
  )
}
