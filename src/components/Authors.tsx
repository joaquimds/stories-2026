import { Link } from '@tanstack/react-router'

// "By X, Y and Z", most prolific first, ties in order of appearance; each
// name links to the writer's page
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
  return (
    <p className={className}>
      By{' '}
      {names.map((name, i) => (
        <span key={name}>
          {i === 0 ? '' : i === names.length - 1 ? ' and ' : ', '}
          <AuthorLink name={name} />
        </span>
      ))}
    </p>
  )
}

export const AuthorLink = ({ name }: { name: string }) => (
  <Link to="/w/$name" params={{ name }}>
    {name}
  </Link>
)
