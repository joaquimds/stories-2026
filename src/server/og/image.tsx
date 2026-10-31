// Share images for stories, laid out with Satori and drawn with resvg
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { SITE_DESCRIPTION, SITE_TITLE } from '../../lib/site.ts'

export const WIDTH = 1200
export const HEIGHT = 630
const PADDING_X = 72
const PADDING_Y = 56

const require = createRequire(import.meta.url)

const font = (file: string) =>
  readFile(require.resolve(`@fontsource/eb-garamond/files/${file}`))

let assets:
  | Promise<{ fonts: Parameters<typeof satori>[1]['fonts']; logo: string }>
  | undefined

// Loaded once, on first use
const loadAssets = () => {
  assets ??= (async () => {
    const [regular, bold, italic, svg] = await Promise.all([
      font('eb-garamond-latin-400-normal.woff'),
      font('eb-garamond-latin-700-normal.woff'),
      font('eb-garamond-latin-400-italic.woff'),
      readFile(join(process.cwd(), 'public', 'tree.svg'), 'utf8'),
    ])
    return {
      fonts: [
        { name: 'EB Garamond', data: regular, weight: 400, style: 'normal' },
        { name: 'EB Garamond', data: bold, weight: 700, style: 'normal' },
        { name: 'EB Garamond', data: italic, weight: 400, style: 'italic' },
      ],
      logo: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    }
  })()
  return assets
}

// Whole sentences up to about `max` characters, then an ellipsis
export const excerpt = (sentences: string[], max = 220) => {
  let text = ''
  for (const sentence of sentences) {
    const next = text ? `${text} ${sentence}` : sentence
    if (next.length > max) {
      return text ? `${text} …` : `${sentence.slice(0, max).trimEnd()}…`
    }
    text = next
  }
  return text
}

export const renderStoryImage = async ({
  title,
  sentences,
}: {
  title: string | null
  sentences: string[]
}) => {
  const { fonts, logo } = await loadAssets()
  // Long titles take more room, leaving less for the text
  const longTitle = (title?.length ?? 0) > 40
  const text = excerpt(sentences, title ? (longTitle ? 110 : 160) : 200)
  const svg = await satori(
    <div
      // Satori adds padding to the size, so subtract it
      style={{
        width: WIDTH - 2 * PADDING_X,
        height: HEIGHT - 2 * PADDING_Y,
        display: 'flex',
        flexDirection: 'column',
        padding: `${PADDING_Y}px ${PADDING_X}px`,
        background: '#ffffff',
        color: '#333333',
        fontFamily: 'EB Garamond',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 34 }}>
        <img src={logo} width={96} height={72} style={{ marginRight: 16 }} />
        {SITE_TITLE}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        {title ? (
          <div
            style={{
              fontSize: longTitle ? 54 : 76,
              fontWeight: 700,
              lineHeight: 1.1,
              marginBottom: 24,
            }}
          >
            {title}
          </div>
        ) : null}
        <div style={{ fontSize: title ? 40 : 54, lineHeight: 1.35 }}>
          {text}
        </div>
      </div>
      <div
        style={{
          borderTop: '2px solid #ebebeb',
          paddingTop: 20,
          fontSize: 30,
          fontStyle: 'italic',
          color: '#666666',
        }}
      >
        {SITE_DESCRIPTION}
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT, fonts },
  )
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
    .render()
    .asPng()
}
