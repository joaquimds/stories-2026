import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

type Props = { label: string; value: string | undefined }

// Updates the `q` search param as the user types; also works as a plain
// GET form without JavaScript
export const SearchBox = ({ label, value }: Props) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState(value ?? '')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const apply = (q: string) =>
    navigate({
      to: '.',
      search: (prev: object) => ({
        ...prev,
        q: q.trim() || undefined,
        page: undefined,
        after: undefined,
        before: undefined,
      }),
      replace: true,
    })

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        clearTimeout(timer.current)
        void apply(query)
      }}
    >
      <label htmlFor="search">{label}</label>
      <input
        id="search"
        name="q"
        type="search"
        value={query}
        onChange={(e) => {
          const q = e.target.value
          setQuery(q)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => void apply(q), 300)
        }}
      />
    </form>
  )
}
