/**
 * Константы приложения.
 * Главный админ задан здесь же: этот аккаунт получает роль admin во всех группах
 * (включая созданные другими) и права модерации. Флаг хранится в profiles.is_super_admin,
 * здесь — только для подписей в интерфейсе.
 */
export const APP_NAME = 'Tandem'

export const SUPER_ADMIN = {
  email: 'abdev2013@gmail.com',
  username: 'ABDev',
  displayName: 'ABDev',
} as const

export const LIMITS = {
  messagesPerPage: 50,
  maxAttachmentBytes: 20 * 1024 * 1024,
} as const
