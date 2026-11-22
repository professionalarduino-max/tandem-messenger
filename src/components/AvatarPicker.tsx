import { useRef, useState } from 'react'
import { Avatar } from './Avatar'

/** Квадратная аватарка с загрузкой файла. Сжатие и выгрузка — в переданном upload(). */
export function AvatarPicker({
  name,
  seed,
  url,
  square = false,
  size = 72,
  canEdit = true,
  upload,
  onDone,
  onRemove,
}: {
  name: string | null | undefined
  seed: string
  url: string | null
  square?: boolean
  size?: number
  canEdit?: boolean
  upload: (file: File) => Promise<string>
  onDone: (url: string) => Promise<void> | void
  onRemove?: () => Promise<void> | void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file?: File) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await onDone(await upload(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name} seed={seed} url={url} size={size} square={square} />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-xs">
            …
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-col items-start gap-1">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="rounded-lg border border-[#2a3340] px-3 py-1.5 text-sm text-[#9aa7b4] transition hover:text-white disabled:opacity-50"
          >
            {url ? 'Заменить фото' : 'Загрузить фото'}
          </button>
          {url && onRemove && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onRemove()
                } finally {
                  setBusy(false)
                }
              }}
              className="px-1 text-xs text-[#64727f] transition hover:text-red-300"
            >
              удалить
            </button>
          )}
          {error && <span className="text-xs text-red-300">{error}</span>}
        </div>
      )}
    </div>
  )
}
