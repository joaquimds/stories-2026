// Greedy word wrapping for text drawn in SVG, which doesn't wrap by itself

const ELLIPSIS = '…'

export type Measure = (text: string) => number

// Splits text into lines no wider than `maxWidth`, breaking words only when
// one is wider than a whole line. Beyond `maxLines`, the last line is cut
// short with an ellipsis.
export const wrapText = (
  text: string,
  measure: Measure,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) {
      lines.push(line)
    }
    // A word too long for any line is broken by characters
    let rest = word
    while (measure(rest) > maxWidth) {
      let fit = 1
      while (fit < rest.length && measure(rest.slice(0, fit + 1)) <= maxWidth) {
        fit++
      }
      lines.push(rest.slice(0, fit))
      rest = rest.slice(fit)
    }
    line = rest
  }
  if (line) {
    lines.push(line)
  }
  const kept = lines.filter(Boolean)
  if (kept.length <= maxLines) {
    return kept
  }
  // Trim the last line that fits until the ellipsis does too
  let last = kept[maxLines - 1] as string
  while (last && measure(`${last}${ELLIPSIS}`) > maxWidth) {
    last = last.includes(' ')
      ? last.slice(0, last.lastIndexOf(' '))
      : last.slice(0, -1)
  }
  return [
    ...kept.slice(0, maxLines - 1),
    `${last.replace(/[\s,;:]+$/, '')}${ELLIPSIS}`,
  ]
}
