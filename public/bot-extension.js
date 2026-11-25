// Tandem — боты на блоках.
// Расширение для TurboWarp и DashBlocks: загрузите его по ссылке
// https://professionalarduino-max.github.io/tandem-messenger/bot-extension.js
//
// Работает и в песочнице, и без неё: никаких обращений к Scratch.vm,
// только обычные запросы к публичному API мессенджера.
// Токен бота берётся на странице «Боты» в Tandem. Токен — это пароль бота:
// проект с вшитым токеном нельзя выкладывать в общий доступ.

(function (Scratch) {
  'use strict'

  const API = 'https://dfdsuktrnxbztbyslbwo.supabase.co/rest/v1/rpc/'
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZHN1a3RybnhienRieXNsYndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMzkzMzIsImV4cCI6MjExMDkxNTMzMn0.d2m7ZJPB5dLUga9UNN2vYHMr-Wt22fKxSo87YrYPutE'

  const net = typeof Scratch.fetch === 'function' ? Scratch.fetch : fetch
  const cast = (v) => (Scratch.Cast ? Scratch.Cast.toString(v) : String(v == null ? '' : v))

  /** Сколько ждать между опросами новых сообщений. */
  const POLL_MS = 1200
  /** Сколько держать одно входящее сообщение «текущим», чтобы все шляпы успели сработать. */
  const HOLD_MS = 150

  class TandemBot {
    constructor() {
      this.token = ''
      this.me = null
      this.queue = []
      this.current = null
      this.eventId = 0
      this.fired = Object.create(null)
      this.heldAt = 0
      this.lastSent = null
      this.lastError = ''
      this.timer = null
      this.busy = false
    }

    // ——— сеть ———

    async call(fn, body) {
      if (!this.token) {
        this.lastError = 'Сначала подключи бота токеном'
        return null
      }
      try {
        const res = await net(API + fn, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON,
            Authorization: 'Bearer ' + ANON,
          },
          body: JSON.stringify(Object.assign({ token_in: this.token }, body || {})),
        })
        const text = await res.text()
        let data = null
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = text
        }
        if (!res.ok) {
          this.lastError = (data && (data.message || data.hint)) || 'ошибка ' + res.status
          return null
        }
        this.lastError = ''
        return data
      } catch (e) {
        this.lastError = 'нет связи: ' + (e && e.message ? e.message : e)
        return null
      }
    }

    startPolling() {
      if (this.timer) return
      this.timer = setInterval(() => this.poll(), POLL_MS)
    }

    stopPolling() {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
    }

    async poll() {
      if (this.busy || !this.token) return
      this.busy = true
      const rows = await this.call('bot_updates', {})
      this.busy = false
      if (!Array.isArray(rows) || !rows.length) return
      for (const row of rows) this.queue.push(row)
      if (this.queue.length > 100) this.queue.splice(0, this.queue.length - 100)
    }

    // ——— очередь входящих ———

    /** Достаёт следующее сообщение, но не чаще раза в HOLD_MS — чтобы его увидели все шляпы. */
    pump() {
      const now = Date.now()
      if (this.queue.length && now - this.heldAt > HOLD_MS) {
        this.current = this.queue.shift()
        this.eventId += 1
        this.heldAt = now
      }
    }

    /** true ровно один раз на каждое входящее сообщение для каждой шляпы. */
    fire(key, test) {
      this.pump()
      const m = this.current
      if (!m) return false
      if (this.fired[key] === this.eventId) return false
      if (Object.keys(this.fired).length > 300) this.fired = Object.create(null)
      this.fired[key] = this.eventId
      return test ? !!test(m) : true
    }

    // ——— описание блоков ———

    getInfo() {
      const S = Scratch.ArgumentType.STRING
      const N = Scratch.ArgumentType.NUMBER
      const CMD = Scratch.BlockType.COMMAND
      const REP = Scratch.BlockType.REPORTER
      const BOOL = Scratch.BlockType.BOOLEAN
      const HAT = Scratch.BlockType.HAT

      return {
        id: 'tandembot',
        name: 'Tandem · боты',
        color1: '#58a6ff',
        color2: '#3f82d6',
        color3: '#2f6bb5',
        docsURI: 'https://github.com/professionalarduino-max/tandem-messenger#readme',
        blocks: [
          '---',
          {
            opcode: 'connect',
            blockType: CMD,
            text: 'подключить бота по токену [TOKEN]',
            arguments: { TOKEN: { type: S, defaultValue: 'tdm_…' } },
          },
          { opcode: 'connected', blockType: BOOL, text: 'бот подключён?' },
          { opcode: 'botName', blockType: REP, text: 'имя бота' },
          { opcode: 'botUser', blockType: REP, text: '@имя бота' },
          {
            opcode: 'rename',
            blockType: CMD,
            text: 'переименовать бота в [NAME]',
            arguments: { NAME: { type: S, defaultValue: 'Мой бот' } },
          },
          {
            opcode: 'describe',
            blockType: CMD,
            text: 'описание бота: [DESC]',
            arguments: { DESC: { type: S, defaultValue: 'Я считаю и шучу' } },
          },
          { opcode: 'disconnect', blockType: CMD, text: 'отключить бота' },

          '---',
          {
            opcode: 'sendTo',
            blockType: CMD,
            text: 'отправить [TEXT] в чат [CHAT]',
            arguments: {
              TEXT: { type: S, defaultValue: 'Привет!' },
              CHAT: { type: S, defaultValue: 'Общий чат' },
            },
          },
          {
            opcode: 'reply',
            blockType: CMD,
            text: 'ответить [TEXT]',
            arguments: { TEXT: { type: S, defaultValue: 'Привет!' } },
          },
          {
            opcode: 'quote',
            blockType: CMD,
            text: 'ответить [TEXT] цитатой',
            arguments: { TEXT: { type: S, defaultValue: 'Согласен' } },
          },
          {
            opcode: 'editLast',
            blockType: CMD,
            text: 'изменить своё сообщение на [TEXT]',
            arguments: { TEXT: { type: S, defaultValue: 'Передумал' } },
          },
          { opcode: 'deleteLast', blockType: CMD, text: 'удалить своё сообщение' },
          {
            opcode: 'react',
            blockType: CMD,
            text: 'поставить реакцию [EMOJI]',
            arguments: { EMOJI: { type: S, defaultValue: '👍' } },
          },
          { opcode: 'pinLast', blockType: CMD, text: 'закрепить своё сообщение' },
          { opcode: 'lastSentId', blockType: REP, text: 'id моего сообщения' },

          '---',
          {
            opcode: 'whenMessage',
            blockType: HAT,
            isEdgeActivated: false,
            text: 'когда боту написали',
          },
          {
            opcode: 'whenText',
            blockType: HAT,
            isEdgeActivated: false,
            text: 'когда написали [TEXT]',
            arguments: { TEXT: { type: S, defaultValue: 'привет' } },
          },
          {
            opcode: 'whenCalled',
            blockType: HAT,
            isEdgeActivated: false,
            text: 'когда бота позвали',
          },
          { opcode: 'waitMessage', blockType: CMD, text: 'ждать сообщение' },
          { opcode: 'msgText', blockType: REP, text: 'текст сообщения' },
          { opcode: 'msgFrom', blockType: REP, text: 'автор сообщения' },
          { opcode: 'msgName', blockType: REP, text: 'имя автора' },
          { opcode: 'msgChat', blockType: REP, text: 'чат сообщения' },
          { opcode: 'msgDirect', blockType: BOOL, text: 'это личка?' },
          {
            opcode: 'msgHas',
            blockType: BOOL,
            text: 'в сообщении есть [TEXT]',
            arguments: { TEXT: { type: S, defaultValue: 'погода' } },
          },

          '---',
          { opcode: 'chats', blockType: REP, text: 'список чатов' },
          {
            opcode: 'members',
            blockType: REP,
            text: 'кто в чате [CHAT]',
            arguments: { CHAT: { type: S, defaultValue: 'Общий чат' } },
          },
          {
            opcode: 'userProp',
            blockType: REP,
            text: '[PROP] у [WHO]',
            arguments: {
              PROP: { type: S, menu: 'prop', defaultValue: 'имя' },
              WHO: { type: S, defaultValue: '@ABDev' },
            },
          },
          {
            opcode: 'history',
            blockType: REP,
            text: 'последние [N] сообщений из [CHAT]',
            arguments: {
              N: { type: N, defaultValue: 5 },
              CHAT: { type: S, defaultValue: 'Общий чат' },
            },
          },
          {
            opcode: 'joinCode',
            blockType: CMD,
            text: 'войти в чат по коду [CODE]',
            arguments: { CODE: { type: S, defaultValue: 'abc123' } },
          },
          {
            opcode: 'leave',
            blockType: CMD,
            text: 'выйти из чата [CHAT]',
            arguments: { CHAT: { type: S, defaultValue: 'Общий чат' } },
          },

          '---',
          {
            opcode: 'remember',
            blockType: CMD,
            text: 'запомнить [KEY] = [VALUE]',
            arguments: {
              KEY: { type: S, defaultValue: 'счёт' },
              VALUE: { type: S, defaultValue: '0' },
            },
          },
          {
            opcode: 'recall',
            blockType: REP,
            text: 'вспомнить [KEY]',
            arguments: { KEY: { type: S, defaultValue: 'счёт' } },
          },
          {
            opcode: 'forget',
            blockType: CMD,
            text: 'забыть [KEY]',
            arguments: { KEY: { type: S, defaultValue: 'счёт' } },
          },
          { opcode: 'memoryKeys', blockType: REP, text: 'что бот помнит' },

          '---',
          {
            opcode: 'note',
            blockType: CMD,
            text: 'записать в журнал [TEXT]',
            arguments: { TEXT: { type: S, defaultValue: 'всё идёт по плану' } },
          },
          { opcode: 'lastErrorBlock', blockType: REP, text: 'последняя ошибка' },
          {
            opcode: 'itemOf',
            blockType: REP,
            text: '[N]-й в списке [LIST]',
            arguments: {
              N: { type: N, defaultValue: 1 },
              LIST: { type: S, defaultValue: 'раз, два, три' },
            },
          },
          {
            opcode: 'lengthOf',
            blockType: REP,
            text: 'длина списка [LIST]',
            arguments: { LIST: { type: S, defaultValue: 'раз, два, три' } },
          },
        ],
        menus: {
          prop: {
            acceptReporters: true,
            items: ['имя', '@имя', 'описание', 'онлайн', 'сообщений', 'бот?'],
          },
        },
      }
    }

    // ——— бот ———

    async connect(args) {
      this.token = cast(args.TOKEN).trim()
      this.me = null
      this.queue = []
      this.current = null
      const me = await this.call('bot_connect', {})
      if (!me) {
        this.stopPolling()
        return
      }
      this.me = me
      this.startPolling()
    }

    connected() {
      return !!this.me
    }

    botName() {
      return this.me ? this.me.name : ''
    }

    botUser() {
      return this.me ? '@' + this.me.username : ''
    }

    async rename(args) {
      const r = await this.call('bot_rename', { name_in: cast(args.NAME) })
      if (r && this.me) this.me.name = r.name
    }

    async describe(args) {
      const name = this.me ? this.me.name : 'Бот'
      await this.call('bot_rename', { name_in: name, description_in: cast(args.DESC) })
    }

    disconnect() {
      this.stopPolling()
      this.token = ''
      this.me = null
      this.queue = []
      this.current = null
    }

    // ——— сообщения ———

    async sendTo(args) {
      const r = await this.call('bot_send', {
        chat_in: cast(args.CHAT),
        body_in: cast(args.TEXT),
      })
      if (r) this.lastSent = r
    }

    async reply(args) {
      if (!this.current) {
        this.lastError = 'Боту ещё никто не писал — отвечать некому'
        return
      }
      const r = await this.call('bot_send', {
        chat_in: this.current.chat,
        body_in: cast(args.TEXT),
      })
      if (r) this.lastSent = r
    }

    async quote(args) {
      if (!this.current) {
        this.lastError = 'Боту ещё никто не писал — цитировать нечего'
        return
      }
      const r = await this.call('bot_send', {
        chat_in: this.current.chat,
        body_in: cast(args.TEXT),
        reply_in: this.current.id,
      })
      if (r) this.lastSent = r
    }

    async editLast(args) {
      if (!this.lastSent) {
        this.lastError = 'Бот ещё ничего не отправлял'
        return
      }
      const r = await this.call('bot_edit', {
        msg_in: this.lastSent.id,
        body_in: cast(args.TEXT),
      })
      if (r) this.lastSent = r
    }

    async deleteLast() {
      if (!this.lastSent) {
        this.lastError = 'Бот ещё ничего не отправлял'
        return
      }
      await this.call('bot_delete', { msg_in: this.lastSent.id })
      this.lastSent = null
    }

    async react(args) {
      const target = this.current || this.lastSent
      if (!target) {
        this.lastError = 'Не на что ставить реакцию'
        return
      }
      await this.call('bot_react', { msg_in: target.id, emoji_in: cast(args.EMOJI) })
    }

    async pinLast() {
      const target = this.lastSent || this.current
      if (!target) {
        this.lastError = 'Нечего закреплять'
        return
      }
      await this.call('bot_pin', { msg_in: target.id, pinned: true })
    }

    lastSentId() {
      return this.lastSent ? this.lastSent.id : ''
    }

    // ——— входящие ———

    whenMessage() {
      return this.fire('любое')
    }

    whenText(args) {
      const needle = cast(args.TEXT).trim().toLowerCase()
      return this.fire('текст:' + needle, (m) => String(m.text).toLowerCase().includes(needle))
    }

    whenCalled() {
      return this.fire('позвали', (m) => !!m.to_me)
    }

    waitMessage() {
      const start = this.eventId
      return new Promise((resolve) => {
        const tick = () => {
          this.pump()
          if (this.eventId > start) resolve()
          else setTimeout(tick, 80)
        }
        tick()
      })
    }

    msgText() {
      return this.current ? this.current.text : ''
    }

    msgFrom() {
      return this.current ? '@' + this.current.from : ''
    }

    msgName() {
      return this.current ? this.current.from_name : ''
    }

    /** Название группы, а для лички — @имя собеседника. И то и другое годится для «отправить в чат». */
    msgChat() {
      if (!this.current) return ''
      if (this.current.chat_type === 'direct') return '@' + this.current.from
      return this.current.chat_title || this.current.chat
    }

    msgDirect() {
      return !!this.current && this.current.chat_type === 'direct'
    }

    msgHas(args) {
      if (!this.current) return false
      return String(this.current.text).toLowerCase().includes(cast(args.TEXT).trim().toLowerCase())
    }

    // ——— чаты и люди ———

    async chats() {
      const me = await this.call('bot_me', {})
      if (!me) return ''
      this.me = me
      return (me.chats || []).map((c) => c.title).join(', ')
    }

    async members(args) {
      const rows = await this.call('bot_members', { chat_in: cast(args.CHAT) })
      if (!Array.isArray(rows)) return ''
      return rows.map((p) => '@' + p.username).join(', ')
    }

    async userProp(args) {
      const info = await this.call('bot_user', { who_in: cast(args.WHO) })
      if (!info) return ''
      switch (cast(args.PROP)) {
        case '@имя':
          return '@' + info.username
        case 'описание':
          return info.bio || ''
        case 'онлайн':
          return info.online ? 'да' : 'нет'
        case 'сообщений':
          return info.messages
        case 'бот?':
          return info.is_bot ? 'да' : 'нет'
        default:
          return info.name
      }
    }

    async history(args) {
      const rows = await this.call('bot_history', {
        chat_in: cast(args.CHAT),
        limit_in: Number(args.N) || 5,
      })
      if (!Array.isArray(rows)) return ''
      return rows.map((m) => m.from_name + ': ' + m.text).join('\n')
    }

    async joinCode(args) {
      await this.call('bot_join', { code_in: cast(args.CODE) })
    }

    async leave(args) {
      await this.call('bot_leave', { chat_in: cast(args.CHAT) })
    }

    // ——— память ———

    async remember(args) {
      await this.call('bot_set', { key_in: cast(args.KEY), value_in: cast(args.VALUE) })
    }

    async recall(args) {
      const v = await this.call('bot_get', { key_in: cast(args.KEY) })
      return v == null ? '' : v
    }

    async forget(args) {
      await this.call('bot_forget', { key_in: cast(args.KEY) })
    }

    async memoryKeys() {
      const rows = await this.call('bot_keys', {})
      return Array.isArray(rows) ? rows.join(', ') : ''
    }

    // ——— мелочи ———

    async note(args) {
      await this.call('bot_note', { text_in: cast(args.TEXT) })
    }

    lastErrorBlock() {
      return this.lastError
    }

    /** Список — это либо строки через запятую, либо строки через перевод строки, либо JSON. */
    toList(raw) {
      const s = cast(raw).trim()
      if (!s) return []
      if (s[0] === '[') {
        try {
          const parsed = JSON.parse(s)
          if (Array.isArray(parsed)) return parsed.map((x) => cast(x))
        } catch {
          /* не JSON — режем как обычную строку */
        }
      }
      if (s.includes('\n')) return s.split('\n').map((x) => x.trim())
      return s.split(',').map((x) => x.trim())
    }

    itemOf(args) {
      const list = this.toList(args.LIST)
      const i = Math.round(Number(args.N) || 0)
      return i >= 1 && i <= list.length ? list[i - 1] : ''
    }

    lengthOf(args) {
      return this.toList(args.LIST).length
    }
  }

  Scratch.extensions.register(new TandemBot())
})(Scratch)
