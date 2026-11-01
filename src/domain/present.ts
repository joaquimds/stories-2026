// For values the code knows are there (an index inside the array, a key
// just set). Fails loudly if that's ever wrong, instead of carrying on
// with undefined as a cast would.
export const present = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('Expected a value')
  }
  return value
}

export const last = <T>(items: readonly T[]): T => present(items.at(-1))
