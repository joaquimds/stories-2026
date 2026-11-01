// For values the code knows are there (an index inside the array, a key
// just set). Fails loudly if that's ever wrong, instead of carrying on
// with undefined or null as a cast would.
export const present = <T>(value: T | null | undefined): T => {
  if (value === undefined || value === null) {
    throw new Error('Expected a value')
  }
  return value
}

export const last = <T>(items: readonly T[]): T => present(items.at(-1))
