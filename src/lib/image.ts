/** Уменьшает картинку до квадрата maxSize и возвращает webp — чтобы не грузить мегабайты ради аватарки. */
export async function resizeToSquare(file: File, maxSize = 512, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const target = Math.min(side, maxSize)

  const canvas = document.createElement('canvas')
  canvas.width = target
  canvas.height = target
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Канвас недоступен')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение'))),
      'image/webp',
      quality,
    )
  })
}

export function isImage(mime: string | null | undefined) {
  return Boolean(mime?.startsWith('image/'))
}

export function humanSize(bytes: number | null | undefined) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
