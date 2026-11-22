import { useEffect } from 'react'

export function Lightbox({
  url,
  name,
  onClose,
}: {
  url: string
  name?: string | null
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <img
        src={url}
        alt={name ?? ''}
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="mt-3 flex items-center gap-4 text-sm text-[#9aa7b4]">
        {name && <span className="max-w-[60vw] truncate">{name}</span>}
        <a
          href={url}
          download={name ?? true}
          onClick={(e) => e.stopPropagation()}
          className="text-[#58a6ff] hover:underline"
        >
          Скачать
        </a>
        <button onClick={onClose}>Закрыть ✕</button>
      </div>
    </div>
  )
}
