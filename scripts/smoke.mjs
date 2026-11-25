// Сквозная проверка прав на живой базе: группы видны всем, ABDev — админ везде.
const URL = 'https://dfdsuktrnxbztbyslbwo.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZHN1a3RybnhienRieXNsYndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMzkzMzIsImV4cCI6MjExMDkxNTMzMn0.d2m7ZJPB5dLUga9UNN2vYHMr-Wt22fKxSo87YrYPutE'
// service_role никогда не хранится в коде — только в переменной окружения.
// Dashboard → Project Settings → API → service_role
const SERVICE = process.env.SUPABASE_SERVICE_KEY
if (!SERVICE) throw new Error('Нужна переменная окружения SUPABASE_SERVICE_KEY')

let failures = 0
let total = 0
function check(name, ok, extra = '') {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`)
  total++
  if (!ok) failures++
}

async function ensureUser(email, password, username) {
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } }),
  })
  if (!r.ok && r.status !== 422) throw new Error(`create ${email}: ${await r.text()}`)
}

async function trySignIn(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return { status: r.status, body: await r.json() }
}

async function signIn(email, password) {
  const { body } = await trySignIn(email, password)
  if (!body.access_token) throw new Error(`signin ${email}: ${JSON.stringify(body)}`)
  return { token: body.access_token, id: body.user.id }
}

const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })

async function rpc(token, fn, args = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(token), body: JSON.stringify(args) })
  const text = await r.text()
  if (!r.ok) throw new Error(`${fn}: ${text}`)
  return text ? JSON.parse(text) : null
}

/** Как rpc(), но без исключения: нужен для проверок «а вот так нельзя». */
async function tryRpc(token, fn, args = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(token), body: JSON.stringify(args) })
  const text = await r.text()
  return { ok: r.ok, status: r.status, body: text, data: text ? JSON.parse(text) : null }
}

/** Вызов от имени бота: публичный ключ и токен в теле — ровно как из расширения. */
async function botRpc(fn, args = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { ok: r.ok, status: r.status, body: text, data }
}

async function get(token, path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H(token) })
  const t = await r.text()
  if (!r.ok) throw new Error(`${path}: ${t}`)
  return JSON.parse(t)
}

async function post(token, path, body) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...H(token), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  return { ok: r.ok, status: r.status, body: await r.text() }
}

async function patch(token, path, body) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...H(token), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let rows = []
  try {
    rows = JSON.parse(text)
  } catch {
    rows = []
  }
  return { ok: r.ok, status: r.status, rows: Array.isArray(rows) ? rows : [], body: text }
}

// ===== Storage =====
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function upload(token, bucket, path, body, contentType) {
  const r = await fetch(`${URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  })
  return { ok: r.ok, status: r.status, body: await r.text() }
}

