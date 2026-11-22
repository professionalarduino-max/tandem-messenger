import { useEffect, useRef, useState } from 'react'
import { signedUrl } from '../lib/api/storage'
import { durationLabel } from '../lib/voice'
import type { Message } from '../types/db'

/** Полоска из 28 столбиков — простая «псевдоволна», рисуется от id сообщения. */
function bars(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return Array.from({ length: 28 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0
    return 30 + ((h >>> (i % 8)) % 70)
  })
}

export function VoicePlayer({ message, mine }: { message: Message; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const path = message.attachment_path
  const shape = bars(message.id)

  useEffect(() => {
    let alive = true
    if (!path) return
    signedUrl(path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [path])

  useEffect(() => {
    return () => {
      audio.current?.pause()
      audio.current = null
    }
  }, [])

  function ensureAudio() {
    if (!url) return null
    if (!audio.current) {
      const el = new Audio(url)
      el.onended = () => {
        setPlaying(false)
        setProgress(0)
        setElapsed(0)
      }
      el.ontimeupdate = () => {
        const total = Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : (message.duration_ms ?? 0) / 1000
        setElapsed(el.currentTime * 1000)
        setProgress(total ? Math.min(1, el.currentTime / total) : 0)
      }
      audio.current = el
    }
    return audio.current
  }

  /** Клик по волне — перемотка. Длительность берём из файла, пока её нет — из сообщения. */
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = ensureAudio()
    if (!el) return
    const box = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    const total =
      Number.isFinite(el.duration) && el.duration > 0
        ? el.duration
        : (message.duration_ms ?? 0) / 1000
    if (!total) return
    el.currentTime = ratio * total
    setProgress(ratio)
    setElapsed(ratio * total * 1000)
  }

  function toggle() {
    if (!ensureAudio()) return
    if (playing) {
      audio.current?.pause()
      setPlaying(false)
    } else {
      audio.current?.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      )
    }
  }

  const done = Math.round(progress * shape.length)

  return (
    <div className="flex min-w-[220px] items-center gap-3 py-0.5">
      <button
        onClick={toggle}
        disabled={!url}
        title={playing ? 'Пауза' : 'Слушать'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm disabled:opacity-50 ${
          mine ? 'bg-white/20 text-white' : 'bg-[#58a6ff] text-[#0e1116]'
        }`}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <div
        onClick={seek}
        title="Перемотать"
        className="flex h-8 flex-1 cursor-pointer items-center gap-[2px]"
      >
        {shape.map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className={`w-[3px] rounded-full ${
              i < done ? (mine ? 'bg-white' : 'bg-[#58a6ff]') : mine ? 'bg-white/35' : 'bg-[#2a3340]'
            }`}
          />
        ))}
      </div>

      <span className={`shrink-0 text-xs tabular-nums ${mine ? 'text-white/70' : 'text-[#9aa7b4]'}`}>
        {durationLabel(playing || elapsed ? elapsed : message.duration_ms)}
      </span>
    </div>
  )
}
