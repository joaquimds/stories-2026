// A thread is the public name of a path through the sentence graph.
//
// It is the leaf sentence id followed by the non-default steps taken while
// walking back towards the beginning, in leaf-to-root order. A step `from-to`
// means "at sentence `from`, go back to `to` instead of the default parent".
// Default parents always point to older sentences, so walking back always
// terminates.

export type Step = { from: number; to: number }
export type ParsedThread = { leaf: number; steps: Step[] }

export type ThreadGraph = {
  // undefined when the sentence does not exist, null for a beginning
  defaultParent: (sentenceId: number) => number | null | undefined
  hasLink: (fromSentenceId: number, toSentenceId: number) => boolean
}

// The root sentence: the parent of every beginning. Its thread is the home page.
export const ROOT_ID = 0
export const ROOT_THREAD = '0'

const ID = '(0|[1-9]\\d*)'
export const THREAD_PATTERN = new RegExp(`^${ID}(\\.${ID}-${ID})*$`)

// The URL of a story: its slug if titled, else its thread
export const permalink = (thread: string, slug?: string | null) =>
  thread === ROOT_THREAD && !slug ? '/' : `/s/${slug ?? thread}`

// Guards against pathological threads; far beyond any real story
export const MAX_THREAD_LENGTH = 10_000

export const isThread = (value: string) => THREAD_PATTERN.test(value)

const toId = (value: string) => {
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export const parseThread = (thread: string): ParsedThread | null => {
  if (!isThread(thread)) {
    return null
  }
  const [leafPart = '', ...stepParts] = thread.split('.')
  const leaf = toId(leafPart)
  if (leaf === null) {
    return null
  }
  const steps: Step[] = []
  for (const part of stepParts) {
    const [fromPart = '', toPart = ''] = part.split('-')
    const from = toId(fromPart)
    const to = toId(toPart)
    if (from === null || to === null) {
      return null
    }
    steps.push({ from, to })
  }
  return { leaf, steps }
}

export const formatThread = ({ leaf, steps }: ParsedThread) =>
  [String(leaf), ...steps.map(({ from, to }) => `${from}-${to}`)].join('.')

// Returns the sentence ids of the thread, root to leaf, or null if the
// thread is invalid or not canonical (a step that matches the default parent).
export const decodeThread = (
  thread: string | ParsedThread,
  graph: ThreadGraph,
): number[] | null => {
  const parsed = typeof thread === 'string' ? parseThread(thread) : thread
  if (!parsed) {
    return null
  }
  const ids: number[] = []
  let current: number | null = parsed.leaf
  let stepIndex = 0
  while (current !== null) {
    if (ids.length >= MAX_THREAD_LENGTH) {
      return null
    }
    const defaultParent = graph.defaultParent(current)
    if (defaultParent === undefined) {
      return null
    }
    ids.push(current)
    const step = parsed.steps[stepIndex]
    if (step && step.from === current) {
      if (step.to === defaultParent || !graph.hasLink(step.to, step.from)) {
        return null
      }
      stepIndex++
      current = step.to
    } else {
      current = defaultParent
    }
  }
  if (stepIndex !== parsed.steps.length) {
    return null
  }
  return ids.reverse()
}

export const encodeSteps = (
  sentenceIds: number[],
  defaultParent: (sentenceId: number) => number | null | undefined,
): ParsedThread => {
  const leaf = sentenceIds.at(-1)
  if (leaf === undefined) {
    throw new Error('Cannot encode an empty thread')
  }
  if (defaultParent(sentenceIds[0] ?? leaf) !== null) {
    throw new Error('A thread must start at a beginning')
  }
  const steps: Step[] = []
  for (let i = sentenceIds.length - 1; i > 0; i--) {
    const from = sentenceIds[i] as number
    const to = sentenceIds[i - 1] as number
    if (defaultParent(from) !== to) {
      steps.push({ from, to })
    }
  }
  return { leaf, steps }
}

export const encodeThread = (
  sentenceIds: number[],
  defaultParent: (sentenceId: number) => number | null | undefined,
) => formatThread(encodeSteps(sentenceIds, defaultParent))
