export type ConversationType = 'direct' | 'group'

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_super_admin: boolean
  last_seen_at: string
  created_at: string
}

export interface UserSearchResult {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_super_admin: boolean
  last_seen_at: string
}

/** Строка каталога пользователей: профиль плюс немного статистики. */
export interface DirectoryUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_super_admin: boolean
  last_seen_at: string
  created_at: string
  is_me: boolean
  message_count: number
  group_count: number
  banned_at: string | null
  /** срок мута; база отдаёт его, только пока он не истёк */
  muted_until: string | null
}

/** Состояние модерации: бан бессрочный, мут — до срока. */
export interface Moderation {
  banned_at: string | null
  ban_reason: string | null
  muted_until: string | null
  mute_reason: string | null
}

/** Карточка профиля — то, что открывается по клику на аватарку. */
export interface UserCard {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_super_admin: boolean
  last_seen_at: string
  created_at: string
  is_me: boolean
  message_count: number
  reactions_got: number
  group_count: number
  common_groups: { id: string; title: string | null; avatar_url: string | null }[]
  /** личный чат с этим человеком, если он уже заведён */
  direct_id: string | null
  moderation: Moderation
  /** почту база показывает только главному админу */
  email: string | null
}

export interface MentionCandidate {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_member: boolean
}

export type InviteState = 'ok' | 'revoked' | 'expired' | 'used_up'

export interface Invite {
  code: string
  created_at: string
  expires_at: string | null
  max_uses: number | null
  uses: number
  revoked_at: string | null
  state: InviteState
  author: string | null
}

/** Что видит человек, открывший пригласительную ссылку. */
export interface InviteInfo {
  state: InviteState | 'not_found'
  code?: string
  conversation_id?: string
  title?: string | null
  description?: string | null
  avatar_url?: string | null
  members?: number
  messages?: number
  expires_at?: string | null
  uses?: number
  max_uses?: number | null
  i_am_member?: boolean
  author?: { username: string; display_name: string | null; avatar_url: string | null }
}

/** Сводка модерации для админ-панели. */
export interface AdminModeration {
  banned: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    since: string
    reason: string | null
  }[]
  muted: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    until: string
    reason: string | null
  }[]
  pinned: {
    id: string
    title: string | null
    avatar_url: string | null
    type: ConversationType
    is_home: boolean
    members: number
  }[]
  invites: number
}

/** Сводка админ-панели — то, что отдаёт admin_stats(). */
export interface AdminStats {
  generated_at: string
  users: { total: number; online: number; active_day: number; active_week: number; new_week: number }
  conversations: { total: number; groups: number; directs: number; active_week: number }
  messages: {
    total: number
    deleted: number
    today: number
    week: number
    text: number
    files: number
    voice: number
    capsules: number
    edited: number
    pinned: number
    attachment_bytes: number
  }
  reactions: number
  capsules: { sealed: number; opened: number; next_open_at: string | null }
  daily: { day: string; messages: number }[]
  top_users: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    is_super_admin: boolean
    last_seen_at: string
    messages: number
  }[]
  top_groups: {
    id: string
    title: string | null
    avatar_url: string | null
    members: number
    messages: number
    last_message_at: string
  }[]
  newcomers: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    created_at: string
  }[]
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  client_id: string | null
  kind: 'text' | 'file' | 'voice' | 'system' | 'capsule'
  body: string | null
  attachment_path: string | null
  attachment_mime: string | null
  attachment_size: number | null
  attachment_name: string | null
  duration_ms: number | null
  reply_to: string | null
  edited_at: string | null
  deleted_at: string | null
  pinned_at: string | null
  pinned_by: string | null
  /** капсула времени: когда её можно вскрыть */
  open_at: string | null
  created_at: string
  reactions?: Reaction[]
  /** текст капсулы. До срока база его не отдаёт, поэтому здесь null */
  capsule?: CapsuleBody | null
  sender?: {
    username: string
    display_name: string | null
    avatar_url: string | null
    is_super_admin: boolean
  } | null
  parent?: MessageQuote | null
  /** только на клиенте */
  pending?: boolean
  failed?: boolean
}

/** Короткая выжимка сообщения, на которое отвечают. */
export interface MessageQuote {
  id: string
  body: string | null
  attachment_name: string | null
  kind: Message['kind']
  deleted_at: string | null
  sender: { username: string; display_name: string | null } | null
}

export interface CapsuleBody {
  body: string
  open_at: string
}

export interface Reaction {
  emoji: string
  user_id: string
}

export interface SearchHit {
  id: string
  conversation_id: string
  conversation_title: string | null
  conversation_type: ConversationType
  body: string | null
  created_at: string
  sender_username: string | null
}

export interface ConversationPreview {
  id: string
  type: ConversationType
  title: string | null
  avatar_url: string | null
  last_message_at: string
  last_message_body: string | null
  last_message_sender: string | null
  /** вид последнего сообщения — по нему в списке рисуется иконка */
  last_message_kind: Message['kind'] | null
  unread_count: number
  member_count: number
  my_role: 'member' | 'admin'
  peer_id: string | null
  peer_last_seen: string | null
  /** закреплён главным админом для всех */
  pinned_at: string | null
  /** главный чат мессенджера: всегда первый и его нельзя покинуть */
  is_home: boolean
}

export interface PublicGroup {
  id: string
  title: string | null
  description: string | null
  avatar_url: string | null
  created_at: string
  last_message_at: string
  member_count: number
  message_count: number
  i_am_member: boolean
  creator_username: string | null
}

export interface Member {
  user_id: string
  role: 'member' | 'admin'
  joined_at: string
  profile: Pick<
    Profile,
    'username' | 'display_name' | 'avatar_url' | 'bio' | 'is_super_admin' | 'last_seen_at'
  >
}

export interface Conversation {
  id: string
  type: ConversationType
  title: string | null
  description: string | null
  avatar_url: string | null
  created_by: string | null
  created_at: string
  last_message_at: string
  pinned_at: string | null
  pinned_by: string | null
  is_home: boolean
}
