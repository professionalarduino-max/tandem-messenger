/** Запись голосового сообщения через MediaRecorder. Работает по https и на localhost. */

const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function voiceSupported() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    window.isSecureContext
  )
}

function pickMime() {
  return PREFERRED.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? ''
}

export interface VoiceResult {
  file: File
  durationMs: number
}

export class VoiceRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: BlobPart[] = []
  private startedAt = 0

  async start() {
    if (this.recorder) return // повторный start не должен терять первый поток
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = pickMime()
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data)
    this.recorder.start()
    this.startedAt = Date.now()
  }

  get elapsedMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0
  }

  /** Останавливает запись и отдаёт файл. cancel = true — просто отпустить микрофон. */
  stop(cancel = false): Promise<VoiceResult | null> {
    return new Promise((resolve) => {
      const rec = this.recorder
      if (!rec) return resolve(null)

      let done = false
      const finish = () => {
        if (done) return
        done = true
        window.clearTimeout(guard)
        const durationMs = this.elapsedMs
        this.release()
        if (cancel) return resolve(null)

        const type = rec.mimeType || 'audio/webm'
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(this.chunks, { type })
        if (blob.size === 0) return resolve(null)
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type })
        resolve({ file, durationMs })
      }

      // если браузер не пришлёт onstop (бывает при ошибке записи) — не держим микрофон вечно
      const guard = window.setTimeout(finish, 2000)
      rec.onstop = finish
      rec.onerror = finish
      if (rec.state === 'inactive') finish()
      else rec.stop()
    })
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
    this.startedAt = 0
  }
}

export function durationLabel(ms: number | null | undefined) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
