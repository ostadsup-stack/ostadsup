import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchSystemSettings, upsertSystemSettings, type SystemSettingsRow } from '../../lib/systemSettings'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { AdminCard, AdminCardHeader } from '../../components/admin/AdminCard'

const DEFAULTS: Pick<SystemSettingsRow, 'voting_enabled' | 'attendance_enabled' | 'teacher_linking_enabled'> = {
  voting_enabled: false,
  attendance_enabled: false,
  teacher_linking_enabled: false,
}

export function AdminSettingsPage() {
  const { session } = useAuth()
  const [row, setRow] = useState<SystemSettingsRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const reload = useCallback(async (silent = false) => {
    if (!session?.user?.id) {
      setRow(null)
      if (!silent) setLoading(false)
      return
    }
    if (!silent) {
      setErr(null)
      setLoading(true)
    }
    const { row: next, error } = await fetchSystemSettings(supabase)
    if (error) setErr(error)
    else if (!silent) setErr(null)
    setRow(next)
    if (!silent) setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload(false)
  }, [reload])

  const flags = row
    ? {
        voting_enabled: row.voting_enabled,
        attendance_enabled: row.attendance_enabled,
        teacher_linking_enabled: row.teacher_linking_enabled,
      }
    : DEFAULTS

  async function onToggle(
    key: keyof typeof DEFAULTS,
    next: boolean,
  ) {
    setBusyKey(key)
    setErr(null)
    const prev = row
    setRow((r) =>
      r
        ? { ...r, [key]: next, updated_at: new Date().toISOString() }
        : ({
            id: 1,
            voting_enabled: DEFAULTS.voting_enabled,
            attendance_enabled: DEFAULTS.attendance_enabled,
            teacher_linking_enabled: DEFAULTS.teacher_linking_enabled,
            updated_at: new Date().toISOString(),
            [key]: next,
          } as SystemSettingsRow),
    )

    const { error } = await upsertSystemSettings(supabase, { [key]: next })
    setBusyKey(null)
    if (error) {
      setErr(error)
      setRow(prev)
      return
    }
    void reload(true)
  }

  if (loading) return <Loading label="جاري تحميل الإعدادات…" />

  return (
    <div className="page">
      <PageHeader
        title="إعدادات النظام"
        subtitle="مفاتيح تفعيل عامة تُحفظ في جدول settings وتُقرأ من التطبيق عند تفعيل الميزات لاحقاً."
      />
      <ErrorBanner message={err} />

      <AdminCard as="section" className="admin-settings-card" aria-labelledby="admin-settings-flags-title">
        <AdminCardHeader
          id="admin-settings-flags-title"
          title="مفاتيح التفعيل"
          description="تغيير أي خيار يُحدّث الصف في قاعدة البيانات فوراً."
        />
        <ul className="admin-settings__list">
          <li className="admin-settings__row">
            <div className="admin-settings__row-text">
              <span className="admin-settings__label">تفعيل التصويت</span>
              <span className="muted small">السماح باستخدام ميزة التصويت في التطبيق.</span>
            </div>
            <label className="admin-settings__switch">
              <input
                className="admin-settings__checkbox"
                type="checkbox"
                checked={flags.voting_enabled}
                disabled={busyKey === 'voting_enabled'}
                onChange={(e) => void onToggle('voting_enabled', e.target.checked)}
              />
              <span className="admin-settings__switch-ui" aria-hidden />
            </label>
          </li>
          <li className="admin-settings__row">
            <div className="admin-settings__row-text">
              <span className="admin-settings__label">تفعيل الحضور</span>
              <span className="muted small">تسجيل الحضور والمتابعة عند التفعيل.</span>
            </div>
            <label className="admin-settings__switch">
              <input
                className="admin-settings__checkbox"
                type="checkbox"
                checked={flags.attendance_enabled}
                disabled={busyKey === 'attendance_enabled'}
                onChange={(e) => void onToggle('attendance_enabled', e.target.checked)}
              />
              <span className="admin-settings__switch-ui" aria-hidden />
            </label>
          </li>
          <li className="admin-settings__row">
            <div className="admin-settings__row-text">
              <span className="admin-settings__label">تفعيل ربط الأساتذة</span>
              <span className="muted small">السماح بربط أساتذة متعددين أو مسارات الربط حسب التصميم.</span>
            </div>
            <label className="admin-settings__switch">
              <input
                className="admin-settings__checkbox"
                type="checkbox"
                checked={flags.teacher_linking_enabled}
                disabled={busyKey === 'teacher_linking_enabled'}
                onChange={(e) => void onToggle('teacher_linking_enabled', e.target.checked)}
              />
              <span className="admin-settings__switch-ui" aria-hidden />
            </label>
          </li>
        </ul>
      </AdminCard>
    </div>
  )
}
