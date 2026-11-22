// Проверка новых частей интерфейса: каталог людей, админ-панель и векторные иконки.
// Запуск: TEST_PASSWORD=… node scripts/admin-check.mjs   (нужен поднятый dev-сервер)
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const EMAIL = process.env.TEST_EMAIL ?? 'abdev2013@gmail.com'
const PASSWORD = process.env.TEST_PASSWORD
if (!PASSWORD) throw new Error('Передайте TEST_PASSWORD в переменных окружения')

// Значки, которыми интерфейс рисовался до перехода на SVG. Ищем именно их:
// любые другие эмодзи на странице — это текст людей (имена, сообщения, реакции), трогать его нельзя.
const LEGACY = ['←', '🔍', '⚙', '✕', '📌', '📎', '🎤', '⏳', '➤', '↩', '✎', '🗑', '💬', '🙂', '▶', '❚']
const strayEmoji = (text) => LEGACY.filter((c) => text.includes(c))

const results = []
const ok = (name, extra = '') => results.push(['OK  ', name, extra])
const fail = (name, extra = '') => results.push(['FAIL', name, extra])

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('input[type=email]').first().fill(EMAIL)
  await page.locator('input[type=password]').first().fill(PASSWORD)
  await page.getByRole('button', { name: /войти/i }).first().click()
  await page.waitForSelector('text=Чаты', { timeout: 20000 })
  ok('вход выполнен')

  // ===== каталог людей =====
  await page.getByRole('button', { name: /^Люди$/ }).click()
  // ждём не подсказку, а загруженный список: пока запрос в пути, там честный ноль
  await page.waitForFunction(
    () => /Все, кто пользуется .+ — [1-9]/.test(document.body.innerText),
    undefined,
    { timeout: 15000 },
  )
  const hint = (await page.locator('text=/Все, кто пользуется/').first().textContent())?.trim()
  ok('каталог показывает всех', hint)

  const svgInShell = await page.locator('svg').count()
  svgInShell > 5 ? ok('иконки нарисованы', `${svgInShell} svg`) : fail('иконок мало', String(svgInShell))

  const shellStray = strayEmoji(await page.locator('body').innerText())
  shellStray.length === 0
    ? ok('в оболочке нет старых значков')
    : fail('старые значки в оболочке', shellStray.join(' '))

  // ===== админ-панель =====
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Админ-панель', { timeout: 20000 })
  await page.waitForSelector('text=Сообщения за две недели', { timeout: 20000 })
  for (const block of [
    'Люди',
    'Что пишут',
    'Капсулы времени',
    'Самые активные',
    'Живые группы',
    'Новые пользователи',
  ]) {
    const seen = await page.locator(`text=${block}`).first().isVisible().catch(() => false)
    seen ? ok(`блок «${block}»`) : fail(`блок «${block}»`)
  }
  const cards = (await page.locator('section').first().innerText()).replace(/\n/g, ' ')
  ok('главные цифры', cards.slice(0, 140))

  const bars = await page.locator('[title*=":"]').count()
  bars >= 14 ? ok('график за 14 дней', `${bars} столбиков`) : fail('график', `${bars} столбиков`)

  // ===== чат: иконки в шапке и в поле ввода =====
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.locator('a[href*="/c/"]').first().click()
  await page.waitForTimeout(2500)

  const titles = () =>
    page.locator('button[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))
  const idle = await titles()
  const missing = ['Прикрепить файл', 'Записать голосовое', 'Поиск по чату', 'Капсула времени'].filter(
    (w) => !idle.some((t) => t.includes(w)),
  )
  missing.length === 0 ? ok('кнопки ввода на месте') : fail('нет кнопок', missing.join(', '))

  await page.locator('textarea').last().fill('проверка иконок')
  await page.waitForTimeout(300)
  ;(await titles()).some((t) => t.includes('Отправить'))
    ? ok('кнопка отправки появляется с текстом')
    : fail('кнопка отправки')
  await page.locator('textarea').last().fill('')

  const chatStray = strayEmoji(await page.locator('body').innerText())
  chatStray.length === 0 ? ok('в чате нет старых значков') : fail('старые значки в чате', chatStray.join(' '))

  errors.length === 0 ? ok('без ошибок в консоли') : fail('ошибки', errors.slice(0, 3).join(' | '))
} catch (e) {
  fail('исключение', String(e).slice(0, 300))
} finally {
  await browser.close()
}

for (const [status, name, extra] of results) console.log(`  ${status} ${name}${extra ? ` — ${extra}` : ''}`)
const bad = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - bad} из ${results.length} проверок зелёные`)
process.exit(bad ? 1 : 0)
