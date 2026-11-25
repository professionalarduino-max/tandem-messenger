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
    'Премиум-эмодзи',
    'Блокировки по IP',
    'Антимат',
    'Боты',
    'Живые группы и каналы',
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

  // ===== карточка профиля по клику на аватарку =====
  const cardTitle = page.getByRole('heading', { name: 'Профиль' })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Люди$/ }).click()
  await page.waitForFunction(
    () => /Все, кто пользуется .+ — [1-9]/.test(document.body.innerText),
    undefined,
    { timeout: 15000 },
  )
  // карточка — единственное всплывающее окно на экране, по нему и опознаём
  const card = page.locator('div[class*="z-[60]"]')
  // в каталоге есть и своя строка — ищем первого человека, который не я
  const avatars = page.locator('button[title="Открыть профиль"]')
  const people = await avatars.count()
  let stranger = false
  for (let i = 0; i < people && !stranger; i++) {
    await avatars.nth(i).click()
    await cardTitle.waitFor({ timeout: 10000 })
    // ждём не окно, а загруженные данные: пока карточка в пути, в ней только «Загружаем профиль…»
    await card.locator('button[title="Скопировать юзернейм"]').first().waitFor({ timeout: 10000 })
    stranger = !(await card.getByText(/^вы$/).first().isVisible().catch(() => false))
    if (!stranger) {
      await page.keyboard.press('Escape')
      await cardTitle.waitFor({ state: 'hidden', timeout: 5000 })
    }
  }
  stranger ? ok('карточка открывается кликом по аватарке') : fail('карточка чужого профиля')

  const handle = (await card.locator('button[title="Скопировать юзернейм"]').first().innerText()).trim()
  ;/^@\S+/.test(handle) ? ok('в карточке юзернейм с собакой', handle) : fail('юзернейм в карточке', handle)

  const stats = await card.locator('text=/сообщений|реакций|групп/').count()
  stats >= 3 ? ok('в карточке счётчики человека') : fail('счётчики в карточке', String(stats))
  ;(await card.getByRole('button', { name: /^Написать$/ }).isVisible().catch(() => false))
    ? ok('из карточки можно написать человеку')
    : fail('кнопка «Написать»')

  // ===== бан, мут и остальные рычаги админа =====
  await card.getByRole('button', { name: /Действия админа/ }).click()
  const levers = [/Заблокировать|Разблокировать/, /Сделать админом|Снять админа/, /Стереть сообщения/]
  const noLever = []
  for (const re of levers) {
    const seen = await card.getByRole('button', { name: re }).first().isVisible().catch(() => false)
    if (!seen) noLever.push(String(re))
  }
  noLever.length === 0 ? ok('бан, права и очистка на месте') : fail('нет рычагов', noLever.join(' '))

  const mutes = ['15 минут', 'час', 'сутки', 'неделю']
  const noMute = []
  for (const m of mutes) {
    const seen = await card
      .getByRole('button', { name: m, exact: true })
      .first()
      .isVisible()
      .catch(() => false)
    if (!seen) noMute.push(m)
  }
  noMute.length === 0 ? ok('сроки мута на выбор', mutes.join(', ')) : fail('нет сроков мута', noMute.join(', '))

  await page.keyboard.press('Escape')
  await cardTitle.waitFor({ state: 'hidden', timeout: 5000 })
  ok('карточка закрывается по Escape')

  await page.locator('button[title="Мой профиль"]').click()
  await cardTitle.waitFor({ timeout: 10000 })
  await card.locator('button[title="Скопировать юзернейм"]').first().waitFor({ timeout: 10000 })
  const self =
    (await card.getByRole('button', { name: /Редактировать профиль/ }).isVisible().catch(() => false)) &&
    !(await card.getByRole('button', { name: /Действия админа/ }).isVisible().catch(() => false))
  self ? ok('свою карточку админ не модерирует') : fail('своя карточка')
  await page.keyboard.press('Escape')
  await cardTitle.waitFor({ state: 'hidden', timeout: 5000 })

  // ===== главный чат всегда в закрепе =====
  await page.getByRole('button', { name: /^Чаты$/ }).click()
  await page.waitForTimeout(800)
  const firstRow = (await page.locator('a[href*="/c/"]').first().innerText()).replace(/\s+/g, ' ')
  ;/Общий чат/.test(firstRow) ? ok('главный чат первым в списке', firstRow.slice(0, 32)) : fail('порядок чатов', firstRow.slice(0, 60))
  ;(await page.getByRole('img', { name: 'Главный чат' }).first().isVisible().catch(() => false))
    ? ok('у главного чата значок закрепления')
    : fail('значок закрепления')

  // ===== @упоминания в поле ввода =====
  await page.locator('a[href*="/c/"]').first().click()
  await page.waitForSelector('textarea', { timeout: 15000 })
  const composer = page.locator('textarea').last()
  await composer.fill('@')
  const suggestions = page.locator('div.absolute.bottom-full button')
  await suggestions.first().waitFor({ timeout: 10000 })
  ok('подсказка @упоминаний появляется', `${await suggestions.count()} человек`)
  await suggestions.first().click()
  const typed = await composer.inputValue()
  ;/^@\S+ $/.test(typed) ? ok('юзернейм подставляется в текст', typed.trim()) : fail('подстановка', typed)
  await composer.fill('')

  // ===== пригласительные ссылки =====
  await page.locator('button[title="Настройки группы"]').first().click()
  await page.getByRole('button', { name: /^Ссылки$/ }).click()
  await page.getByText('Новая ссылка').waitFor({ timeout: 10000 })
  ;(await page.getByRole('button', { name: /Создать и скопировать/ }).isVisible().catch(() => false))
    ? ok('вкладка «Ссылки» готова выдавать приглашения')
    : fail('вкладка «Ссылки»')
  await page.locator('button[title="Закрыть"]').last().click()

  // ===== закрепить чат у всех (кнопку только проверяем, нажимать нельзя — это видно всем) =====
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Каталог$/ }).click()
  const catalog = page.locator('button[title="Открыть группу"], button[title="Открыть канал"]')
  await catalog.first().waitFor({ timeout: 15000 })
  ok('каталог отдаёт группы и каналы', `${await catalog.count()} строк`)
  let opened = ''
  for (let i = 0; i < (await catalog.count()); i++) {
    const label = (await catalog.nth(i).innerText()).replace(/\s+/g, ' ').trim()
    if (label.includes('Общий чат')) continue
    await catalog.nth(i).click()
    opened = label.split(' · ')[0].slice(0, 40)
    break
  }
  await page.waitForSelector('textarea', { timeout: 15000 })
  ;(await page
    .locator('button[title="Закрепить у всех"], button[title="Открепить у всех"]')
    .first()
    .isVisible()
    .catch(() => false))
    ? ok('главный админ закрепляет чат у всех', opened)
    : fail('кнопка «Закрепить у всех»', opened)

  // ===== боковая панель по кнопке «три линии» =====
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('button[title="Меню"]').first().click()
  const drawer = page.locator('div[class*="z-[70]"]')
  await drawer.waitFor({ timeout: 10000 })
  const drawerItems = [
    'Новая группа',
    'Новый канал',
    'Чаты',
    'Группы и каналы',
    'Люди',
    'Боты',
    'Что нового',
    'Настройки',
    'Выйти',
  ]
  const noItem = []
  for (const name of drawerItems) {
    // у «Чатов» рядом может висеть счётчик непрочитанного, поэтому сверяем начало названия
    const seen = await drawer
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .isVisible()
      .catch(() => false)
    if (!seen) noItem.push(name)
  }
  noItem.length === 0 ? ok('в панели всё как в телеграме', drawerItems.length + ' пунктов') : fail('нет пунктов', noItem.join(', '))
  ;(await drawer.getByRole('button', { name: /^Админ-панель/ }).isVisible().catch(() => false))
    ? ok('главному админу видна админ-панель в меню')
    : fail('админ-панель в меню')

  // ===== создание канала =====
  await drawer.getByRole('button', { name: /^Новый канал/ }).click()
  await page.getByRole('heading', { name: 'Новый канал' }).waitFor({ timeout: 10000 })
  const bothTypes =
    (await page.getByRole('button', { name: 'Группа', exact: true }).isVisible().catch(() => false)) &&
    (await page.getByRole('button', { name: 'Канал', exact: true }).isVisible().catch(() => false))
  bothTypes ? ok('в окне создания есть и группа, и канал') : fail('переключатель типа')
  await page.getByRole('button', { name: 'Группа', exact: true }).click()
  ;(await page.getByRole('heading', { name: 'Новая группа' }).isVisible().catch(() => false))
    ? ok('переключатель меняет заголовок окна')
    : fail('заголовок окна')
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()

  // ===== расширенные настройки группы =====
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.locator('a[href*="/c/"]').first().click()
  await page.waitForSelector('textarea', { timeout: 15000 })
  await page.locator('button[title="Настройки группы"]').first().click()
  await page.getByRole('button', { name: /^Правила$/ }).click()
  const rules = [
    'Кто может писать',
    'Медленный режим',
    'Показывать в каталоге',
    'История видна всем',
    'Реакции',
    'Антимат',
  ]
  const noRule = []
  for (const r of rules) {
    const seen = await page.getByText(r, { exact: true }).first().isVisible().catch(() => false)
    if (!seen) noRule.push(r)
  }
  noRule.length === 0 ? ok('настройки группы на месте', rules.length + ' переключателей') : fail('нет настроек', noRule.join(', '))

  // список участников: отсюда боту выдают админку, без неё он не закрепляет сообщения
  await page.getByRole('button', { name: /^(Участники|Подписчики) · \d+/ }).click()
  const memberRows = page.locator('text=/^@[A-Za-z0-9_]+ · /')
  await memberRows.first().waitFor({ timeout: 10000 }).catch(() => {})
  const members = await memberRows.count()
  members > 0 ? ok('список участников загрузился', `${members} человек`) : fail('участники не загрузились')
  ;(await page.getByRole('button', { name: /^в админы$/ }).first().isVisible().catch(() => false))
    ? ok('любого участника, включая бота, можно сделать админом чата')
    : fail('нет кнопки «в админы»')
  await page.locator('button[title="Закрыть"]').last().click()

  // ===== эмодзи из поля ввода =====
  await page.locator('button[title="Эмодзи"]').first().click()
  const emojiSearch = page.locator('input[placeholder^="Поиск среди"]')
  await emojiSearch.waitFor({ timeout: 10000 })
  const totalHint = (await emojiSearch.getAttribute('placeholder')) ?? ''
  ;/\d{4}/.test(totalHint) ? ok('палитра со всеми эмодзи', totalHint) : fail('счётчик эмодзи', totalHint)
  // статус премиума приезжает отдельным запросом — полке нужно мгновение
  const shelf = page.getByText(/Премиум открыт/).first()
  await shelf.waitFor({ timeout: 10000 }).catch(() => {})
  ;(await shelf.isVisible().catch(() => false))
    ? ok('полка премиум-эмодзи открыта главному админу', (await shelf.innerText()).slice(0, 48))
    : fail('премиум-полка')
  await emojiSearch.fill('улыб')
  const emojiGrid = page.locator('div.grid.grid-cols-8 button')
  await emojiGrid.first().waitFor({ timeout: 10000 })
  ok('поиск по русским названиям работает', `${await emojiGrid.count()} символов`)
  await emojiGrid.first().click()
  const withEmoji = await page.locator('textarea').last().inputValue()
  withEmoji.length > 0 ? ok('эмодзи попадает в поле ввода', withEmoji) : fail('вставка эмодзи')
  await page.locator('textarea').last().fill('')
  await page.keyboard.press('Escape')

  // ===== сводка модерации в админке =====
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await page.getByText('Модерация и закрепления').waitFor({ timeout: 20000 })
  ok('в админ-панели есть сводка модерации')

  // ===== что нового =====
  await page.goto(`${BASE}/news`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Что нового', level: 1 }).waitFor({ timeout: 20000 })
  const releases = await page.locator('section[class*="pl-7"]').count()
  releases >= 4 ? ok('лента обновлений на месте', `${releases} выпуска`) : fail('лента обновлений', String(releases))
  const newsText = await page.locator('body').innerText()
  const noNews = ['свежее', 'TurboWarp', 'Антимат', 'Блокировка по IP'].filter((t) => !newsText.includes(t))
  noNews.length === 0 ? ok('свежий выпуск описан') : fail('нет в выпуске', noNews.join(', '))

  // ===== боты на блоках =====
  await page.goto(`${BASE}/bots`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Боты', level: 1 }).waitFor({ timeout: 20000 })
  const botsText = await page.locator('body').innerText()
  const noHint = ['TurboWarp', 'DashBlocks', 'Расширения', '.sb3'].filter((t) => !botsText.includes(t))
  noHint.length === 0 ? ok('на странице объяснено, как завести бота') : fail('нет в объяснении', noHint.join(', '))

  const extLink = (await page.locator('code', { hasText: 'bot-extension.js' }).first().innerText()).trim()
  extLink.startsWith('https://') ? ok('адрес расширения на виду', extLink) : fail('адрес расширения', extLink)

  const extFile = await page.request.get(`${BASE}/bot-extension.js`)
  const extBody = extFile.ok() ? await extFile.text() : ''
  extFile.ok() && extBody.includes('Scratch.extensions.register')
    ? ok('файл расширения отдаётся сайтом', `${Math.round(extBody.length / 1024)} КБ`)
    : fail('файл расширения', `статус ${extFile.status()}`)
  const blockCount = (extBody.match(/opcode:/g) ?? []).length
  blockCount >= 20 ? ok('в расширении больше двадцати блоков', `${blockCount} блоков`) : fail('мало блоков', String(blockCount))

  const botHandle = `uicheck${Date.now() % 100000}`
  const addBotButton = page.getByRole('button', { name: /^Создать бота$/ })
  if (await addBotButton.isVisible().catch(() => false)) await addBotButton.click()
  await page.getByPlaceholder('Погодный бот').fill('Проверочный бот')
  await page.getByPlaceholder('weather').fill(botHandle)
  await page.getByPlaceholder(/Говорю погоду/).fill('создан автопроверкой')
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await page.getByText(`@${botHandle}bot`).waitFor({ timeout: 20000 })
  ok('бот создаётся прямо со страницы', `@${botHandle}bot`)

  const hidden = await page.locator('code', { hasText: '•••' }).first().isVisible().catch(() => false)
  hidden ? ok('токен спрятан за точками') : fail('токен виден сразу')
  await page.getByRole('button', { name: 'Показать', exact: true }).first().click()
  const token = (await page.locator('code', { hasText: /^tdm_/ }).first().innerText()).trim()
  ;/^tdm_[0-9a-f]{32}/.test(token) ? ok('кнопка «Показать» открывает токен', `${token.slice(0, 8)}…`) : fail('токен', token)

  ;(await page.getByRole('button', { name: /Приложить/ }).first().isVisible().catch(() => false))
    ? ok('код .sb3 или .dbp можно приложить')
    : fail('нет кнопки для кода')
  ;(await page.locator('select').first().isVisible().catch(() => false))
    ? ok('бота можно добавить в свой чат')
    : fail('нет выбора чата')

  const botsStray = strayEmoji(await page.locator('body').innerText())
  botsStray.length === 0 ? ok('на странице ботов нет старых значков') : fail('старые значки у ботов', botsStray.join(' '))

  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Удалить бота' }).first().click()
  await page.waitForTimeout(2000)
  ;(await page.locator('body').innerText()).includes(`@${botHandle}bot`)
    ? fail('бот остался после удаления')
    : ok('бот удаляется со страницы')

  // ===== собака в настройках =====
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Юзернейм', { timeout: 15000 })
  const settingsText = await page.locator('body').innerText()
  const handles = settingsText.match(/@[A-Za-zА-Яа-я0-9_]+/g) ?? []
  const clean = await page.locator('label:has-text("Юзернейм") input').first().inputValue()
  handles.length >= 1 && !clean.startsWith('@')
    ? ok('юзернейм показан с собакой, а в поле без неё', `${handles[0]} / ${clean}`)
    : fail('собака в настройках', `${handles.join(' ')} / ${clean}`)

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