async function download(token, bucket, path) {
  const r = await fetch(`${URL}/storage/v1/object/${bucket}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  return { ok: r.ok, status: r.status }
}

const run = async () => {
  await ensureUser('friend.test@example.com', 'FriendPass123', 'Friend')
  await ensureUser('stranger.test@example.com', 'StrangerPass123', 'Stranger')

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) throw new Error('Нужна переменная окружения ADMIN_PASSWORD')
  const admin = await signIn('abdev2013@gmail.com', adminPassword)
  const friend = await signIn('friend.test@example.com', 'FriendPass123')
  const stranger = await signIn('stranger.test@example.com', 'StrangerPass123')
  console.log('\n— Аккаунты —')
  check('ABDev входит по своему паролю', Boolean(admin.token))
  check('второй и третий пользователь созданы', Boolean(friend.token && stranger.token))

  const me = await get(admin.token, 'profiles?select=username,is_super_admin&id=eq.' + admin.id)
  check('ABDev помечен главным админом', me[0]?.is_super_admin === true, `username=${me[0]?.username}`)

  console.log('\n— Группа, созданная другим пользователем —')
  const gid = await rpc(friend.token, 'create_group', { title_in: 'Группа друга', description_in: 'создал не админ' })
  check('друг создал группу', Boolean(gid))

  const membersOfFriendGroup = await get(
    admin.token,
    `conversation_members?select=user_id,role&conversation_id=eq.${gid}`,
  )
  const adminRow = membersOfFriendGroup.find((m) => m.user_id === admin.id)
  check('ABDev автоматически добавлен в чужую группу', Boolean(adminRow))
  check('…и сразу с ролью admin', adminRow?.role === 'admin')

  const catalogStranger = await rpc(stranger.token, 'list_public_groups', { q: '' })
  check(
    'посторонний видит чужую группу в каталоге',
    catalogStranger.some((g) => g.id === gid),
    `всего групп: ${catalogStranger.length}`,
  )

  console.log('\n— Сообщения —')
  const sent = await post(friend.token, 'messages', {
    conversation_id: gid,
    sender_id: friend.id,
    body: 'Привет из группы друга',
    client_id: crypto.randomUUID(),
  })
  check('друг пишет в свою группу', sent.ok, sent.ok ? '' : sent.body)

  const strangerPost = await post(stranger.token, 'messages', {
    conversation_id: gid,
    sender_id: stranger.id,
    body: 'Я зашёл с улицы',
    client_id: crypto.randomUUID(),
  })
  check('посторонний может писать в открытую группу', strangerPost.ok, strangerPost.ok ? '' : strangerPost.body)

  const adminSees = await get(admin.token, `messages?select=body&conversation_id=eq.${gid}&order=created_at`)
  check('ABDev читает всю переписку группы', adminSees.length >= 2, `сообщений: ${adminSees.length}`)

  console.log('\n— Личные чаты остаются приватными —')
  const dm = await rpc(friend.token, 'create_direct_conversation', { peer_id: stranger.id })
  await post(friend.token, 'messages', {
    conversation_id: dm,
    sender_id: friend.id,
    body: 'секрет',
    client_id: crypto.randomUUID(),
  })

  // четвёртый пользователь — обычный, не участник
  await ensureUser('nosy.test@example.com', 'NosyPass123', 'Nosy')
  const nosy = await signIn('nosy.test@example.com', 'NosyPass123')
  const nosySees = await get(nosy.token, `messages?select=body&conversation_id=eq.${dm}`)
  check('обычный пользователь НЕ видит чужую личную переписку', nosySees.length === 0)

  const nosyWrite = await post(nosy.token, 'messages', {
    conversation_id: dm,
    sender_id: nosy.id,
    body: 'влезаю',
    client_id: crypto.randomUUID(),
  })
  check('обычный пользователь НЕ может писать в чужой личный чат', !nosyWrite.ok, `статус ${nosyWrite.status}`)

  const nosyCatalog = await rpc(nosy.token, 'list_public_groups', { q: '' })
  check('личный чат не попадает в каталог групп', !nosyCatalog.some((g) => g.id === dm))

  console.log('\n— Модерация —')
  const msgId = JSON.parse(sent.body)[0].id
  const del = await fetch(`${URL}/rest/v1/messages?id=eq.${msgId}`, {
    method: 'PATCH',
    headers: H(admin.token),
    body: JSON.stringify({ deleted_at: new Date().toISOString(), body: null }),
  })
  check('ABDev удаляет чужое сообщение', del.ok, del.ok ? '' : await del.text())

  const nosyDel = await fetch(`${URL}/rest/v1/messages?id=eq.${msgId}`, {
    method: 'PATCH',
    headers: H(nosy.token),
    body: JSON.stringify({ body: 'подменил' }),
  })
  const nosyDelBody = await nosyDel.json().catch(() => [])
  check('обычный пользователь не правит чужие сообщения', Array.isArray(nosyDelBody) && nosyDelBody.length === 0)

  const myChats = await rpc(admin.token, 'list_conversations')
  check('список чатов ABDev собирается', Array.isArray(myChats), `чатов: ${myChats.length}`)

  // ================= ЧАСТЬ 2 =================
  console.log('\n— Профиль —')
  const bioOwn = await patch(friend.token, `profiles?id=eq.${friend.id}`, { bio: 'люблю тесты' })
  check('пользователь меняет своё «о себе»', bioOwn.rows[0]?.bio === 'люблю тесты', bioOwn.body.slice(0, 120))

  const bioForeign = await patch(nosy.token, `profiles?id=eq.${friend.id}`, { bio: 'взломано' })
  check('чужой профиль не редактируется', bioForeign.rows.length === 0, `статус ${bioForeign.status}`)

  const bioVisible = await get(stranger.token, `profiles?select=bio&id=eq.${friend.id}`)
  check('«о себе» видно другим пользователям', bioVisible[0]?.bio === 'люблю тесты')

  console.log('\n— Аватары (Storage) —')
  const ownAvatar = await upload(friend.token, 'avatars', `users/${friend.id}/avatar.webp`, PNG_1PX, 'image/png')
  check('свою аватарку загрузить можно', ownAvatar.ok, ownAvatar.ok ? '' : ownAvatar.body.slice(0, 120))

  const foreignAvatar = await upload(nosy.token, 'avatars', `users/${friend.id}/avatar.webp`, PNG_1PX, 'image/png')
  check('чужую аватарку подменить нельзя', !foreignAvatar.ok, `статус ${foreignAvatar.status}`)

  const publicAvatar = await fetch(`${URL}/storage/v1/object/public/avatars/users/${friend.id}/avatar.webp`)
  check('аватарка доступна по публичной ссылке', publicAvatar.ok, `статус ${publicAvatar.status}`)

  const groupAvatarByAdmin = await upload(friend.token, 'avatars', `groups/${gid}/avatar.webp`, PNG_1PX, 'image/png')
  check('админ группы ставит аватарку группе', groupAvatarByAdmin.ok, groupAvatarByAdmin.body.slice(0, 120))

  const groupAvatarByNosy = await upload(nosy.token, 'avatars', `groups/${gid}/avatar.webp`, PNG_1PX, 'image/png')
  check('посторонний не меняет аватарку группы', !groupAvatarByNosy.ok, `статус ${groupAvatarByNosy.status}`)

  const groupAvatarBySuper = await upload(admin.token, 'avatars', `groups/${gid}/avatar.webp`, PNG_1PX, 'image/png')
  check('ABDev меняет аватарку любой группы', groupAvatarBySuper.ok, groupAvatarBySuper.body.slice(0, 120))

  console.log('\n— Редактирование группы —')
  const renameByAdmin = await patch(friend.token, `conversations?id=eq.${gid}`, {
    title: 'Группа друга v2',
    description: 'описание обновлено',
  })
  check('админ группы правит название и описание', renameByAdmin.rows[0]?.title === 'Группа друга v2')

  const renameByNosy = await patch(nosy.token, `conversations?id=eq.${gid}`, { title: 'моя группа' })
  check('посторонний не правит чужую группу', renameByNosy.rows.length === 0, `статус ${renameByNosy.status}`)

  const renameBySuper = await patch(admin.token, `conversations?id=eq.${gid}`, { title: 'Группа друга v3' })
  check('ABDev правит любую группу', renameBySuper.rows[0]?.title === 'Группа друга v3')

  console.log('\n— Вложения —')
  const groupFile = `${gid}/smoke-group.txt`
  const upGroup = await upload(friend.token, 'attachments', groupFile, 'файл в группе', 'text/plain')
  check('участник загружает файл в группу', upGroup.ok, upGroup.ok ? '' : upGroup.body.slice(0, 120))

  const readGroupFileByStranger = await download(stranger.token, 'attachments', groupFile)
  check('файл открытой группы читается участниками каталога', readGroupFileByStranger.ok, `статус ${readGroupFileByStranger.status}`)

  // путь всегда новый: приложение тоже кладёт вложения под случайным именем,
  // перезапись существующего файла политиками не разрешена
  const dmFile = `${dm}/smoke-secret-${Date.now()}.txt`
  const upDm = await upload(friend.token, 'attachments', dmFile, 'секретный файл', 'text/plain')
  check('файл в личный чат загружается', upDm.ok, upDm.ok ? '' : upDm.body.slice(0, 120))

  const dmFileByOwner = await download(friend.token, 'attachments', dmFile)
  check('участник личного чата читает вложение', dmFileByOwner.ok, `статус ${dmFileByOwner.status}`)

  const dmFileByNosy = await download(nosy.token, 'attachments', dmFile)
  check('посторонний НЕ читает вложение личного чата', !dmFileByNosy.ok, `статус ${dmFileByNosy.status}`)

  const fileMessage = await post(friend.token, 'messages', {
    conversation_id: gid,
    sender_id: friend.id,
    body: null,
    kind: 'file',
    client_id: crypto.randomUUID(),
    attachment_path: groupFile,
    attachment_mime: 'text/plain',
    attachment_size: 26,
    attachment_name: 'smoke-group.txt',
  })
  check('сообщение-вложение без текста сохраняется', fileMessage.ok, fileMessage.ok ? '' : fileMessage.body.slice(0, 160))

  console.log('\n— Ответы и правка сообщений —')
  const parent = await post(friend.token, 'messages', {
    conversation_id: gid,
    sender_id: friend.id,
    body: 'исходное сообщение',
    client_id: crypto.randomUUID(),
  })
  const parentId = JSON.parse(parent.body)[0].id
  const reply = await post(stranger.token, 'messages', {
    conversation_id: gid,
    sender_id: stranger.id,
    body: 'это ответ',
    reply_to: parentId,
    client_id: crypto.randomUUID(),
  })
  check('ответ на сообщение сохраняется', reply.ok, reply.ok ? '' : reply.body.slice(0, 160))

  const withParent = await get(
    admin.token,
    `messages?select=body,parent:reply_to(body)&id=eq.${JSON.parse(reply.body)[0].id}`,
  )
  check('цитата исходного сообщения подтягивается', withParent[0]?.parent?.body === 'исходное сообщение')

  const edited = await patch(friend.token, `messages?id=eq.${parentId}`, {
    body: 'исправленное сообщение',
    edited_at: new Date().toISOString(),
  })
  check('автор правит своё сообщение', edited.rows[0]?.body === 'исправленное сообщение')

  console.log('\n— Поиск —')
  const rareWord = `криптоморфный${Date.now()}`
  await post(friend.token, 'messages', {
    conversation_id: gid,
    sender_id: friend.id,
    body: `тестовое слово ${rareWord} внутри группы`,
    client_id: crypto.randomUUID(),
  })
  const foundByStranger = await rpc(stranger.token, 'search_messages', { q: rareWord, conv_in: null })
  check('поиск находит сообщение в открытой группе', foundByStranger.length >= 1, `совпадений: ${foundByStranger.length}`)

  const dmWord = `тайнослово${Date.now()}`
  await post(friend.token, 'messages', {
    conversation_id: dm,
    sender_id: friend.id,
    body: `личное ${dmWord}`,
    client_id: crypto.randomUUID(),
  })
  const dmFoundByOwner = await rpc(friend.token, 'search_messages', { q: dmWord, conv_in: null })
  check('участник находит своё сообщение в личном чате', dmFoundByOwner.length >= 1)

  const dmFoundByNosy = await rpc(nosy.token, 'search_messages', { q: dmWord, conv_in: null })
  check('поиск не выдаёт чужую личную переписку', dmFoundByNosy.length === 0, `совпадений: ${dmFoundByNosy.length}`)

  console.log('\n— Реакции —')
  const firstReaction = await tryRpc(stranger.token, 'toggle_reaction', { msg_in: parentId, emoji_in: '👍' })
  check('реакция ставится', firstReaction.ok && firstReaction.data === true, firstReaction.ok ? '' : firstReaction.body.slice(0, 160))

  await rpc(admin.token, 'toggle_reaction', { msg_in: parentId, emoji_in: '👍' })
  await rpc(admin.token, 'toggle_reaction', { msg_in: parentId, emoji_in: '🔥' })
  const reactionRows = await get(admin.token, `message_reactions?select=emoji,user_id&message_id=eq.${parentId}`)
  check('реакции разных людей и разные эмодзи складываются', reactionRows.length === 3, `строк: ${reactionRows.length}`)

  const second = await rpc(stranger.token, 'toggle_reaction', { msg_in: parentId, emoji_in: '👍' })
  const afterRemove = await get(admin.token, `message_reactions?select=user_id&message_id=eq.${parentId}&emoji=eq.${encodeURIComponent('👍')}`)
  check('повторное нажатие снимает свою реакцию', second === false && afterRemove.length === 1)

  const dmMsg = await post(friend.token, 'messages', {
    conversation_id: dm,
    sender_id: friend.id,
    body: 'сообщение для реакции в личке',
    client_id: crypto.randomUUID(),
  })
  const dmMsgId = JSON.parse(dmMsg.body)[0].id
  await rpc(stranger.token, 'toggle_reaction', { msg_in: dmMsgId, emoji_in: '❤️' })

  const nosyReaction = await tryRpc(nosy.token, 'toggle_reaction', { msg_in: dmMsgId, emoji_in: '😂' })
  check('посторонний не реагирует на сообщение чужого личного чата', !nosyReaction.ok, `status ${nosyReaction.status}`)

  const nosySeesReactions = await get(nosy.token, `message_reactions?select=emoji&message_id=eq.${dmMsgId}`)
  check('посторонний не видит реакции в чужом личном чате', nosySeesReactions.length === 0, `строк: ${nosySeesReactions.length}`)

  const mineInDm = await get(stranger.token, `message_reactions?select=emoji&message_id=eq.${dmMsgId}`)
  check('участник личного чата видит реакции', mineInDm.length === 1)

  console.log('\n— Закреплённые сообщения —')
  const pinByCreator = await tryRpc(friend.token, 'pin_message', { msg_in: parentId, pinned: true })
  const pinnedRow = await get(admin.token, `messages?select=pinned_at,pinned_by&id=eq.${parentId}`)
  check('админ группы закрепляет сообщение', pinByCreator.ok && pinnedRow[0]?.pinned_at !== null)
  check('в закреплении записан автор', pinnedRow[0]?.pinned_by === friend.id)

  const pinByStranger = await tryRpc(stranger.token, 'pin_message', { msg_in: parentId, pinned: false })
  check('обычный участник не откручивает закреп', !pinByStranger.ok, `status ${pinByStranger.status}`)

  const pinList = await get(stranger.token, `messages?select=id&conversation_id=eq.${gid}&pinned_at=not.is.null`)
  check('закреплённое видно всем в группе', pinList.length === 1)

  const unpinBySuper = await tryRpc(admin.token, 'pin_message', { msg_in: parentId, pinned: false })
  const afterUnpin = await get(admin.token, `messages?select=pinned_at&id=eq.${parentId}`)
  check('ABDev снимает любой закреп', unpinBySuper.ok && afterUnpin[0]?.pinned_at === null)

  const pinInDm = await tryRpc(friend.token, 'pin_message', { msg_in: dmMsgId, pinned: true })
  check('в личном чате закрепляет любой участник', pinInDm.ok, pinInDm.ok ? '' : pinInDm.body.slice(0, 160))

  const pinByNosy = await tryRpc(nosy.token, 'pin_message', { msg_in: dmMsgId, pinned: false })
  check('посторонний не трогает закреп в чужом личном чате', !pinByNosy.ok, `status ${pinByNosy.status}`)

  console.log('\n— Голосовые сообщения —')
  const voice = await post(friend.token, 'messages', {
    conversation_id: dm,
    sender_id: friend.id,
    kind: 'voice',
    attachment_path: `${dm}/voice-smoke-${Date.now()}.webm`,
    attachment_name: 'voice.webm',
    attachment_mime: 'audio/webm',
    attachment_size: 18240,
    duration_ms: 3200,
    client_id: crypto.randomUUID(),
  })
  check('голосовое сообщение сохраняется', voice.ok, voice.ok ? '' : voice.body.slice(0, 160))

  const voiceRow = voice.ok ? JSON.parse(voice.body)[0] : {}
  check('длительность записи сохранена', voiceRow.duration_ms === 3200)

  const badKind = await post(friend.token, 'messages', {
    conversation_id: dm,
    sender_id: friend.id,
    kind: 'видео',
    client_id: crypto.randomUUID(),
  })
  check('неизвестный тип сообщения база не принимает', !badKind.ok, `status ${badKind.status}`)

  const convList = await rpc(friend.token, 'list_conversations')
  const dmPreview = convList.find((c) => c.id === dm)
  // текст превью без значков: тип сообщения интерфейс рисует иконкой по last_message_kind
  check(
    'в списке чатов голосовое подписано «Голосовое сообщение»',
    dmPreview?.last_message_body === 'Голосовое сообщение',
    `получено: ${dmPreview?.last_message_body}`,
  )
  check(
    'и помечено типом voice для иконки',
    dmPreview?.last_message_kind === 'voice',
    `получено: ${dmPreview?.last_message_kind}`,
  )

  console.log('\n— Капсула времени —')
  const SERVICE_H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
  const capsuleText = 'Письмо в будущее'
  const openAt = new Date(Date.now() + 3600_000).toISOString()
  const capsuleId = await rpc(friend.token, 'send_capsule', {
    conv_in: dm,
    body_in: capsuleText,
    open_at_in: openAt,
    client_id_in: crypto.randomUUID(),
    reply_to_in: null,
  })
  check('капсула отправляется', Boolean(capsuleId))

  const capsuleMsg = await get(friend.token, `messages?select=kind,body,open_at&id=eq.${capsuleId}`)
  check(
    'в чате лежит сообщение-капсула без текста',
    capsuleMsg[0]?.kind === 'capsule' && capsuleMsg[0]?.body === null,
    `kind=${capsuleMsg[0]?.kind}`,
  )
  check('срок вскрытия сохранён в сообщении', Boolean(capsuleMsg[0]?.open_at))

  const sealedForPeer = await get(stranger.token, `message_capsules?select=body&message_id=eq.${capsuleId}`)
  check('собеседник НЕ читает запечатанный текст', sealedForPeer.length === 0)

  const sealedForSuper = await get(admin.token, `message_capsules?select=body&message_id=eq.${capsuleId}`)
  check('даже главный админ не вскрывает капсулу раньше срока', sealedForSuper.length === 0)

  const sealedForAuthor = await get(friend.token, `message_capsules?select=body&message_id=eq.${capsuleId}`)
  check('автор видит собственный текст', sealedForAuthor[0]?.body === capsuleText)

  const embedSealed = await get(
    stranger.token,
    `messages?select=id,capsule:message_capsules(body)&id=eq.${capsuleId}`,
  )
  const sealedEmbed = embedSealed[0]?.capsule
  check(
    'в обычной выдаче сообщений тела капсулы нет',
    sealedEmbed === null || (Array.isArray(sealedEmbed) && sealedEmbed.length === 0),
    `получено: ${JSON.stringify(sealedEmbed)}`,
  )

  const pastCapsule = await tryRpc(friend.token, 'send_capsule', {
    conv_in: dm,
    body_in: 'срок в прошлом',
    open_at_in: new Date(Date.now() - 60_000).toISOString(),
  })
  check('срок в прошлом база не принимает', !pastCapsule.ok, `статус ${pastCapsule.status}`)

  const foreignCapsule = await tryRpc(nosy.token, 'send_capsule', {
    conv_in: dm,
    body_in: 'я тут мимо проходил',
    open_at_in: openAt,
  })
  check('в чужой личный чат капсулу не положить', !foreignCapsule.ok, `статус ${foreignCapsule.status}`)

  const directInsert = await post(stranger.token, 'message_capsules', {
    message_id: capsuleId,
    conversation_id: dm,
    body: 'подмена',
    open_at: openAt,
  })
  check('напрямую в таблицу капсул писать нельзя', !directInsert.ok, `статус ${directInsert.status}`)

  const capsulePreview = await rpc(stranger.token, 'list_conversations')
  check(
    'в списке чатов капсула подписана «Капсула времени»',
    capsulePreview.find((c) => c.id === dm)?.last_message_body === 'Капсула времени',
    `получено: ${capsulePreview.find((c) => c.id === dm)?.last_message_body}`,
  )
  check(
    'и помечена типом capsule для иконки',
    capsulePreview.find((c) => c.id === dm)?.last_message_kind === 'capsule',
    `получено: ${capsulePreview.find((c) => c.id === dm)?.last_message_kind}`,
  )

  // переводим часы вперёд: срок наступил
  await fetch(`${URL}/rest/v1/message_capsules?message_id=eq.${capsuleId}`, {
    method: 'PATCH',
    headers: SERVICE_H,
    body: JSON.stringify({ open_at: new Date(Date.now() - 1000).toISOString() }),
  })

  const openedForPeer = await get(stranger.token, `message_capsules?select=body&message_id=eq.${capsuleId}`)
  check('после срока текст открывается собеседнику', openedForPeer[0]?.body === capsuleText)

  const openedForNosy = await get(nosy.token, `message_capsules?select=body&message_id=eq.${capsuleId}`)
  check('посторонний не читает капсулу и после срока', openedForNosy.length === 0)

  const capsuleDeleted = await patch(friend.token, `messages?id=eq.${capsuleId}`, {
    deleted_at: new Date().toISOString(),
    body: null,
  })
  const capsuleLeftover = await get(friend.token, `message_capsules?select=body&message_id=eq.${capsuleId}`)
  check(
    'удалили сообщение — запечатанный текст стёрт вместе с ним',
    capsuleDeleted.ok && capsuleLeftover.length === 0,
  )

  // ===== каталог людей и статистика =====
  console.log('\n— Каталог людей —')
  const directory = await rpc(friend.token, 'list_users')
  const inDirectory = (id) => directory.some((u) => u.id === id)
  check('виден каждый, кто пользуется мессенджером', inDirectory(admin.id) && inDirectory(stranger.id), `всего: ${directory.length}`)
  check('себя каталог тоже показывает и помечает', directory.find((u) => u.id === friend.id)?.is_me === true)
  check('у главного админа стоит флаг', directory.find((u) => u.id === admin.id)?.is_super_admin === true)
  check(
    'у строки есть счётчик сообщений',
    typeof directory.find((u) => u.id === friend.id)?.message_count === 'number',
  )
  const found = await rpc(stranger.token, 'list_users', { q: 'friend' })
  check('поиск по каталогу работает', found.some((u) => u.id === friend.id), `найдено: ${found.length}`)

  console.log('\n— Статистика —')
  const denied = await tryRpc(friend.token, 'admin_stats')
  check('обычному пользователю статистика недоступна', !denied.ok, `статус ${denied.status}`)
  const stats = await rpc(admin.token, 'admin_stats')
  check('главный админ получает сводку', Boolean(stats?.generated_at))
  check('в сводке есть люди, чаты и сообщения', stats.users.total > 0 && stats.conversations.total > 0 && stats.messages.total > 0,
    `${stats.users.total} / ${stats.conversations.total} / ${stats.messages.total}`)
  check('график считает 14 дней', Array.isArray(stats.daily) && stats.daily.length === 14, `дней: ${stats.daily?.length}`)
  check('есть топ активных и список новичков', Array.isArray(stats.top_users) && Array.isArray(stats.newcomers))

  // ===== карточка профиля =====
  console.log('\n— Карточка профиля —')
  const card = await rpc(friend.token, 'user_card', { uid_in: stranger.id })
  check('карточка отдаёт профиль', card?.id === stranger.id, `username=${card?.username}`)
  check(
    'в карточке есть цифры и общие группы',
    typeof card.message_count === 'number' && Array.isArray(card.common_groups),
    `сообщений: ${card.message_count}, общих групп: ${card.common_groups?.length}`,
  )
  check('общая группа найдена', card.common_groups.some((g) => g.id === gid))
  check('ссылка на личный чат подставлена', card.direct_id === null || typeof card.direct_id === 'string')
  check('почту обычный пользователь не видит', card.email === null || card.email === undefined)
  const cardForAdmin = await rpc(admin.token, 'user_card', { uid_in: stranger.id })
  check('главному админу карточка показывает почту', cardForAdmin.email === 'stranger.test@example.com', `получено: ${cardForAdmin.email}`)
  const myCard = await rpc(friend.token, 'user_card', { uid_in: friend.id })
  check('свою карточку видно как свою', myCard.is_me === true)
  const byName = await rpc(friend.token, 'user_card_by_name', { name_in: '@Stranger' })
  check('карточка открывается по @юзернейму', byName?.id === stranger.id)
  const hints = await rpc(friend.token, 'mention_candidates', { conv_in: gid, q: 'str', lim: 6 })
  check('подсказки @упоминаний ищут человека', hints.some((u) => u.id === stranger.id), `найдено: ${hints.length}`)
  check('и помечают участников чата', hints.every((u) => typeof u.is_member === 'boolean'))

  // ===== бан и мут =====
  console.log('\n— Бан и мут —')
  const notAdminBan = await tryRpc(friend.token, 'admin_set_ban', { uid_in: stranger.id, banned: true })
  check('обычный пользователь никого не банит', !notAdminBan.ok, `статус ${notAdminBan.status}`)

  const selfBan = await tryRpc(admin.token, 'admin_set_ban', { uid_in: admin.id, banned: true })
  check('админ не может забанить сам себя', !selfBan.ok, `статус ${selfBan.status}`)

  const escalate = await patch(friend.token, `profiles?id=eq.${friend.id}`, { is_super_admin: true })
  const stillPlain = await get(friend.token, `profiles?select=is_super_admin&id=eq.${friend.id}`)
  check(
    'сам себе права админа не выдать',
    !escalate.ok && stillPlain[0]?.is_super_admin === false,
    `статус ${escalate.status}`,
  )

  await rpc(admin.token, 'admin_set_mute', { uid_in: stranger.id, minutes: 60, reason_in: 'тест' })
  const mutedState = await get(admin.token, `user_moderation?select=muted_until,mute_reason&user_id=eq.${stranger.id}`)
  check('мут записан в базу', Boolean(mutedState[0]?.muted_until), `причина: ${mutedState[0]?.mute_reason}`)
  const mutedWrite = await post(stranger.token, 'messages', { conversation_id: gid, sender_id: stranger.id, body: 'я в муте' })
  check('в муте сообщение не отправить', !mutedWrite.ok, `статус ${mutedWrite.status}`)
  const mutedReaction = await tryRpc(stranger.token, 'toggle_reaction', { msg_in: msgId, emoji_in: '🤐' })
  check('и реакцию тоже не поставить', !mutedReaction.ok, `статус ${mutedReaction.status}`)
  const mutedRead = await get(stranger.token, `messages?select=id&conversation_id=eq.${gid}&limit=1`)
  check('но читать чаты по-прежнему можно', mutedRead.length > 0)

  await rpc(admin.token, 'admin_set_mute', { uid_in: stranger.id, minutes: 0 })
  const afterUnmute = await post(stranger.token, 'messages', { conversation_id: gid, sender_id: stranger.id, body: 'мут снят' })
  check('после снятия мута сообщения уходят', afterUnmute.ok, `статус ${afterUnmute.status}`)

  await rpc(admin.token, 'admin_set_ban', { uid_in: stranger.id, banned: true, reason_in: 'тестовый бан' })
  const bannedWrite = await post(stranger.token, 'messages', { conversation_id: gid, sender_id: stranger.id, body: 'я в бане' })
  check('забаненный не пишет', !bannedWrite.ok, `статус ${bannedWrite.status}`)
  const bannedVisible = await rpc(friend.token, 'list_users', { q: 'stranger' })
  check('в каталоге видна отметка о бане', Boolean(bannedVisible.find((u) => u.id === stranger.id)?.banned_at))
  const bannedLogin = await trySignIn('stranger.test@example.com', 'StrangerPass123')
  check('и войти заново тоже не выйдет', !bannedLogin.body.access_token, `статус ${bannedLogin.status}`)
  await rpc(admin.token, 'admin_set_ban', { uid_in: stranger.id, banned: false })
  const freeLogin = await trySignIn('stranger.test@example.com', 'StrangerPass123')
  check('после разбана вход открывается снова', Boolean(freeLogin.body.access_token), `статус ${freeLogin.status}`)
  const unbannedWrite = await post(stranger.token, 'messages', { conversation_id: gid, sender_id: stranger.id, body: 'бан снят' })
  check('после разбана всё работает', unbannedWrite.ok, `статус ${unbannedWrite.status}`)

  const purged = await rpc(admin.token, 'admin_purge_user_messages', { uid_in: stranger.id })
  const leftFromStranger = await get(admin.token, `messages?select=id&sender_id=eq.${stranger.id}&deleted_at=is.null`)
  check('админ стирает все сообщения человека', leftFromStranger.length === 0, `удалено: ${purged}`)

  const modList = await rpc(admin.token, 'admin_moderation')
  check('сводка модерации собирается', Array.isArray(modList?.banned) && Array.isArray(modList?.pinned))
  const modDenied = await tryRpc(friend.token, 'admin_moderation')
  check('чужим сводка модерации не отдаётся', !modDenied.ok || modDenied.data === null, `статус ${modDenied.status}`)

  // ===== приглашения =====
  console.log('\n— Пригласительные ссылки —')
  const inviteRow = await rpc(friend.token, 'create_invite', { conv_in: gid, ttl_hours: 24, max_uses_in: 0 })
  check('админ группы создаёт ссылку', Boolean(inviteRow?.code), `код: ${inviteRow?.code}`)
  check('код короткий и без похожих букв', /^[a-hj-km-np-z2-9]{8}$/.test(inviteRow.code), inviteRow.code)

  const strangerInvite = await tryRpc(nosy.token, 'create_invite', { conv_in: gid })
  check('посторонний ссылку не создаст', !strangerInvite.ok, `статус ${strangerInvite.status}`)

  const anonInfo = await fetch(`${URL}/rest/v1/rpc/invite_info`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code_in: inviteRow.code }),
  })
  const anonInfoBody = await anonInfo.json().catch(() => null)
  check('до входа видно, куда зовут', anonInfo.ok && anonInfoBody?.state === 'ok', `название: ${anonInfoBody?.title}`)

  const joined = await rpc(nosy.token, 'redeem_invite', { code_in: inviteRow.code })
  const nosyIsMember = await get(admin.token, `conversation_members?select=user_id&conversation_id=eq.${gid}&user_id=eq.${nosy.id}`)
  check('по ссылке человек попадает в группу', joined === gid && nosyIsMember.length === 1)
  const usedInvite = await rpc(friend.token, 'list_invites', { conv_in: gid })
  check('счётчик переходов растёт', usedInvite.find((i) => i.code === inviteRow.code)?.uses === 1)

  await rpc(friend.token, 'revoke_invite', { code_in: inviteRow.code })
  const revokedState = await rpc(nosy.token, 'invite_info', { code_in: inviteRow.code })
  check('отозванная ссылка помечена', revokedState.state === 'revoked')
  await fetch(`${URL}/rest/v1/conversation_members?conversation_id=eq.${gid}&user_id=eq.${nosy.id}`, {
    method: 'DELETE',
    headers: SERVICE_H,
  })
  const revokedJoin = await tryRpc(nosy.token, 'redeem_invite', { code_in: inviteRow.code })
  check('по отозванной ссылке не войти', !revokedJoin.ok, `статус ${revokedJoin.status}`)

  const limited = await rpc(friend.token, 'create_invite', { conv_in: gid, ttl_hours: 1, max_uses_in: 1 })
  await rpc(nosy.token, 'redeem_invite', { code_in: limited.code })
  const usedUp = await rpc(friend.token, 'invite_info', { code_in: limited.code })
  check('ссылка на одного исчерпывается', usedUp.state === 'used_up', `состояние: ${usedUp.state}`)
  await rpc(friend.token, 'revoke_invite', { code_in: limited.code })

  const bannedForInvite = await rpc(admin.token, 'create_invite', { conv_in: gid, ttl_hours: 1, max_uses_in: 0 })
  await rpc(admin.token, 'admin_set_ban', { uid_in: stranger.id, banned: true, reason_in: 'проверка ссылки' })
  const bannedJoin = await tryRpc(stranger.token, 'redeem_invite', { code_in: bannedForInvite.code })
  check('забаненного ссылка в группу не пустит', !bannedJoin.ok, `статус ${bannedJoin.status}`)
  await rpc(admin.token, 'admin_set_ban', { uid_in: stranger.id, banned: false })
  await rpc(admin.token, 'revoke_invite', { code_in: bannedForInvite.code })

  // ===== главный чат и закрепления =====
  console.log('\n— Главный чат и закрепления —')
  const homeRows = await get(admin.token, 'conversations?select=id,title,is_home,pinned_at&is_home=is.true')
  check('главный чат в базе один', homeRows.length === 1, `это «${homeRows[0]?.title}»`)
  const homeId = homeRows[0]?.id
  check('главный чат закреплён', Boolean(homeRows[0]?.pinned_at))

  const newbieEmail = `newbie.${Date.now()}@example.com`
  await ensureUser(newbieEmail, 'NewbiePass123', 'Newbie')
  const newbie = await signIn(newbieEmail, 'NewbiePass123')
  const newbieChats = await rpc(newbie.token, 'list_conversations')
  check('новичок сразу состоит в главном чате', newbieChats.some((c) => c.id === homeId), `чатов: ${newbieChats.length}`)
  check('и главный чат стоит первым', newbieChats[0]?.id === homeId)
  const leaveHome = await tryRpc(newbie.token, 'leave_group', { conv_in: homeId })
  check('главный чат нельзя покинуть', !leaveHome.ok, `статус ${leaveHome.status}`)

  const pinDenied = await tryRpc(friend.token, 'admin_pin_conversation', { conv_in: gid, pinned: true })
  check('закреплять у всех может только главный админ', !pinDenied.ok, `статус ${pinDenied.status}`)

  await rpc(admin.token, 'admin_pin_conversation', { conv_in: gid, pinned: true })
  const pinnedForNewbie = await rpc(newbie.token, 'list_conversations')
  const pinnedChat = pinnedForNewbie.find((c) => c.id === gid)
  check('закреплённая группа появилась у всех', Boolean(pinnedChat), `чатов у новичка: ${pinnedForNewbie.length}`)
  check('…и помечена закреплением', Boolean(pinnedChat?.pinned_at))
  check('порядок: главный чат, потом закреплённые', pinnedForNewbie[0]?.id === homeId && pinnedForNewbie[1]?.id === gid)

  await rpc(admin.token, 'admin_pin_conversation', { conv_in: gid, pinned: false })
  const afterGlobalUnpin = await rpc(admin.token, 'list_conversations')
  check('закрепление снимается', !afterGlobalUnpin.find((c) => c.id === gid)?.pinned_at)

  const unpinHome = await tryRpc(admin.token, 'admin_pin_conversation', { conv_in: homeId, pinned: false })
  check('главный чат открепить нельзя', !unpinHome.ok, `статус ${unpinHome.status}`)

  // ===== каналы =====
  console.log('\n— Каналы —')
  const guestEmail = `guest.${Date.now()}@example.com`
  await ensureUser(guestEmail, 'GuestPass123', 'Guest')
  const guest = await signIn(guestEmail, 'GuestPass123')

  const chId = await rpc(friend.token, 'create_conversation', {
    title_in: 'Канал друга',
    description_in: 'пишут только админы',
    type_in: 'channel',
  })
  check('друг создал канал', Boolean(chId))

  const chRow = (
    await get(
      admin.token,
      `conversations?select=type,posting,listed,history_visible,reactions_enabled,slow_mode_seconds&id=eq.${chId}`,
    )
  )[0]
  check('канал сохранён с типом channel', chRow?.type === 'channel')
  check('в канале сразу «только админы»', chRow?.posting === 'admins')
  check('настройки по умолчанию включены', chRow?.listed && chRow?.history_visible && chRow?.reactions_enabled)

  const chCatalog = await rpc(guest.token, 'list_public_groups', { q: '' })
  const chCard = chCatalog.find((g) => g.id === chId)
  check('канал виден в общем каталоге', Boolean(chCard), `тип: ${chCard?.type}`)

  const ownerPost = await post(friend.token, 'messages', {
    conversation_id: chId,
    sender_id: friend.id,
    body: 'первый пост канала',
    client_id: crypto.randomUUID(),
  })
  check('админ канала пишет', ownerPost.ok, ownerPost.ok ? '' : ownerPost.body.slice(0, 120))

  const nosyChannelPost = await post(nosy.token, 'messages', {
    conversation_id: chId,
    sender_id: nosy.id,
    body: 'а можно мне?',
    client_id: crypto.randomUUID(),
  })
  check('посторонний в канал не пишет', !nosyChannelPost.ok, `статус ${nosyChannelPost.status}`)

  await rpc(guest.token, 'join_group', { conv_in: chId })
  const subs = await get(
    admin.token,
    `conversation_members?select=user_id,role&conversation_id=eq.${chId}&user_id=eq.${guest.id}`,
  )
  check('на канал можно подписаться', subs.length === 1, `роль: ${subs[0]?.role}`)

  const subPost = await post(guest.token, 'messages', {
    conversation_id: chId,
    sender_id: guest.id,
    body: 'я подписчик',
    client_id: crypto.randomUUID(),
  })
  check('подписчик канала тоже молчит', !subPost.ok, `статус ${subPost.status}`)

  const chMsgId = JSON.parse(ownerPost.body)[0].id
  const subReaction = await tryRpc(guest.token, 'toggle_reaction', { msg_in: chMsgId, emoji_in: '🔥' })
  check('но реакцию подписчик поставить может', subReaction.ok, `статус ${subReaction.status}`)

  const retype = await patch(friend.token, `conversations?id=eq.${chId}`, { type: 'group' })
  check('тип чата переделать нельзя', !retype.ok || retype.rows.length === 0, `статус ${retype.status}`)

  // ===== настройки групп =====
  console.log('\n— Настройки группы —')
  const onlyAdmins = await patch(friend.token, `conversations?id=eq.${gid}`, { posting: 'admins' })
  check('админ включает «писать только админам»', onlyAdmins.rows[0]?.posting === 'admins')
  const nosyWhenLocked = await post(nosy.token, 'messages', {
    conversation_id: gid,
    sender_id: nosy.id,
    body: 'а я всё равно напишу',
    client_id: crypto.randomUUID(),
  })
  check('…и остальные замолкают', !nosyWhenLocked.ok, `статус ${nosyWhenLocked.status}`)
  await patch(friend.token, `conversations?id=eq.${gid}`, { posting: 'all' })

  await patch(friend.token, `conversations?id=eq.${gid}`, { slow_mode_seconds: 30 })
  const slow1 = await post(nosy.token, 'messages', {
    conversation_id: gid,
    sender_id: nosy.id,
    body: 'раз',
    client_id: crypto.randomUUID(),
  })
  const slow2 = await post(nosy.token, 'messages', {
    conversation_id: gid,
    sender_id: nosy.id,
    body: 'два подряд',
    client_id: crypto.randomUUID(),
  })
  check('медленный режим держит паузу', slow1.ok && !slow2.ok, `статусы ${slow1.status}/${slow2.status}`)
  const slowAdmin1 = await post(friend.token, 'messages', {
    conversation_id: gid,
    sender_id: friend.id,
    body: 'админ раз',
    client_id: crypto.randomUUID(),
  })
  const slowAdmin2 = await post(friend.token, 'messages', {
    conversation_id: gid,
    sender_id: friend.id,
    body: 'админ два',
    client_id: crypto.randomUUID(),
  })
  check('админа медленный режим не трогает', slowAdmin1.ok && slowAdmin2.ok)
  await patch(friend.token, `conversations?id=eq.${gid}`, { slow_mode_seconds: 0 })

  await patch(friend.token, `conversations?id=eq.${gid}`, { listed: false })
  const hiddenCatalog = await rpc(guest.token, 'list_public_groups', { q: '' })
  check('скрытая группа пропадает из каталога', !hiddenCatalog.some((g) => g.id === gid))
  const ownerCatalog = await rpc(friend.token, 'list_public_groups', { q: '' })
  check('…но своим видна', ownerCatalog.some((g) => g.id === gid))
  await patch(friend.token, `conversations?id=eq.${gid}`, { listed: true })

  await patch(friend.token, `conversations?id=eq.${gid}`, { history_visible: false })
  const closedHistory = await get(guest.token, `messages?select=id&conversation_id=eq.${gid}`)
  check('закрытая история не видна чужим', closedHistory.length === 0)
  await patch(friend.token, `conversations?id=eq.${gid}`, { history_visible: true })
  const openHistory = await get(guest.token, `messages?select=id&conversation_id=eq.${gid}`)
  check('…и возвращается обратно', openHistory.length > 0, `сообщений: ${openHistory.length}`)

  await patch(friend.token, `conversations?id=eq.${gid}`, { reactions_enabled: false })
  const reactOff = await tryRpc(nosy.token, 'toggle_reaction', { msg_in: parentId, emoji_in: '👏' })
  check('реакции можно выключить', !reactOff.ok, `статус ${reactOff.status}`)
  await patch(friend.token, `conversations?id=eq.${gid}`, { reactions_enabled: true })

  const rulesByStranger = await patch(nosy.token, `conversations?id=eq.${gid}`, { slow_mode_seconds: 600 })
  check('правила меняет только админ', rulesByStranger.rows.length === 0, `статус ${rulesByStranger.status}`)

  const sneakyPin = await patch(friend.token, `conversations?id=eq.${gid}`, {
    pinned_at: new Date().toISOString(),
  })
  check('админ группы не закрепит чат у всех руками', !sneakyPin.ok, `статус ${sneakyPin.status}`)

  // ===== премиум-эмодзи =====
  console.log('\n— Премиум-эмодзи —')
  const packs = await get(guest.token, 'premium_emoji?select=emoji,pack')
  check('наборы премиум-эмодзи видны вошедшему', packs.length >= 36, `эмодзи: ${packs.length}`)
  const anonPacks = await fetch(`${URL}/rest/v1/premium_emoji?select=emoji`, {
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
  })
  const anonPacksRows = await anonPacks.json().catch(() => [])
  check('без входа наборы закрыты', !Array.isArray(anonPacksRows) || anonPacksRows.length === 0)

  const friendPremium = await rpc(friend.token, 'premium_status')
  check('у админа группы премиум открыт', friendPremium.allowed === true)
  check('в статусе четыре набора', friendPremium.packs?.length === 4, `наборы: ${friendPremium.packs?.length}`)
  check('окно активности — 14 дней', friendPremium.window_days === 14)

  const guestPremium = await rpc(guest.token, 'premium_status')
  check('у молчуна премиума нет', guestPremium.allowed === false, `сообщений за 14 дней: ${guestPremium.messages_14d}`)

  const guestCrown = await post(guest.token, 'messages', {
    conversation_id: gid,
    sender_id: guest.id,
    body: 'я тут главный 👑',
    client_id: crypto.randomUUID(),
  })
  check('премиум-эмодзи молчуну не отправить', !guestCrown.ok, `статус ${guestCrown.status}`)

  const guestCrownReaction = await tryRpc(guest.token, 'toggle_reaction', { msg_in: parentId, emoji_in: '👑' })
  check('и в реакции тоже', !guestCrownReaction.ok, `статус ${guestCrownReaction.status}`)

  const guestPlain = await post(guest.token, 'messages', {
    conversation_id: gid,
    sender_id: guest.id,
    body: 'зато обычные можно 😀',
    client_id: crypto.randomUUID(),
  })
  check('обычные эмодзи доступны всем', guestPlain.ok, guestPlain.ok ? '' : guestPlain.body.slice(0, 120))

  const guestAfter = await rpc(guest.token, 'premium_status')
  check('после первого сообщения премиум открывается', guestAfter.allowed === true, `сообщений: ${guestAfter.messages_14d}`)

  const guestCrown2 = await post(guest.token, 'messages', {
    conversation_id: gid,
    sender_id: guest.id,
    body: 'теперь можно 👑',
    client_id: crypto.randomUUID(),
  })
  check('…и премиум-эмодзи проходят', guestCrown2.ok, guestCrown2.ok ? '' : guestCrown2.body.slice(0, 120))

  // отматываем сообщения гостя на 20 дней назад — так проверяется само окно активности
  await fetch(`${URL}/rest/v1/messages?sender_id=eq.${guest.id}`, {
    method: 'PATCH',
    headers: SERVICE_H,
    body: JSON.stringify({ created_at: new Date(Date.now() - 20 * 86400000).toISOString() }),
  })
  const staleStatus = await rpc(guest.token, 'premium_status')
  check(
    'после 14 дней молчания премиум закрывается',
    staleStatus.allowed === false,
    `сообщений за окно: ${staleStatus.messages_14d}`,
  )

  const guestPlainId = JSON.parse(guestPlain.body)[0].id
  const plainEdit = await patch(guest.token, `messages?id=eq.${guestPlainId}`, { body: 'просто правка 🙂' })
  check('обычную правку это не ломает', plainEdit.rows.length === 1, `статус ${plainEdit.status}`)

  const premiumEdit = await patch(guest.token, `messages?id=eq.${guestPlainId}`, {
    body: 'подправлю на премиум 💎',
  })
  check('премиум нельзя протащить правкой', !premiumEdit.ok, `статус ${premiumEdit.status}`)

  // ===== антимат =====
  console.log('\n— Антимат —')
  const sendAs = async (token, id, body) => {
    const r = await post(token, 'messages', {
      conversation_id: gid,
      sender_id: id,
      body,
      client_id: crypto.randomUUID(),
    })
    let saved = null
    try {
      saved = JSON.parse(r.body)[0] ?? null
    } catch {
      saved = null
    }
    return { ...r, saved }
  }

  const mat = await sendAs(guest.token, guest.id, 'ты мудак и всё')
  check('сообщение с матом не отклоняется', mat.ok, `статус ${mat.status}`)
  check('…а приходит с замазанным словом', mat.saved?.body === 'ты *** и всё', String(mat.saved?.body))

  const innocent = 'погребать требовать хлебать колебать получка сучок херувим педиатр'
  const clean = await sendAs(guest.token, guest.id, innocent)
  check('похожие приличные слова фильтр не трогает', clean.saved?.body === innocent, String(clean.saved?.body))

  const spaced = await sendAs(guest.token, guest.id, 'х у й тебе')
  check('мат по буквам через пробел тоже ловится', spaced.saved?.body === '* * * тебе', String(spaced.saved?.body))

  const myStrikes = await rpc(guest.token, 'my_strikes')
  check('баллы начислены: 1 за мягкое, 2 за грубое', myStrikes.strikes === 3, `баллов: ${myStrikes.strikes}`)

  const autoMute = await get(admin.token, `user_moderation?select=muted_until,mute_reason&user_id=eq.${guest.id}`)
  check('на третьем балле автомат выдал мут', autoMute[0]?.mute_reason === 'Автомут: мат', String(autoMute[0]?.muted_until))

  const afterMute = await sendAs(guest.token, guest.id, 'а теперь просто текст')
  check('во время автомута писать нельзя', !afterMute.ok, `статус ${afterMute.status}`)

  const peekStrikes = await get(stranger.token, `profanity_strikes?select=strikes&user_id=eq.${guest.id}`)
  check('чужие баллы обычному пользователю не видны', peekStrikes.length === 0)

  const strangerReset = await tryRpc(stranger.token, 'admin_reset_strikes', { uid_in: guest.id })
  check('обнулить баллы может только главный админ', !strangerReset.ok, `статус ${strangerReset.status}`)

  await rpc(admin.token, 'admin_set_mute', { uid_in: guest.id, minutes: 0 })
  await rpc(admin.token, 'admin_reset_strikes', { uid_in: guest.id })
  const zeroed = await rpc(guest.token, 'my_strikes')
  check(
    'админ обнуляет баллы, история остаётся',
    zeroed.strikes === 0 && zeroed.total === 2,
    `баллов: ${zeroed.strikes}, срабатываний: ${zeroed.total}`,
  )

  const adminMat = await sendAs(admin.token, admin.id, 'я главный и могу сказать мудак')
  check('главного админа фильтр не трогает', adminMat.saved?.body?.includes('мудак') === true, String(adminMat.saved?.body))

  await patch(admin.token, `conversations?id=eq.${gid}`, { profanity_filter: false })
  const unfiltered = await sendAs(guest.token, guest.id, 'без фильтра мудак проходит')
  check('выключенный в группе фильтр не срабатывает', unfiltered.saved?.body?.includes('мудак') === true, String(unfiltered.saved?.body))
  await patch(admin.token, `conversations?id=eq.${gid}`, { profanity_filter: true })

  const dirtyTitle = await tryRpc(friend.token, 'create_group', {
    title_in: 'Группа мудаков',
    description_in: 'проверка названия',
  })
  check('группу с матом в названии не создать', !dirtyTitle.ok, `статус ${dirtyTitle.status}`)

  const dirtyName = await patch(guest.token, `profiles?id=eq.${guest.id}`, { display_name: 'Мудак Мудакович' })
  check('и имя профиля с матом не сохранить', !dirtyName.ok, `статус ${dirtyName.status}`)

  const strangerWord = await tryRpc(stranger.token, 'admin_add_bad_word', { word_in: 'тест', severity_in: 1 })
  check('словарь правит только главный админ', !strangerWord.ok, `статус ${strangerWord.status}`)

  await rpc(admin.token, 'admin_add_bad_word', { word_in: 'ерундистика', severity_in: 1, exact_in: false })
  const withWord = await sendAs(guest.token, guest.id, 'полная ерундистика')
  check('добавленное слово сразу работает', withWord.saved?.body === 'полная ***', String(withWord.saved?.body))

  await rpc(admin.token, 'admin_remove_bad_word', { word_in: 'ерундистика' })
  const withoutWord = await sendAs(guest.token, guest.id, 'снова ерундистика')
  check('убранное слово перестаёт ловиться', withoutWord.saved?.body === 'снова ерундистика', String(withoutWord.saved?.body))

  const profSummary = await rpc(admin.token, 'admin_profanity')
  check('сводка антимата считает срабатывания', profSummary.hits_total >= 3, `всего: ${profSummary.hits_total}`)
  check('и показывает словарь', profSummary.words?.length >= 35, `слов: ${profSummary.words?.length}`)
  const strangerProf = await rpc(stranger.token, 'admin_profanity')
  check('сводка антимата закрыта от обычных пользователей', !strangerProf.words)

  await rpc(admin.token, 'admin_reset_strikes', { uid_in: guest.id })
  await rpc(admin.token, 'admin_set_mute', { uid_in: guest.id, minutes: 0 })

  // ===== адреса и блокировка по IP =====
  console.log('\n— Адреса и IP —')
  await rpc(guest.token, 'touch_last_seen')
  await rpc(admin.token, 'touch_last_seen')
  const guestIps = await rpc(admin.token, 'admin_user_ips', { uid_in: guest.id })
  check('адрес записывается при заходе', guestIps.length >= 1, `адресов: ${guestIps.length}`)
  check('видно, что с адреса сидит не один аккаунт', guestIps[0]?.shared_with >= 1, `соседей: ${guestIps[0]?.shared_with}`)

  const strangerPeekIps = await rpc(stranger.token, 'admin_user_ips', { uid_in: guest.id })
  check('чужие адреса обычному пользователю не видны', strangerPeekIps.length === 0)

  const selfIpBan = await tryRpc(admin.token, 'admin_ban_ip', { ip_in: guestIps[0].ip })
  check('свой собственный адрес закрыть нельзя', !selfIpBan.ok, `статус ${selfIpBan.status}`)

  const banAll = await rpc(admin.token, 'admin_ban_user_ips', { uid_in: guest.id })
  check('адреса, общие с главным админом, пропускаются', banAll === 0, `закрыто: ${banAll}`)

  const banSelfAdmin = await tryRpc(admin.token, 'admin_ban_user_ips', { uid_in: admin.id })
  check('адреса главного админа не банятся вовсе', !banSelfAdmin.ok, `статус ${banSelfAdmin.status}`)

  const FAKE_IP = '203.0.113.7'
  await rpc(admin.token, 'admin_ban_ip', { ip_in: FAKE_IP, reason_in: 'проверка' })
  const bansNow = await rpc(admin.token, 'admin_ip_bans')
  check('адрес попадает в список блокировок', bansNow.some((b) => b.ip === FAKE_IP), `записей: ${bansNow.length}`)

  const banSubnet = await tryRpc(admin.token, 'admin_ban_ip', { ip_in: '203.0.113.0/24', reason_in: 'подсеть' })
  check('подсеть закрывается одной записью', banSubnet.ok, `статус ${banSubnet.status}`)

  const strangerBan = await tryRpc(stranger.token, 'admin_ban_ip', { ip_in: '198.51.100.9' })
  check('обычный пользователь адреса не банит', !strangerBan.ok, `статус ${strangerBan.status}`)

  const garbage = await tryRpc(admin.token, 'admin_ban_ip', { ip_in: 'совсем не адрес' })
  check('мусор вместо адреса отклоняется', !garbage.ok, `статус ${garbage.status}`)

  await rpc(admin.token, 'admin_unban_ip', { ip_in: FAKE_IP })
  await rpc(admin.token, 'admin_unban_ip', { ip_in: '203.0.113.0/24' })
  const bansAfter = await rpc(admin.token, 'admin_ip_bans')
  check('блокировка снимается', !bansAfter.some((b) => b.ip === FAKE_IP), `осталось: ${bansAfter.length}`)

  const anonIpBans = await fetch(`${URL}/rest/v1/ip_bans?select=ip`, {
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
  })
  const anonIpRows = await anonIpBans.json().catch(() => [])
  check('список блокировок закрыт без входа', !Array.isArray(anonIpRows) || anonIpRows.length === 0)

  const strangerIpTable = await get(stranger.token, 'user_ips?select=ip')
  check('таблица адресов закрыта от обычных пользователей', strangerIpTable.length === 0)

  // ===== боты: хозяин, код проекта, права =====
  console.log('\n— Боты —')
  const stamp = Date.now() % 1000000
  const friendName = (await get(admin.token, `profiles?select=username&id=eq.${friend.id}`))[0]?.username

  const created = await tryRpc(friend.token, 'create_bot', {
    name_in: 'Смоук-бот',
    username_in: `Смоук smoke${stamp}!`,
    description_in: 'проверочный бот на блоках',
  })
  check('друг создаёт бота', created.ok, created.ok ? '' : created.body)
  const bot = created.data ?? {}
  check('имя чистится до латиницы и получает хвост bot', bot.username === `smoke${stamp}bot`, String(bot.username))
  check(
    'токен выдан и выглядит как пароль',
    typeof bot.token === 'string' && bot.token.startsWith('tdm_') && bot.token.length >= 40,
    `${String(bot.token).slice(0, 8)}…`,
  )

  const botProfile = await get(admin.token, `profiles?select=is_bot,display_name&id=eq.${bot.profile_id}`)
  check('у бота есть профиль с пометкой «бот»', botProfile[0]?.is_bot === true, String(botProfile[0]?.display_name))

  const mine = await rpc(friend.token, 'my_bots')
  check('бот виден в списке хозяина', mine.some((b) => b.id === bot.id), `ботов: ${mine.length}`)

  const strangerBots = await get(stranger.token, 'bots?select=id,token')
  check('чужие боты и токены посторонним не видны', strangerBots.length === 0)

  const strangerEdit = await tryRpc(stranger.token, 'update_bot', { bot_in: bot.id, name_in: 'Угнанный' })
  check('чужого бота не переименовать', !strangerEdit.ok, `статус ${strangerEdit.status}`)

  const strangerRotate = await tryRpc(stranger.token, 'rotate_bot_token', { bot_in: bot.id })
  check('чужой токен не сменить', !strangerRotate.ok, `статус ${strangerRotate.status}`)

  for (const fn of ['my_bots', 'create_bot']) {
    const r = await botRpc(fn, { name_in: 'Левый', username_in: `anon${stamp}` })
    check(`без входа ${fn} закрыт`, !r.ok, `статус ${r.status}`)
  }

  const codePath = `${bot.id}/project.sb3`
  const up = await upload(friend.token, 'botcode', codePath, PNG_1PX, 'application/zip')
  check('хозяин кладёт файл проекта в хранилище', up.ok, up.ok ? '' : up.body)

  const upStranger = await upload(stranger.token, 'botcode', `${bot.id}/hack.sb3`, PNG_1PX, 'application/zip')
  check('в папку чужого бота посторонний не пишет', !upStranger.ok, `статус ${upStranger.status}`)

  await rpc(friend.token, 'set_bot_code', {
    bot_in: bot.id,
    path_in: codePath,
    name_in: 'project.sb3',
    kind_in: 'sb3',
    size_in: PNG_1PX.length,
  })
  const withCode = (await rpc(friend.token, 'my_bots')).find((b) => b.id === bot.id)
  check('код .sb3 прикреплён к боту', withCode?.code?.kind === 'sb3', String(withCode?.code?.name))

  const publicCode = await fetch(`${URL}/storage/v1/object/public/botcode/${codePath}`)
  check('ссылка на код открывается без входа', publicCode.ok, `статус ${publicCode.status}`)

  // ===== боты: токен-API, на котором держатся блоки расширения =====
  console.log('\n— Боты: блоки расширения —')
  const connect = await botRpc('bot_connect', { token_in: bot.token })
  check('блок «подключиться» работает по публичному ключу', connect.data?.name === 'Смоук-бот', connect.body.slice(0, 80))

  const badToken = await botRpc('bot_me', { token_in: 'tdm_такого-нет' })
  check('неверный токен отвергается', !badToken.ok, `статус ${badToken.status}`)

  const addToDm = await tryRpc(friend.token, 'add_bot_to_chat', { bot_in: bot.id, conv_in: dm })
  check('в личный чат бота не добавить', !addToDm.ok, `статус ${addToDm.status}`)

  const added = await tryRpc(friend.token, 'add_bot_to_chat', { bot_in: bot.id, conv_in: gid })
  check('админ чата добавляет бота в группу', added.ok, added.ok ? '' : added.body)

  const sentByBot = await botRpc('bot_send', {
    token_in: bot.token,
    chat_in: 'Группа друга',
    body_in: 'Привет, я бот на блоках',
  })
  check('блок «отправить сообщение» пишет в чат по названию', sentByBot.ok, sentByBot.ok ? '' : sentByBot.body)
  const botMsgId = sentByBot.data?.id

  const seen = await get(friend.token, `messages?select=body,sender_id&id=eq.${botMsgId}`)
  check('сообщение бота видно людям в чате', seen[0]?.body === 'Привет, я бот на блоках', String(seen[0]?.body))
  check('…и отправитель — профиль бота', seen[0]?.sender_id === bot.profile_id)

  const foreign = await botRpc('bot_send', { token_in: bot.token, chat_in: dm, body_in: 'лезу в чужой чат' })
  check('в чат, где бота нет, он не пишет', !foreign.ok, `статус ${foreign.status}`)

  const botEdited = await botRpc('bot_edit', { token_in: bot.token, msg_in: botMsgId, body_in: 'Привет, я поправился' })
  check('блок «изменить сообщение» правит свой текст', botEdited.data?.text === 'Привет, я поправился', botEdited.body.slice(0, 80))

  const alienEdit = await botRpc('bot_edit', { token_in: bot.token, msg_in: parentId, body_in: 'правлю чужое' })
  check('чужие сообщения бот не правит', !alienEdit.ok, `статус ${alienEdit.status}`)

  const dirty = await botRpc('bot_send', { token_in: bot.token, chat_in: gid, body_in: 'бот сказал мудак' })
  check('антимат ловит бота так же, как человека', dirty.data?.text === 'бот сказал ***', String(dirty.data?.text))

  const ping = await post(friend.token, 'messages', {
    conversation_id: gid,
    sender_id: friend.id,
    body: `эй @${bot.username}, проверка связи`,
    client_id: crypto.randomUUID(),
  })
  const pingId = JSON.parse(ping.body)[0]?.id
  const updates = await botRpc('bot_updates', { token_in: bot.token })
  const fresh = (updates.data ?? []).find((m) => m.id === pingId)
  check('блок «когда написали» получает свежее сообщение', Boolean(fresh), `событий: ${updates.data?.length}`)
  check('…с текстом и автором', fresh?.text?.includes('проверка связи') && fresh?.from_id === friend.id, String(fresh?.from))
  check('…и пометкой, что обратились к боту', fresh?.to_me === true)
  check('свои же сообщения боту не возвращаются', !(updates.data ?? []).some((m) => m.from_id === bot.profile_id))

  const updates2 = await botRpc('bot_updates', { token_in: bot.token })
  check('одно сообщение не приходит дважды', !(updates2.data ?? []).some((m) => m.id === pingId), `событий: ${updates2.data?.length}`)

  const react = await botRpc('bot_react', { token_in: bot.token, msg_in: pingId, emoji_in: '👍' })
  check('блок «поставить реакцию» срабатывает', react.data === true, react.body.slice(0, 80))
  const botReactions = await get(friend.token, `message_reactions?select=emoji,user_id&message_id=eq.${pingId}`)
  check('…и реакция видна людям', botReactions.some((r) => r.user_id === bot.profile_id && r.emoji === '👍'))

  const history = await botRpc('bot_history', { token_in: bot.token, chat_in: gid, limit_in: 5 })
  check('блок «история чата» отдаёт последние сообщения', (history.data ?? []).length > 0, `строк: ${history.data?.length}`)

  const members = await botRpc('bot_members', { token_in: bot.token, chat_in: gid })
  check('блок «кто в чате» перечисляет участников', (members.data ?? []).some((m) => m.id === friend.id), `людей: ${members.data?.length}`)
  check('…и помечает среди них бота', (members.data ?? []).some((m) => m.id === bot.profile_id && m.is_bot === true))

  const who = await botRpc('bot_user', { token_in: bot.token, who_in: `@${friendName}` })
  check('блок «узнать о человеке» работает по @имени', who.data?.id === friend.id, String(who.data?.name))

  const dmByBot = await botRpc('bot_send', { token_in: bot.token, chat_in: `@${friendName}`, body_in: 'личное от бота' })
  check('бот пишет в личку по @имени', dmByBot.ok, dmByBot.ok ? '' : dmByBot.body)
  const dmSeen = await get(friend.token, `messages?select=body&id=eq.${dmByBot.data?.id}`)
  check('…и человек это сообщение видит', dmSeen[0]?.body === 'личное от бота', String(dmSeen.length))

  await botRpc('bot_set', { token_in: bot.token, key_in: 'счёт', value_in: '7' })
  const recall = await botRpc('bot_get', { token_in: bot.token, key_in: 'счёт' })
  check('блоки памяти «запомнить/вспомнить» хранят значение', recall.data === '7', String(recall.data))
  const keys = await botRpc('bot_keys', { token_in: bot.token })
  check('…и перечисляют ключи', (keys.data ?? []).includes('счёт'), String(keys.data))
  await botRpc('bot_forget', { token_in: bot.token, key_in: 'счёт' })
  const forgotten = await botRpc('bot_get', { token_in: bot.token, key_in: 'счёт' })
  check('забытый ключ отдаёт пустоту, а не ошибку', forgotten.data === '', JSON.stringify(forgotten.data))
  const keysLeft = await botRpc('bot_keys', { token_in: bot.token })
  check('…и пропадает из списка ключей', (keysLeft.data ?? []).length === 0, String(keysLeft.data))

  await botRpc('bot_note', { token_in: bot.token, text_in: 'всё идёт по плану' })
  const noted = (await rpc(friend.token, 'my_bots')).find((b) => b.id === bot.id)
  check('заметка из блока видна хозяину', noted?.note === 'всё идёт по плану', String(noted?.note))

  await botRpc('bot_rename', { token_in: bot.token, name_in: 'Смоук-бот 2', description_in: 'переименовался сам' })
  const renamed = await botRpc('bot_me', { token_in: bot.token })
  check('блок «переименоваться» меняет имя', renamed.data?.name === 'Смоук-бот 2', String(renamed.data?.name))

  const removedMsg = await botRpc('bot_delete', { token_in: bot.token, msg_in: botMsgId })
  check('блок «удалить сообщение» убирает своё', removedMsg.data === true, removedMsg.body.slice(0, 80))
  const afterDel = await get(friend.token, `messages?select=deleted_at&id=eq.${botMsgId}`)
  check('…и оно исчезает из переписки', afterDel.length === 0 || Boolean(afterDel[0]?.deleted_at))

  await rpc(friend.token, 'update_bot', { bot_in: bot.id, enabled_in: false })
  const offSend = await botRpc('bot_send', { token_in: bot.token, chat_in: gid, body_in: 'я выключен' })
  check('выключенный хозяином бот молчит', !offSend.ok, `статус ${offSend.status}`)
  await rpc(friend.token, 'update_bot', { bot_in: bot.id, enabled_in: true })

  const oldToken = bot.token
  const rotated = await rpc(friend.token, 'rotate_bot_token', { bot_in: bot.id })
  check('смена токена выдаёт новый', typeof rotated?.token === 'string' && rotated.token !== oldToken)
  const deadToken = await botRpc('bot_me', { token_in: oldToken })
  check('старый токен сразу перестаёт работать', !deadToken.ok, `статус ${deadToken.status}`)
  bot.token = rotated.token

  // ===== боты: видны всем, но управляет ими хозяин и главный админ =====
  console.log('\n— Боты: каталог и присмотр —')
  const dir = await rpc(stranger.token, 'list_users', { q: `smoke${stamp}` })
  check('бот находится в каталоге людей', dir.some((u) => u.id === bot.profile_id && u.is_bot === true), `найдено: ${dir.length}`)

  const botCard = await rpc(stranger.token, 'user_card', { uid_in: bot.profile_id })
  check('в карточке бота стоит пометка', botCard?.is_bot === true)
  check('…и видно хозяина', botCard?.bot_owner === friendName, String(botCard?.bot_owner))

  const adminList = await rpc(admin.token, 'admin_bots')
  check('главный админ видит всех ботов', adminList.some((b) => b.id === bot.id), `ботов: ${adminList.length}`)
  const strangerAdminList = await rpc(stranger.token, 'admin_bots')
  check('обычному пользователю список ботов закрыт', strangerAdminList.length === 0)
  const strangerOff = await tryRpc(stranger.token, 'admin_set_bot_enabled', { bot_in: bot.id, value: false })
  check('чужого бота обычный пользователь не выключит', !strangerOff.ok, `статус ${strangerOff.status}`)

  await rpc(admin.token, 'admin_set_bot_enabled', { bot_in: bot.id, value: false })
  const offByAdmin = await botRpc('bot_me', { token_in: bot.token })
  check('главный админ выключает бота — тот замолкает', !offByAdmin.ok, `статус ${offByAdmin.status}`)
  await rpc(admin.token, 'admin_set_bot_enabled', { bot_in: bot.id, value: true })

  await rpc(friend.token, 'remove_bot_from_chat', { bot_in: bot.id, conv_in: gid })
  const botAfterRemove = await botRpc('bot_send', { token_in: bot.token, chat_in: gid, body_in: 'я ушёл, но пишу' })
  check('убранный из чата бот туда больше не пишет', !botAfterRemove.ok, `статус ${botAfterRemove.status}`)

  await rpc(friend.token, 'clear_bot_code', { bot_in: bot.id })
  await rpc(friend.token, 'delete_bot', { bot_in: bot.id })
  const botsLeft = await rpc(friend.token, 'my_bots')
  check('бот удаляется у хозяина', !botsLeft.some((b) => b.id === bot.id), `осталось: ${botsLeft.length}`)
  const botProfileLeft = await get(admin.token, `profiles?select=id&id=eq.${bot.profile_id}`)
  check('…вместе со своим профилем', botProfileLeft.length === 0)
  const deadBotToken = await botRpc('bot_me', { token_in: bot.token })
  check('…и токен удалённого бота мёртв', !deadBotToken.ok, `статус ${deadBotToken.status}`)

  // ===== анонимный ключ не должен открывать каталог =====
  console.log('\n— Анонимный доступ —')
  for (const [fn, args] of [
    ['user_card', { uid_in: admin.id }],
    ['user_card_by_name', { name_in: 'ABDev' }],
    ['list_users', { q: '' }],
    ['mention_candidates', { conv_in: gid, q: '' }],
    ['admin_stats', {}],
  ]) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    check(`без входа ${fn} закрыт`, !r.ok, `статус ${r.status}`)
  }

  // ===== уборка: база остаётся чистой, тестовые группы не висят в каталоге =====
  console.log('\n— Уборка —')
  const SH = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

  for (const [bucket, prefixes] of [
    ['attachments', [groupFile, dmFile]],
    ['avatars', [`users/${friend.id}/avatar.webp`, `groups/${gid}/avatar.webp`]],
    ['botcode', [codePath]],
  ]) {
    await fetch(`${URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: SH,
      body: JSON.stringify({ prefixes }),
    })
  }

  await fetch(`${URL}/rest/v1/conversations?id=in.(${gid},${dm},${chId})`, { method: 'DELETE', headers: SH })
  for (const u of [friend, stranger, nosy, newbie, guest]) {
    await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SH })
  }
  // тестовые адреса из TEST-NET-3 и словарное слово — на случай обрыва теста на середине
  for (const addr of ['203.0.113.7', '203.0.113.0/24']) {
    await fetch(`${URL}/rest/v1/ip_bans?ip=eq.${encodeURIComponent(addr)}`, { method: 'DELETE', headers: SH })
  }
  await fetch(`${URL}/rest/v1/bad_words?word=eq.${encodeURIComponent('ерундистика')}`, { method: 'DELETE', headers: SH })

  const leftovers = await get(admin.token, `conversations?select=id&id=in.(${gid},${dm},${chId})`)
  check('тестовые группы, каналы, диалоги, файлы и аккаунты удалены', leftovers.length === 0)

  const leftBans = await rpc(admin.token, 'admin_ip_bans')
  check('тестовые IP-блокировки сняты', !leftBans.some((b) => b.ip.startsWith('203.0.113.')), `записей: ${leftBans.length}`)

  console.log(
    `\n${failures === 0 ? `ВСЕ ПРОВЕРКИ ПРОШЛИ — ${total} из ${total}` : `ПРОВАЛЕНО ПРОВЕРОК: ${failures} из ${total}`}`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('Сбой теста:', e.message)
  process.exit(1)
})
