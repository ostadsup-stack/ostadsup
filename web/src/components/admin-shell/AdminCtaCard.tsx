import { Link } from 'react-router-dom'

export function AdminCtaCard() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-600 via-slate-500 to-sky-700/95 p-8 text-white shadow-sm ring-1 ring-white/10">
      <p className="text-lg font-semibold tracking-tight sm:text-xl">Manage your platform efficiently</p>
      <p className="mt-2 max-w-lg text-sm text-white/80">
        راجع الأفواج والدعوات والمحتوى من مساحة عمل واحدة وهادئة.
      </p>
      <div className="mt-6">
        <Link
          to="/admin/groups"
          className="inline-flex items-center justify-center rounded-xl bg-white/95 px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white"
        >
          Go to management
        </Link>
      </div>
    </div>
  )
}
