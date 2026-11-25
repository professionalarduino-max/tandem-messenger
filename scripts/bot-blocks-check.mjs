// Проверка самого расширения: файл public/bot-extension.js запускается в настоящем браузере
// с заглушкой Scratch вместо редактора, и каждый блок дёргается как из проекта TurboWarp.
// Живая база при этом настоящая: бот создаётся, пишет, читает и в конце удаляется.
// Запуск: SUPABASE_SERVICE_KEY=… node scripts/bot-blocks-check.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const URL = 'https://dfdsuktrnxbztbyslbwo.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZHN1a3RybnhienRieXNsYndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMzkzMzIsImV4cCI6MjExMDkxNTMzMn0.d2m7ZJPB5dLUga9UNN2vYHMr-Wt22fKxSo87YrYPutE'
// service_role только из окружения: в репозитории его нет и быть не должно.
const SERVICE = process.env.SUPABASE_SERVICE_KEY
if (!SERVICE) throw new Error('Нужна переменная окружения SUPABASE_SERVICE_KEY')

const EXT = resolve(import.meta.dirname, '../public/bot-extension.js')
const HOST = 'https://tandem-bot-test.local/' // страницу отдаём сами, нужен лишь нормальный origin

let failures = 0
let total = 0
function check(name, ok, extra = '') {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`)
  total++
  if (!ok) failures++
}

const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })

async function rpc(token, fn, args = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(token), body: JSON.stringify(args) })
  const text = await r.text()
  if (!r.ok) throw new Error(`${fn}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function get(token, path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H(token) })
  const text = await r.text()
  if (!r.ok) throw new Error(`get ${path}: ${text}`)
  return JSON.parse(text)
}

async function post(token, table, row) {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...H(token), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`post ${table}: ${text}`)
  return JSON.parse(text)[0]
}

const stamp = Date.now() % 1000000
const email = `blocks${stamp}@tandem.test`
const password = `Bl${stamp}!pass`
const username = `blocks${stamp}`

