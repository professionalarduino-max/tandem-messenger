// Проверка интерфейса в настоящем браузере: вход → каталог групп → отправка сообщения.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const EMAIL = process.env.TEST_EMAIL ?? 'abdev2013@gmail.com'
const PASSWORD = process.env.TEST_PASSWORD
if (!PASSWORD) throw new Error('Передайте TEST_PASSWORD в переменных окружения')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByPlaceholder('you@gmail.com').fill(EMAIL)
await page.getByPlaceholder('••••••••').fill(PASSWORD)
await page.getByRole('button', { name: 'Войти' }).click()

await page.getByText('@ABDev').waitFor({ timeout: 15000 })
console.log('  OK   вход выполнен, профиль ABDev загружен')

await page.getByRole('button', { name: 'Группы' }).click()
await page.getByText('# Общий чат').waitFor({ timeout: 10000 })
console.log('  OK   группа видна в общем каталоге')

await page.getByText('# Общий чат').click()
await page.getByPlaceholder(/Сообщение/).waitFor({ timeout: 10000 })
const text = `Проверка связи ${new Date().toLocaleTimeString('ru-RU')}`
await page.getByPlaceholder(/Сообщение/).fill(text)
await page.keyboard.press('Enter')
await page.getByText(text).waitFor({ timeout: 10000 })
console.log('  OK   сообщение отправлено и отрисовано в ленте')

await page.reload({ waitUntil: 'networkidle' })
await page.getByText(text).waitFor({ timeout: 15000 })
console.log('  OK   после перезагрузки сессия и история на месте')

await page.screenshot({ path: 'screenshot.png', fullPage: false })
console.log('  OK   скриншот сохранён: tandem/screenshot.png')

await browser.close()

if (errors.length) {
  console.log('\nОшибки в консоли браузера:')
  errors.forEach((e) => console.log('  ' + e))
  process.exit(1)
}
console.log('\nИНТЕРФЕЙС РАБОТАЕТ')
