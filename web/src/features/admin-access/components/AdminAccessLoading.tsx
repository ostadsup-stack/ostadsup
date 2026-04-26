/** شاشة انتظار أثناء التحقق من صلاحية المدير — Tailwind فقط */
export function AdminAccessLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-300"
      dir="rtl"
    >
      <span
        className="h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 dark:border-slate-600 dark:border-t-slate-200"
        aria-hidden
      />
      <p className="text-sm font-medium">جاري التحقق من صلاحيات المدير…</p>
    </div>
  )
}
