import { Link, NavLink, useLocation } from 'react-router-dom'
import { ADMIN_SHELL_NAV } from './navConfig'
import { IconLogOut } from '../NavIcons'

type AdminSidebarProps = {
  open: boolean
  onClose: () => void
  displayName: string
  onSignOut: () => void
}

export function AdminSidebar({ open, onClose, displayName, onSignOut }: AdminSidebarProps) {
  const location = useLocation()

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        id="admin-shell-sidebar"
        className={`fixed right-0 top-0 z-50 flex h-full w-64 flex-col border-l border-slate-200/80 bg-white transition-transform duration-200 ease-out dark:border-slate-800 dark:bg-[#111827] lg:translate-x-0 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-label="قائمة الإدارة"
      >
        <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-5 dark:border-slate-800">
          <Link
            to="/admin/dashboard"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white"
            onClick={onClose}
          >
            Ostadi
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ADMIN_SHELL_NAV.map((item) => {
            const Icon = item.Icon
            const activeFn = item.activeMatch
            return (
              <NavLink
                key={item.to + String(item.end ?? false)}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) => {
                  const on = activeFn != null ? activeFn(location.pathname) : isActive
                  return [
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    on
                      ? 'bg-gradient-to-l from-sky-600/90 via-slate-600/95 to-slate-700 text-white shadow-sm dark:from-sky-500/85 dark:via-slate-600 dark:to-slate-700'
                      : 'text-slate-500 hover:bg-slate-100/90 dark:text-slate-400 dark:hover:bg-slate-800/70',
                  ].join(' ')
                }}
              >
                <Icon className="h-[1.125rem] w-[1.125rem] shrink-0 opacity-90" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {initials(displayName)}
            </div>
            <span className="min-w-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">{displayName}</span>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200/90 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/80"
          >
            <IconLogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  )
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return 'A'
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase()
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase()
}
