import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  insertTeacherCatalogForProfile,
  loadAdminTeachersCatalog,
  type AdminCatalogTeacherRow,
} from '../../lib/adminTeachersCatalog'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { IconBell } from '../../components/NavIcons'
import type { AdminLayoutOutletContext } from './AdminLayout'

type ToggleField = 'active' | 'hidden'

function rowBusyKey(r: AdminCatalogTeacherRow) {
  return (r.catalog_id ?? r.profile_id) as string
}

export function AdminTeachersPage() {
  const octx = useOutletContext<AdminLayoutOutletContext | undefined>()
  const adminUnreadFromPeer = octx?.adminUnreadFromPeer ?? new Set<string>()
  const { session } = useAuth()
  const [rows, setRows] = useState<AdminCatalogTeacherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [toggling, setToggling] = useState<{ key: string; field: ToggleField } | null>(null)

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setRows([])
      setLoading(false)
      return
    }
    setErr(null)
    setLoading(true)
    const { rows: next, error } = await loadAdminTeachersCatalog()
    setRows(next)
    setErr(error)
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onToggleActive(t: AdminCatalogTeacherRow) {
    const k = rowBusyKey(t)
    setToggling({ key: k, field: 'active' })
    setErr(null)
    const nextActive = !t.is_active

    if (t.has_catalog_row && t.catalog_id) {
      const { error } = await supabase.from('teachers').update({ is_active: nextActive }).eq('id', t.catalog_id)
      setToggling(null)
      if (error) {
        setErr(error.message)
        return
      }
      setRows((prev) => prev.map((r) => (rowBusyKey(r) === k ? { ...r, is_active: nextActive } : r)))
      return
    }

    if (t.profile_id) {
      const { error } = await insertTeacherCatalogForProfile({
        profile_id: t.profile_id,
        full_name: t.full_name,
        specialty: t.specialty_display,
        public_contact_email: t.email !== '—' && t.email.includes('@') ? t.email : null,
        is_active: nextActive,
        catalog_hidden: false,
      })
      setToggling(null)
      if (error) {
        setErr(error)
        return
      }
      await reload()
      return
    }

    setToggling(null)
    setErr('لا يمكن تحديث الكتالوج بدون ربط بملف في المنصة.')
  }

  async function onToggleHidden(t: AdminCatalogTeacherRow) {
    const k = rowBusyKey(t)
    setToggling({ key: k, field: 'hidden' })
    setErr(null)
    const nextHidden = !t.catalog_hidden

    if (t.has_catalog_row && t.catalog_id) {
      const { error } = await supabase.from('teachers').update({ catalog_hidden: nextHidden }).eq('id', t.catalog_id)
      setToggling(null)
      if (error) {
        setErr(error.message)
        return
      }
      setRows((prev) => prev.map((r) => (rowBusyKey(r) === k ? { ...r, catalog_hidden: nextHidden } : r)))
      return
    }

    if (t.profile_id) {
      const { error } = await insertTeacherCatalogForProfile({
        profile_id: t.profile_id,
        full_name: t.full_name,
        specialty: t.specialty_display,
        public_contact_email: t.email !== '—' && t.email.includes('@') ? t.email : null,
        is_active: true,
        catalog_hidden: nextHidden,
      })
      setToggling(null)
      if (error) {
        setErr(error)
        return
      }
      await reload()
      return
    }

    setToggling(null)
    setErr('لا يمكن تحديث الكتالوج بدون ربط بملف في المنصة.')
  }

  async function onAddCatalog(t: AdminCatalogTeacherRow) {
    if (!t.profile_id) return
    const k = rowBusyKey(t)
    setToggling({ key: k, field: 'active' })
    setErr(null)
    const { error } = await insertTeacherCatalogForProfile({
      profile_id: t.profile_id,
      full_name: t.full_name,
      specialty: t.specialty_display,
      public_contact_email: t.email !== '—' && t.email.includes('@') ? t.email : null,
      is_active: true,
      catalog_hidden: false,
    })
    setToggling(null)
    if (error) {
      setErr(error)
      return
    }
    await reload()
  }

  if (loading) return <Loading label="جاري تحميل قائمة الأساتذة…" />

  return (
    <div className="page">
      <PageHeader
        title="إدارة الأساتذة"
        subtitle="أساتذة من ملفات المنصة (profiles، دور أستاذ) مع ربط اختياري بجدول teachers للكتالوج الإداري؛ التخصص والهاتف وواتساب من الملف، وعدد الأفواج من مساحة الأستاذ."
      />
      <ErrorBanner message={err} />

      <div className="admin-cohorts__toolbar">
        <div className="admin-cohorts__row-actions">
          <Link to="/admin/invitations?role=teacher" className="btn btn--primary">
            إرسال دعوة لأستاذ
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <section className="section">
          <EmptyState
            title="لا يوجد حسابات أساتذة"
            hint={
              <>
                لا يوجد في المنصة مستخدِمون بدور <strong>أستاذ</strong> في <code>profiles</code>، ولا سجلات كتالوج
                يتيمة. سجّل دعوة من{' '}
                <Link to="/admin/invitations?role=teacher">صفحة الدعوات</Link> أو أضف صفوفاً في <code>profiles</code>{' '}
                / <code>teachers</code>.
              </>
            }
          />
        </section>
      ) : (
        <section className="section">
          {rows.some((r) => r.profile_id && !r.has_catalog_row) ? (
            <p className="mb-4 rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
              سجّل <strong>أستاذ</strong> في المنصة (جدول <code>profiles</code>) يظهر هنا مباشرة. إن لم يكن له سجل في{' '}
              <code>teachers</code> بعد، استخدِم &quot;أضف سجل كتالوج&quot; أو أي زر في عمودي التعطيل/الإخفاء ليُنشأ
              الربط تلقائياً.
            </p>
          ) : null}
          <div
            className="admin-cohorts__table-wrap overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-700/80"
            role="region"
            aria-label="جدول الأساتذة"
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الاسم الكامل</th>
                  <th>التخصص</th>
                  <th>التواصل عبر التطبيق</th>
                  <th>واتساب</th>
                  <th>الإيميل</th>
                  <th>الأفواج</th>
                  <th className="admin-table__actions">تعطيل</th>
                  <th className="admin-table__actions">إخفاء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const busyK = rowBusyKey(r)
                  const busyActive = toggling?.key === busyK && toggling.field === 'active'
                  const busyHidden = toggling?.key === busyK && toggling.field === 'hidden'
                  return (
                    <tr key={r.catalog_id ?? `p-${r.profile_id}`}>
                      <td data-label="الاسم الكامل">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            {r.full_name}
                            {r.profile_id && adminUnreadFromPeer.has(r.profile_id) ? (
                              <span
                                className="inline-flex shrink-0"
                                title="رسالة جديدة من أستاذ (درّدشة المدير)"
                                aria-label="رسالة جديدة"
                              >
                                <IconBell className="h-3.5 w-3.5 text-rose-500" />
                              </span>
                            ) : null}
                          </span>
                          {r.profile_status === 'blocked' ? (
                            <span className="pill">ملف منصة موقوف</span>
                          ) : null}
                          {r.has_catalog_row ? null : r.profile_id ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              بلا سجل teachers
                            </span>
                          ) : null}
                        </div>
                        {r.college_name ? (
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{r.college_name}</div>
                        ) : null}
                        {r.profile_id && !r.has_catalog_row ? (
                          <div className="mt-1">
                            <button
                              type="button"
                              className="btn btn--secondary btn--small"
                              disabled={busyActive || busyHidden}
                              onClick={() => void onAddCatalog(r)}
                            >
                              {busyActive ? '…' : 'أضف سجل كتالوج'}
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td data-label="التخصص">{r.specialty_display ?? '—'}</td>
                      <td className="input--ltr" data-label="التواصل عبر التطبيق">
                        {r.app_contact ?? '—'}
                      </td>
                      <td className="input--ltr" data-label="واتساب">
                        {r.whatsapp ?? '—'}
                      </td>
                      <td className="input--ltr" data-label="الإيميل">
                        {r.email}
                      </td>
                      <td data-label="الأفواج">{r.cohort_count.toLocaleString('ar')}</td>
                      <td className="admin-table__actions" data-label="تعطيل">
                        <div className="flex flex-col items-start gap-1">
                          {r.has_catalog_row ? (
                            r.is_active ? (
                              <span className="pill pill--ok">نشط (كتالوج)</span>
                            ) : (
                              <span className="pill">معطّل (كتالوج)</span>
                            )
                          ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                          )}
                          <button
                            type="button"
                            className={
                              (r.has_catalog_row ? r.is_active : true)
                                ? 'btn btn--ghost btn--small'
                                : 'btn btn--secondary btn--small'
                            }
                            disabled={!r.profile_id && !r.catalog_id ? true : busyActive || busyHidden}
                            onClick={() => void onToggleActive(r)}
                            title={!r.profile_id && !r.catalog_id ? 'سجل بلا ربط منصة' : undefined}
                          >
                            {busyActive ? '…' : r.has_catalog_row ? (r.is_active ? 'تعطيل' : 'تفعيل') : 'تعطيل/إنشاء سجل'}
                          </button>
                        </div>
                      </td>
                      <td className="admin-table__actions" data-label="إخفاء">
                        <div className="flex flex-col items-start gap-1">
                          {r.has_catalog_row ? (
                            r.catalog_hidden ? (
                              <span className="pill">مخفي (كتالوج)</span>
                            ) : (
                              <span className="pill pill--ok">ظاهر (كتالوج)</span>
                            )
                          ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                          )}
                          <button
                            type="button"
                            className={r.has_catalog_row && r.catalog_hidden ? 'btn btn--secondary btn--small' : 'btn btn--ghost btn--small'}
                            disabled={!r.profile_id && !r.catalog_id ? true : busyActive || busyHidden}
                            onClick={() => void onToggleHidden(r)}
                            title={!r.profile_id && !r.catalog_id ? 'سجل بلا ربط منصة' : undefined}
                          >
                            {busyHidden ? '…' : r.has_catalog_row ? (r.catalog_hidden ? 'إظهار' : 'إخفاء') : 'إخفاء/إنشاء سجل'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
