// Share images for stories: an SVG laid out here, with text wrapped using
// widths read from the font, then drawn to PNG by resvg
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { SITE_DESCRIPTION, SITE_TITLE } from '../../lib/site.ts'
import { type FontMetrics, fontMetrics, parseWoff, toSfnt } from './woff.ts'
import { wrapText } from './wrap.ts'
import { present } from '../../domain/present.ts'

export const WIDTH = 1200
export const HEIGHT = 630
const PADDING_X = 72
const COLORS = { text: '#333333', muted: '#666666', rule: '#ebebeb' }
const FAMILY = 'EB Garamond'
// Line widths ignore kerning, which can widen text by a percent or so
const WRAP_WIDTH = (WIDTH - 2 * PADDING_X) * 0.95

// The body sits between the header and footer
const BODY_TOP = 140
const BODY_BOTTOM = 500

const FONTS = {
  regular: 'eb-garamond-latin-400-normal.woff',
  bold: 'eb-garamond-latin-700-normal.woff',
  italic: 'eb-garamond-latin-400-italic.woff',
}

type Assets = {
  fontFiles: string[]
  metrics: Record<keyof typeof FONTS, FontMetrics>
  logo: string
}

let assets: Promise<Assets> | undefined

// Reads the fonts once: their widths for wrapping, and TTF copies for resvg,
// which can't load WOFF
const loadAssets = () => {
  assets ??= (async () => {
    const require = createRequire(import.meta.url)
    const dir = join(tmpdir(), 'tree-of-tales-fonts')
    await mkdir(dir, { recursive: true })
    const entries = await Promise.all(
      Object.entries(FONTS).map(async ([style, file]) => {
        const woff = parseWoff(
          await readFile(
            require.resolve(`@fontsource/eb-garamond/files/${file}`),
          ),
        )
        const path = join(dir, file.replace(/\.woff$/, '.ttf'))
        await writeFile(path, toSfnt(woff))
        return { style, path, metrics: fontMetrics(woff) }
      }),
    )
    const svg = await readFile(
      join(process.cwd(), 'public', 'tree.svg'),
      'utf8',
    )
    return {
      fontFiles: entries.map((e) => e.path),
      metrics: Object.fromEntries(
        entries.map((e) => [e.style, e.metrics]),
      ) as Assets['metrics'],
      logo: placeLogo(svg, { x: PADDING_X, y: 44, width: 96 }),
    }
  })()
  return assets
}

// The tree's drawing, moved and scaled into place by its viewBox
const placeLogo = (
  svg: string,
  { x, y, width }: { x: number; y: number; width: number },
) => {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number)
  const [minX = 0, minY = 0, boxWidth = 1] = viewBox ?? []
  const scale = width / boxWidth
  const inner = svg.slice(
    svg.indexOf('>', svg.indexOf('<svg')) + 1,
    svg.lastIndexOf('</svg>'),
  )
  return `<g transform="translate(${x - minX * scale} ${y - minY * scale}) scale(${scale})">${inner}</g>`
}

const measurer = (metrics: FontMetrics, size: number) => (text: string) => {
  let width = 0
  for (const char of text) {
    width += metrics.advance(present(char.codePointAt(0)))
  }
  return (width * size) / metrics.unitsPerEm
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

type Block = {
  lines: string[]
  size: number
  lineHeight: number
  weight?: number
  style?: string
  color?: string
}

// Lines of text, the first baseline `top` plus most of a line down
const textBlock = (block: Block, top: number) =>
  block.lines
    .map(
      (line, i) =>
        `<text x="${PADDING_X}" y="${(top + block.size * (0.95 + i * block.lineHeight)).toFixed(1)}" font-family="${FAMILY}" font-size="${block.size}" font-weight="${block.weight ?? 400}" font-style="${block.style ?? 'normal'}" fill="${block.color ?? COLORS.text}">${escapeXml(line)}</text>`,
    )
    .join('')

const blockHeight = (block: Block) =>
  block.lines.length ? block.size * block.lineHeight * block.lines.length : 0

export const renderStoryImage = async ({
  title,
  sentences,
}: {
  title: string | null
  sentences: string[]
}) => {
  const { fontFiles, metrics, logo } = await loadAssets()
  const bodyHeight = BODY_BOTTOM - BODY_TOP

  // Long titles get a smaller size; the text takes whatever room is left
  const titleSize = title && title.length > 40 ? 54 : 76
  const titleBlock: Block = {
    lines: title
      ? wrapText(title, measurer(metrics.bold, titleSize), WRAP_WIDTH, 2)
      : [],
    size: titleSize,
    lineHeight: 1.1,
    weight: 700,
  }
  const gap = title ? 24 : 0
  const textSize = title ? 40 : 54
  const textLineHeight = 1.35
  const textBlockLines = wrapText(
    sentences.join(' '),
    measurer(metrics.regular, textSize),
    WRAP_WIDTH,
    Math.max(
      1,
      Math.floor(
        (bodyHeight - blockHeight(titleBlock) - gap) /
          (textSize * textLineHeight),
      ),
    ),
  )
  const body: Block = {
    lines: textBlockLines,
    size: textSize,
    lineHeight: textLineHeight,
  }

  // Centre the title and text in the body
  const total = blockHeight(titleBlock) + gap + blockHeight(body)
  const top = BODY_TOP + Math.max(0, (bodyHeight - total) / 2)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="100%" height="100%" fill="#ffffff"/>
${logo}
<text x="${PADDING_X + 112}" y="93" font-family="${FAMILY}" font-size="34" fill="${COLORS.text}">${escapeXml(SITE_TITLE)}</text>
${textBlock(titleBlock, top)}
${textBlock(body, top + blockHeight(titleBlock) + gap)}
<rect x="${PADDING_X}" y="516" width="${WIDTH - 2 * PADDING_X}" height="2" fill="${COLORS.rule}"/>
<text x="${PADDING_X}" y="562" font-family="${FAMILY}" font-size="30" font-style="italic" fill="${COLORS.muted}">${escapeXml(SITE_DESCRIPTION)}</text>
</svg>`

  return new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: FAMILY },
  })
    .render()
    .asPng()
}