// ===== хозяин бота и чат для опытов =====
const createdUser = await fetch(`${URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } }),
})
if (!createdUser.ok) throw new Error(`не завёлся хозяин: ${await createdUser.text()}`)
const owner = await (
  await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
).json()
const ownerToken = owner.access_token
const ownerId = owner.user.id

const chatTitle = `Блоки ${stamp}`
const chatId = await rpc(ownerToken, 'create_group', { title_in: chatTitle, description_in: 'чат для проверки блоков' })
const bot = await rpc(ownerToken, 'create_bot', {
  name_in: 'Блок-бот',
  username_in: `blk${stamp}`,
  description_in: 'проверяю блоки расширения',
})
await rpc(ownerToken, 'add_bot_to_chat', { bot_in: bot.id, conv_in: chatId })

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = [] // исключения в самом расширении — таких быть не должно
const netErrors = [] // ответы 4xx: часть из них мы вызываем нарочно, проверяем только их вид
const polls = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && netErrors.push(m.text()))
page.on('request', (r) => r.url().endsWith('/bot_updates') && polls.push(Date.now()))

try {
  // страница-пустышка на обычном https-origin: расширение в TurboWarp живёт примерно так же
  await page.route(`${HOST}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>ext</title>' }),
  )
  await page.goto(HOST)

  // заглушка редактора: ровно те части Scratch, которых расширение касается
  await page.evaluate(() => {
    window.Scratch = {
      ArgumentType: { STRING: 'string', NUMBER: 'number' },
      BlockType: { COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat' },
      Cast: { toString: (v) => (v == null ? '' : String(v)) },
      extensions: { register: (ext) => (window.ext = ext) },
    }
  })
  await page.addScriptTag({ content: readFileSync(EXT, 'utf8') })
  check('расширение грузится без ошибок', pageErrors.length === 0, pageErrors.join(' | '))

  /** Вызвать блок по opcode — как это делает движок Scratch. */
  const block = (opcode, args = {}) => page.evaluate(([o, a]) => window.ext[o](a), [opcode, args])

  console.log('\n— описание блоков —')
  const info = await page.evaluate(() => {
    const i = window.ext.getInfo()
    return {
      id: i.id,
      name: i.name,
      opcodes: i.blocks.filter((b) => typeof b === 'object').map((b) => b.opcode),
      hats: i.blocks.filter((b) => typeof b === 'object' && b.blockType === 'hat').map((b) => b.opcode),
      edge: i.blocks.filter((b) => typeof b === 'object' && b.blockType === 'hat').every((b) => b.isEdgeActivated === false),
      menus: Object.keys(i.menus ?? {}),
      missing: i.blocks
        .filter((b) => typeof b === 'object')
        .map((b) => b.opcode)
        .filter((o) => typeof window.ext[o] !== 'function'),
      noText: i.blocks.filter((b) => typeof b === 'object' && !b.text).length,
    }
  })
  check('расширение зарегистрировалось', info.id === 'tandembot', info.name)
  check('блоков больше двадцати', info.opcodes.length >= 20, `${info.opcodes.length} шт.`)
  check('у каждого блока есть код', info.missing.length === 0, info.missing.join(', '))
  check('у каждого блока есть подпись', info.noText === 0)
  check('шляпы не «по фронту», иначе событие пропадёт', info.edge, info.hats.join(', '))
  check('выпадающий список свойств на месте', info.menus.includes('prop'))

  console.log('\n— подключение —')
  check('пока не подключились, бот не подключён', (await block('connected')) === false)
  await block('connect', { TOKEN: 'tdm_такого-нет' })
  check('плохой токен не подключает', (await block('connected')) === false)
  check('…и объясняет причину', String(await block('lastErrorBlock')).length > 0, String(await block('lastErrorBlock')))

  await block('connect', { TOKEN: bot.token })
  check('блок «подключить бота» соединяется', (await block('connected')) === true)
  check('блок «имя бота» знает имя', (await block('botName')) === 'Блок-бот')
  check('блок «@имя бота» отдаёт логин', (await block('botUser')) === `@blk${stamp}bot`, String(await block('botUser')))

  console.log('\n— сообщения —')
  await block('sendTo', { TEXT: 'Привет из блока', CHAT: chatTitle })
  const sentId = await block('lastSentId')
  check('блок «отправить в чат» отправляет по названию', typeof sentId === 'string' && sentId.length > 10, String(sentId))
  const sentRow = await get(ownerToken, `messages?select=body,sender_id&id=eq.${sentId}`)
  check('…и человек видит это сообщение', sentRow[0]?.body === 'Привет из блока', String(sentRow[0]?.body))
  check('…от имени бота', sentRow[0]?.sender_id === bot.profile_id)

  await block('editLast', { TEXT: 'Передумал' })
  const editedRow = await get(ownerToken, `messages?select=body,edited_at&id=eq.${sentId}`)
  check('блок «изменить своё сообщение» правит текст', editedRow[0]?.body === 'Передумал', String(editedRow[0]?.body))
  check('…и помечает правку', Boolean(editedRow[0]?.edited_at))

  // закреплять, как и человеку, можно только с админкой в чате
  await block('pinLast')
  const notPinned = await get(ownerToken, `messages?select=pinned_at&id=eq.${sentId}`)
  check('без админки бот не закрепляет', notPinned[0]?.pinned_at === null)
  check('…и честно говорит почему', String(await block('lastErrorBlock')).includes('админ'), String(await block('lastErrorBlock')))

  await fetch(`${URL}/rest/v1/conversation_members?conversation_id=eq.${chatId}&user_id=eq.${bot.profile_id}`, {
    method: 'PATCH',
    headers: { ...H(ownerToken), Prefer: 'return=minimal' },
    body: JSON.stringify({ role: 'admin' }),
  })
  await block('pinLast')
  const pinnedRow = await get(ownerToken, `messages?select=pinned_at,pinned_by&id=eq.${sentId}`)
  check('с админкой блок «закрепить своё сообщение» закрепляет', Boolean(pinnedRow[0]?.pinned_at), String(pinnedRow[0]?.pinned_at))
  check('…и закрепил именно бот', pinnedRow[0]?.pinned_by === bot.profile_id)

  console.log('\n— входящие и шляпы —')
  const ping = await post(ownerToken, 'messages', {
    conversation_id: chatId,
    sender_id: ownerId,
    body: `@blk${stamp}bot проверка блоков, привет`,
    client_id: crypto.randomUUID(),
  })
  // ждём, пока опрос сам принесёт сообщение: в проекте за это отвечает блок «ждать сообщение»
  const got = await page.evaluate(async (marker) => {
    const deadline = Date.now() + 25000
    while (Date.now() < deadline) {
      await Promise.race([window.ext.waitMessage(), new Promise((r) => setTimeout(r, 3000))])
      if (String(window.ext.msgText()).includes(marker)) return true
    }
    return false
  }, 'проверка блоков')
  check('блок «ждать сообщение» дожидается строки от человека', got)
  check('опрос идёт сам, без вмешательства', polls.length >= 2, `запросов: ${polls.length}`)
  check('блок «текст сообщения» отдаёт написанное', String(await block('msgText')).includes('привет'))
  check('блок «автор сообщения» отдаёт @имя', (await block('msgFrom')) === `@${username}`, String(await block('msgFrom')))
  check('блок «имя автора» непустое', String(await block('msgName')).length > 0, String(await block('msgName')))
  check('блок «чат сообщения» — название группы', (await block('msgChat')) === chatTitle, String(await block('msgChat')))
  check('блок «это личка?» в группе отвечает «нет»', (await block('msgDirect')) === false)
  check('блок «в сообщении есть» находит слово', (await block('msgHas', { TEXT: 'Привет' })) === true)
  check('…и не находит лишнего', (await block('msgHas', { TEXT: 'погода' })) === false)

  check('шляпа «когда боту написали» срабатывает', (await block('whenMessage')) === true)
  check('…ровно один раз на сообщение', (await block('whenMessage')) === false)
  check('шляпа «когда написали [текст]» ловит своё слово', (await block('whenText', { TEXT: 'привет' })) === true)
  check('…и молчит на чужое', (await block('whenText', { TEXT: 'погода' })) === false)
  check('шляпа «когда бота позвали» видит обращение', (await block('whenCalled')) === true)

  await block('reply', { TEXT: 'и тебе привет' })
  const replyRow = await get(ownerToken, `messages?select=body,conversation_id&id=eq.${await block('lastSentId')}`)
  check('блок «ответить» пишет в тот же чат', replyRow[0]?.conversation_id === chatId, String(replyRow[0]?.body))

  await block('quote', { TEXT: 'цитирую' })
  const quoteId = await block('lastSentId')
  const quoteRow = await get(ownerToken, `messages?select=body,reply_to&id=eq.${quoteId}`)
  check('блок «ответить цитатой» цепляет исходное сообщение', quoteRow[0]?.reply_to === ping.id, String(quoteRow[0]?.body))

  await block('react', { EMOJI: '👍' })
  const reactions = await get(ownerToken, `message_reactions?select=emoji,user_id&message_id=eq.${ping.id}`)
  check('блок «поставить реакцию» ставит её на входящее', reactions.some((r) => r.user_id === bot.profile_id && r.emoji === '👍'))

  console.log('\n— чаты, люди, память —')
  check('блок «список чатов» показывает группу', String(await block('chats')).includes(chatTitle), String(await block('chats')))
  const members = String(await block('members', { CHAT: chatTitle }))
  check('блок «кто в чате» перечисляет через @', members.includes(`@${username}`) && members.includes(`@blk${stamp}bot`), members)
  check('блок «[свойство] у [кого]» знает имя', String(await block('userProp', { PROP: 'имя', WHO: `@${username}` })).length > 0)
  check('…и видит, что бот — бот', (await block('userProp', { PROP: 'бот?', WHO: `@blk${stamp}bot` })) === 'да')
  const history = String(await block('history', { N: 5, CHAT: chatTitle }))
  check('блок «последние N сообщений» отдаёт строки «кто: что»', history.includes(': ') && history.includes('цитирую'), history.split('\n').length + ' строк')

  await block('remember', { KEY: 'счёт', VALUE: '7' })
  check('блоки «запомнить/вспомнить» хранят значение', (await block('recall', { KEY: 'счёт' })) === '7')
  check('блок «что бот помнит» перечисляет ключи', String(await block('memoryKeys')).includes('счёт'), String(await block('memoryKeys')))
  await block('forget', { KEY: 'счёт' })
  check('блок «забыть» стирает значение', (await block('recall', { KEY: 'счёт' })) === '')

  await block('note', { TEXT: 'блоки проверены' })
  const noted = (await rpc(ownerToken, 'my_bots')).find((b) => b.id === bot.id)
  check('блок «записать в журнал» виден хозяину на странице ботов', noted?.note === 'блоки проверены', String(noted?.note))

  await block('rename', { NAME: 'Блок-бот 2' })
  check('блок «переименовать бота» меняет имя', (await block('botName')) === 'Блок-бот 2', String(await block('botName')))
  await block('describe', { DESC: 'описание из блока' })
  const described = (await rpc(ownerToken, 'my_bots')).find((b) => b.id === bot.id)
  check('блок «описание бота» сохраняет описание', described?.description === 'описание из блока', String(described?.description))

  console.log('\n— списки и завершение —')
  check('блок «N-й в списке» режет по запятым', (await block('itemOf', { N: 2, LIST: 'раз, два, три' })) === 'два')
  check('…понимает JSON', (await block('itemOf', { N: 1, LIST: '["a","b"]' })) === 'a')
  check('…и переводы строк', (await block('itemOf', { N: 3, LIST: 'раз\nдва\nтри' })) === 'три')
  check('…а за границами молчит', (await block('itemOf', { N: 9, LIST: 'раз, два' })) === '')
  check('блок «длина списка» считает', (await block('lengthOf', { LIST: 'раз, два, три' })) === 3)
  check('пустой список — это ноль', (await block('lengthOf', { LIST: '  ' })) === 0)

  await block('deleteLast')
  const afterDelete = await get(ownerToken, `messages?select=deleted_at&id=eq.${quoteId}`)
  check('блок «удалить своё сообщение» убирает его', afterDelete.length === 0 || Boolean(afterDelete[0]?.deleted_at))

  await block('leave', { CHAT: chatTitle })
  check('блок «выйти из чата» выписывает бота', String(await block('chats')).includes(chatTitle) === false)
  await block('sendTo', { TEXT: 'я ушёл, но пишу', CHAT: chatTitle })
  check('…после ухода писать туда нельзя', String(await block('lastErrorBlock')).length > 0, String(await block('lastErrorBlock')))

  const pollsBefore = polls.length
  await block('disconnect')
  check('блок «отключить бота» отключает', (await block('connected')) === false)
  await new Promise((r) => setTimeout(r, 3000))
  check('…и опрос прекращается', polls.length === pollsBefore, `${polls.length - pollsBefore} лишних запросов`)

  check('расширение ни разу не свалилось с ошибкой JS', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  check(
    'в консоли только отказы базы на запрещённое, ошибок кода нет',
    netErrors.every((t) => /Failed to load resource/.test(t)),
    netErrors.filter((t) => !/Failed to load resource/.test(t)).slice(0, 2).join(' | '),
  )
} finally {
  await browser.close()
  // ===== уборка: бот, чат и хозяин исчезают =====
  try {
    await rpc(ownerToken, 'delete_bot', { bot_in: bot.id })
    await fetch(`${URL}/rest/v1/conversations?id=eq.${chatId}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    })
    await fetch(`${URL}/auth/v1/admin/users/${ownerId}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    })
  } catch (e) {
    console.log(`  прибрать не вышло: ${e.message}`)
  }
}

console.log(`\nИтого: ${total - failures}/${total}`)
process.exit(failures ? 1 : 0)
