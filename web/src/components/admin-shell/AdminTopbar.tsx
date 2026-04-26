import { Link } from 'react-router-dom'
import { ThemeToggle } from '../ThemeToggle'
import { IconBell, IconSearch } from '../NavIcons'

type AdminTopbarProps = {
  displayName: string
  sidebarOpen: boolean
  onMenuClick: () => void
  unreadNotif: number | null
}

export function AdminTopbar({ displayName, sidebarOpen, onMenuClick, unreadNotif }: AdminTopbarProps) {
  const who = displayName?.trim() || 'Admin'
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-[#111827]/90 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          aria-controls="admin-shell-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
        >
          <span className="sr-only">القائمة</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-600 dark:text-slate-300">
            Welcome back,{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-50">{who}</span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="بحث"
        >
          <IconSearch className="h-5 w-5" />
        </button>
        <Link
          to="/admin/messages"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="الرسائل"
        >
          <IconBell className="h-5 w-5" />
          {unreadNotif != null && unreadNotif > 0 ? (
            <span className="absolute end-1.5 top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500/90 px-1 text-[10px] font-bold text-white">
              {unreadNotif > 99 ? '99+' : unreadNotif}
            </span>
          ) : null}
        </Link>
        <div className="hidden h-8 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-700" aria-hidden />
        <ThemeToggle />
        <div className="ms-1 flex items-center gap-2 rounded-2xl border border-slate-200/90 py-1 pe-3 ps-1 dark:border-slate-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 text-xs font-semibold text-white">
            {initials(displayName)}
          </div>
          <span className="hidden max-w-[8rem] truncate text-sm font-medium text-slate-800 sm:inline dark:text-slate-200">
            {who}
          </span>
        </div>
      </div>
    </header>
  )
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return 'A'
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase()
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase()
}
