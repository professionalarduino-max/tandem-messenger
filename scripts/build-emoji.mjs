/**
 * Генератор src/lib/emoji.ts — полного набора эмодзи для панели в поле ввода.
 *
 * Источники:
 *   • unicode.org/Public/emoji/16.0/emoji-test.txt — сам набор, порядок и группы;
 *   • CLDR (unicode-org/cldr-json) — русские названия, по ним работает поиск.
 *
 * Берём только fully-qualified символы, выбрасываем компоненты (модификаторы тона кожи)
 * и варианты с тоном кожи: в палитре они дают тысячи почти одинаковых кнопок.
 *
 * Запуск:  node scripts/build-emoji.mjs
 * Результат коммитится в репозиторий, в сборке скрипт не участвует.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CACHE = join(ROOT, 'node_modules', '.cache', 'emoji')

const SOURCES = {
  test: 'https://unicode.org/Public/emoji/16.0/emoji-test.txt',
  ru: 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/ru/annotations.json',
  ruDerived:
    'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/ru/annotations.json',
}

/** Английские названия групп из emoji-test.txt → вкладки палитры. */
const GROUPS = {
  'Smileys & Emotion': { id: 'smileys', title: 'Смайлики', icon: '😀' },
  'People & Body': { id: 'people', title: 'Люди', icon: '🧑' },
  'Animals & Nature': { id: 'nature', title: 'Природа', icon: '🐶' },
  'Food & Drink': { id: 'food', title: 'Еда', icon: '🍔' },
  'Travel & Places': { id: 'travel', title: 'Путешествия', icon: '🚗' },
  Activities: { id: 'activities', title: 'Занятия', icon: '⚽' },
  Objects: { id: 'objects', title: 'Предметы', icon: '💡' },
  Symbols: { id: 'symbols', title: 'Символы', icon: '🔣' },
  Flags: { id: 'flags', title: 'Флаги', icon: '🏁' },
}

async function fetchCached(name, url) {
  const file = join(CACHE, name)
  if (existsSync(file)) return readFile(file, 'utf8')
  process.stdout.write(`скачиваем ${url}\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  const text = await res.text()
  await mkdir(CACHE, { recursive: true })
  await writeFile(file, text)
  return text
}

const [testFile, ruFile, ruDerivedFile] = await Promise.all([
  fetchCached('emoji-test.txt', SOURCES.test),
  fetchCached('ru.json', SOURCES.ru),
  fetchCached('ru-derived.json', SOURCES.ruDerived),
])

const names = new Map()
for (const file of [ruFile, ruDerivedFile]) {
  const parsed = JSON.parse(file)
  const table = parsed.annotations?.annotations ?? parsed.annotationsDerived?.annotations ?? {}
  for (const [char, value] of Object.entries(table)) {
    const tts = value.tts?.[0]
    if (tts && !names.has(char)) names.set(char, tts)
  }
}

const groups = new Map()
let current = null

for (const line of testFile.split('\n')) {
  const groupLine = line.match(/^# group: (.+)$/)
  if (groupLine) {
    current = GROUPS[groupLine[1].trim()] ?? null
    if (current && !groups.has(current.id)) groups.set(current.id, { ...current, items: [] })
    continue
  }
  if (!current || line.startsWith('#') || !line.includes('; fully-qualified')) continue

  const char = line.match(/#\s(\S+)\s/)?.[1]
  if (!char) continue

  const english = line.slice(line.indexOf('#') + 1).replace(/^\s*\S+\s+E\d+\.\d+\s*/, '').trim()
  // CLDR хранит часть символов без «украшающего» U+FE0F, поэтому пробуем оба написания
  const name = names.get(char) ?? names.get(char.replace(/️/g, '')) ?? english
  // варианты с тоном кожи — это те же символы, в палитре они только мешают
  if (/тон кожи|skin tone/i.test(name)) continue

  groups.get(current.id).items.push([char, name.toLowerCase()])
}

const seen = new Set()
let total = 0
const blocks = [...groups.values()].map((g) => {
  const items = g.items.filter(([char]) => !seen.has(char) && seen.add(char))
  total += items.length
  const raw = items.map(([char, name]) => `${char} ${name}`).join('|')
  return `  {\n    id: '${g.id}',\n    title: '${g.title}',\n    icon: '${g.icon}',\n    raw: '${raw.replace(/'/g, "\\'")}',\n  },`
})

const out = `/**
 * Полный набор эмодзи с русскими названиями — данные для палитры в поле ввода.
 * Файл создан скриптом scripts/build-emoji.mjs по данным Unicode ${SOURCES.test.match(/emoji\/([\d.]+)\//)[1]} и CLDR,
 * руками его не правят: запустите \`node scripts/build-emoji.mjs\` заново.
 *
 * Символы лежат одной строкой на группу («эмодзи имя|эмодзи имя|…») — так файл
 * в несколько раз меньше массива объектов, а разбор при загрузке занимает доли миллисекунды.
 * Всего символов: ${total}.
 */

export interface EmojiItem {
  char: string
  /** русское название, по нему ищет строка поиска */
  name: string
}

export interface EmojiGroup {
  id: string
  title: string
  /** символ для вкладки */
  icon: string
  items: EmojiItem[]
}

const RAW: { id: string; title: string; icon: string; raw: string }[] = [
${blocks.join('\n')}
]

export const EMOJI_GROUPS: EmojiGroup[] = RAW.map((g) => ({
  id: g.id,
  title: g.title,
  icon: g.icon,
  items: g.raw.split('|').map((pair) => {
    const space = pair.indexOf(' ')
    return { char: pair.slice(0, space), name: pair.slice(space + 1) }
  }),
}))

export const EMOJI_TOTAL = ${total}

/** Все символы подряд — для поиска. */
export const EMOJI_ALL: EmojiItem[] = EMOJI_GROUPS.flatMap((g) => g.items)
`

await writeFile(join(ROOT, 'src', 'lib', 'emoji.ts'), out)
process.stdout.write(`src/lib/emoji.ts: ${total} символов в ${groups.size} группах\n`)
