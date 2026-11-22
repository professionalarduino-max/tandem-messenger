import { useEffect, useState } from 'react'
import { signedUrl } from '../lib/api/storage'
import { humanSize, isImage } from '../lib/image'
import { Icon } from './Icon'
import type { Message } from '../types/db'

export function MessageAttachment({
  message,
  onOpenImage,
}: {
  message: Message
  onOpenImage: (url: string, name: string | null) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const path = message.attachment_path

  useEffect(() => {
    let alive = true
    if (!path) return
    signedUrl(path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [path])

  if (!path) return null

  if (isImage(message.attachment_mime)) {
    return (
      <button
        onClick={() => url && onOpenImage(url, message.attachment_name)}
        className="mb-1 block max-w-[320px] overflow-hidden rounded-xl border border-white/10"
        title={message.attachment_name ?? ''}
      >
        {url ? (
          <img src={url} alt={message.attachment_name ?? ''} className="max-h-[320px] w-full object-cover" />
        ) : (
          <div className="flex h-40 w-[260px] items-center justify-center bg-black/20 text-sm text-[#9aa7b4]">
            загружаем…
          </div>
        )}
      </button>
    )
  }

  return (
    <a
      href={url ?? undefined}
      download={message.attachment_name ?? true}
      className="mb-1 flex max-w-[320px] items-center gap-3 rounded-xl border border-white/15 bg-black/15 px-3 py-2 transition hover:bg-black/25"
    >
      <Icon name="file" size={22} className="opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{message.attachment_name ?? 'файл'}</span>
        <span className="block text-xs opacity-70">{humanSize(message.attachment_size)}</span>
      </span>
    </a>
  )
}
