import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { CHANGELOG, LATEST, markReleasesSeen } from '../lib/changelog'
import { fullDate } from '../lib/format'
import { APP_NAME } from '../config'

/** Что нового: история обновлений лентой, свежее сверху. */
export default function Changelog() {
  const nav = useNavigate()

  // открыли страницу — значит, выпуск прочитан и точка в панели гаснет
  useEffect(() => markReleasesSeen(), [])

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#2a3340] bg-[#0e1116]/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => nav('/')}
          className="rounded-lg p-1.5 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white md:hidden"
          title="Назад"
        >
          <Icon name="back" />
        </button>
        <Icon name="gift" size={20} className="text-[#bc8cff]" />
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold">Что нового</h1>
          <p className="truncate text-xs text-[#64727f]">
            версия {LATEST.version} · {fullDate(LATEST.date)}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[760px] p-4 pb-12">
        {CHANGELOG.map((rel, i) => (
          <section key={rel.version} className="relative pl-7">
            {/* вертикальная линия ленты: у последнего выпуска обрываем */}
            {i < CHANGELOG.length - 1 && (
              <span className="absolute top-6 bottom-0 left-[7px] w-px bg-[#2a3340]" />
            )}
            <span
              className={`absolute top-[7px] left-0 h-3.5 w-3.5 rounded-full border-2 ${
                i === 0 ? 'border-[#bc8cff] bg-[#bc8cff]/30' : 'border-[#2a3340] bg-[#0e1116]'
              }`}
            />

            <div className="pb-8">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-lg font-semibold">{rel.title}</h2>
                <span className="rounded-md border border-[#2a3340] px-1.5 py-0.5 text-[11px] text-[#9aa7b4]">
                  v{rel.version}
                </span>
                {i === 0 && (
                  <span className="rounded-md bg-[#bc8cff]/15 px-1.5 py-0.5 text-[11px] text-[#bc8cff]">
                    свежее
                  </span>
                )}
                <span className="text-xs text-[#64727f]">{fullDate(rel.date)}</span>
              </div>

              <p className="mt-1.5 text-sm leading-relaxed text-[#9aa7b4]">{rel.summary}</p>

              <div className="mt-3 space-y-2.5">
                {rel.blocks.map((b) => (
                  <div key={b.title} className="rounded-xl border border-[#2a3340] bg-[#161b22] p-3.5">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Icon name={b.icon} size={15} className="text-[#58a6ff]" />
                      {b.title}
                    </h3>
                    <ul className="space-y-1.5">
                      {b.items.map((text) => (
                        <li key={text} className="flex gap-2 text-sm leading-relaxed text-[#c6d0da]">
                          <Icon name="check" size={13} className="mt-1 shrink-0 text-[#3fb950]" />
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        <p className="text-center text-xs text-[#64727f]">
          {APP_NAME} · список пишется вручную, когда выходит обновление
        </p>
      </div>
    </div>
  )
}
