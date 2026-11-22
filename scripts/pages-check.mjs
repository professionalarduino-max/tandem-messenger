/**
 * Проверка опубликованной версии: открывает сайт на GitHub Pages, ловит ошибки консоли
 * и сетевые сбои, убеждается, что экран входа отрисовался и маршрут по прямой ссылке работает.
 *
 *   node scripts/pages-check.mjs [url]
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'https://professionalarduino-max.github.io/tandem-messenger/').replace(/\/?$/, '/')

const errors = []
const failed = []

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('requestfailed', (r) => failed.push(`${r.url()} — ${r.failure()?.errorText}`))

const ok = (name, cond, extra = '') =>
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)

await page.goto(BASE, { waitUntil: 'networkidle' })
const title = await page.title()
ok('страница открылась', title === 'Tandem', title)
ok('экран входа отрисован', await page.getByRole('button', { name: /войти/i }).isVisible())
ok('ассеты загрузились с базовым путём', await page.locator('script[src*="/tandem-messenger/assets/"]').count() > 0)

const sw = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration()
  return r ? r.scope : null
})
ok('service worker зарегистрирован', sw?.endsWith('/tandem-messenger/'), sw ?? 'нет')

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]').href
  const r = await fetch(href)
  const m = await r.json()
  return { icon: new URL(m.icons[0].src, href).pathname, start: new URL(m.start_url, href).pathname }
})
ok('манифест ведёт в подпапку', manifest.icon === '/tandem-messenger/icon-192.png', manifest.icon)
ok('start_url в подпапке', manifest.start === '/tandem-messenger/', manifest.start)

// ключ и адрес проекта берём из самой сборки — заодно проверяем, что они туда попали
const bundle = await page.locator('script[type=module]').first().getAttribute('src')
const code = await (await fetch(new URL(bundle, BASE))).text()
const projectUrl = code.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0]
const anon = code.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
ok('адрес проекта в сборке', Boolean(projectUrl), projectUrl)

const health = await page.evaluate(
  async ([url, key]) => (await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })).status,
  [projectUrl, anon],
)
ok('Supabase отвечает с этого домена', health === 200, `HTTP ${health}`)

ok('нет ошибок в консоли', errors.length === 0, errors.join(' | '))
ok('нет упавших запросов', failed.length === 0, failed.join(' | '))

// прямая ссылка на чат: Pages отдаёт 404.html (сам код ответа 404 — так и задумано),
// приложение должно подняться и увести на вход
await page.goto(`${BASE}c/00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' })
ok('прямая ссылка поднимает приложение', await page.getByRole('button', { name: /войти/i }).isVisible())

await browser.close()
