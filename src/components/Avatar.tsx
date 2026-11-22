const COLORS = ['#58a6ff', '#3fb950', '#bc8cff', '#f0883e', '#db61a2', '#39c5cf', '#d29922']

function colorOf(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

export function Avatar({
  name,
  seed,
  url,
  size = 40,
  square = false,
}: {
  name: string | null | undefined
  seed: string
  url?: string | null
  size?: number
  square?: boolean
}) {
  const shape = square ? 'rounded-xl' : 'rounded-full'
  const label = (name ?? '?').trim()
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  if (url) {
    return (
      <img
        src={url}
        alt={label}
        width={size}
        height={size}
        className={`shrink-0 object-cover ${shape}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-semibold text-white ${shape}`}
      style={{ width: size, height: size, background: colorOf(seed), fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </div>
  )
}

export function AdminBadge({ title = 'Главный админ' }: { title?: string }) {
  return (
    <span
      title={title}
      className="rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase"
    >
      admin
    </span>
  )
}
