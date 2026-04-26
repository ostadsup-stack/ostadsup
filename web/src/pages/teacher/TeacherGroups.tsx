import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { randomJoinCode } from '../../lib/codes'
import { buildSuggestedCohortCode } from '../../lib/cohortCode'
import {
  localTodayBoundsIso,
  normalizeTeacherGroupSummaryRows,
  scheduleModeLabelAr,
  studyLevelLabelAr,
  studyTrackLabelAr,
} from '../../lib/teacherGroups'
import type { GroupScheduleMode, GroupStudyTrack, StudyLevel, TeacherGroupSummaryRow } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { DEFAULT_GROUP_ACCENT } from '../../lib/groupTheme'
import { rgbaFromHex } from '../../lib/colorContrast'

const emptyCreateForm = {
  group_name: '',
  schedule_mode: 'normal' as GroupScheduleMode,
  study_track: 'normal' as GroupStudyTrack,
  academic_year: '',
  university: '',
  faculty: '',
  subject_name: '',
  whatsapp_link: '',
  study_level: 'licence' as StudyLevel,
  cohort_official_code: '',
  cohort_suffix: '',
  accent_color: DEFAULT_GROUP_ACCENT,
}

export function TeacherGroups() {
  const { session } = useAuth()
  const nav = useNavigate()
  const createSectionRef = useRef<HTMLElement>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [linkSecret, setLinkSecret] = useState('')
  const [redeemBusy, setRedeemBusy] = useState(false)
  const [rows, setRows] = useState<TeacherGroupSummaryRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState({ ...emptyCreateForm })

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { workspace, error: wErr } = await fetchWorkspaceForTeacher(session.user.id)
    if (wErr || !workspace) {
      setErr(wErr?.message ?? 'لا توجد مساحة')
      setWorkspaceId(null)
      setRows([])
      setLoading(false)
      return
    }
    setWorkspaceId(workspace.id)
    const { p_today_start, p_today_end } = localTodayBoundsIso()
    const { data, error } = await supabase.rpc('teacher_group_list_summaries', {
      p_today_start,
      p_today_end,
    })
    if (error) {
      setErr(error.message)
      setRows([])
    } else {
      setErr(null)
      setRows(normalizeTeacherGroupSummaryRows(data))
    }
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!showCreateForm) return
    const t = window.requestAnimationFrame(() => {
      createSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(t)
  }, [showCreateForm])

  async function suggestOfficialCode() {
    if (!workspaceId) {
      setErr('لا مساحة')
      return
    }
    setSuggesting(true)
    setErr(null)
    const year = form.academic_year.trim()
    const level = form.study_level
    let q = supabase
      .from('groups')
      .select('cohort_sequence')
      .eq('workspace_id', workspaceId)
      .eq('study_level', level)
    if (year) q = q.eq('academic_year', year)
    else q = q.is('academic_year', null)
    const { data, error } = await q
    setSuggesting(false)
    if (error) {
      setErr(error.message)
      return
    }
    const seqs = ((data ?? []) as { cohort_sequence: number | null }[])
      .map((r) => r.cohort_sequence)
      .filter((n): n is number => typeof n === 'number' && n > 0)
    const next = (seqs.length ? Math.max(...seqs) : 0) + 1
    const code = buildSuggestedCohortCode(level, year || '????', next, form.cohort_suffix || undefined)
    setForm((f) => ({ ...f, cohort_official_code: code }))
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user?.id) return
    setCreating(true)
    setErr(null)
    const { workspace, error: wErr } = await fetchWorkspaceForTeacher(session.user.id)
    if (wErr || !workspace) {
      setErr(wErr?.message ?? 'لا توجد مساحة')
      setCreating(false)
      return
    }
    const year = form.academic_year.trim() || null
    const code = form.cohort_official_code.trim() || null
    let derivedSeq: number | null = null
    if (code) {
      const m = /-(\d{1,4})(?:-[^-]+)?$/.exec(code)
      if (m) derivedSeq = parseInt(m[1], 10) || null
    }
    const accent = form.accent_color?.trim() || DEFAULT_GROUP_ACCENT
    const basePayload = {
      workspace_id: workspace.id,
      group_name: form.group_name.trim(),
      schedule_mode: form.schedule_mode,
      study_track: form.study_track,
      academic_year: year,
      university: form.university.trim() || null,
      faculty: form.faculty.trim() || null,
      subject_name: form.subject_name.trim() || null,
      whatsapp_link: form.whatsapp_link.trim() || null,
      study_level: form.study_level,
      cohort_official_code: code,
      cohort_sequence: derivedSeq,
      cohort_suffix: form.cohort_suffix.trim() || null,
      accent_color: /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : DEFAULT_GROUP_ACCENT,
    }
    let joinCode = randomJoinCode()
    for (let i = 0; i < 8; i++) {
      const { error } = await supabase.from('groups').insert({ ...basePayload, join_code: joinCode })
      if (!error) {
        setForm({ ...emptyCreateForm })
        setShowCreateForm(false)
        await reload()
        setCreating(false)
        return
      }
      const msg = `${error.message} ${(error as { details?: string }).details ?? ''}`.toLowerCase()
      if (error.code === '23505' && (msg.includes('cohort') || msg.includes('workspace_cohort'))) {
        setErr('الرمز الرسمي مستخدم مسبقاً في مساحتك. غيّره أو اتركه فارغاً.')
        setCreating(false)
        return
      }
      if (error.code === '23505') {
        joinCode = randomJoinCode()
        continue
      }
      setErr(error.message)
      setCreating(false)
      return
    }
    setErr('تعذر توليد كود انضمام فريد')
    setCreating(false)
  }

  async function redeemLink(e: React.FormEvent) {
    e.preventDefault()
    if (!linkSecret.trim()) return
    setRedeemBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('redeem_teacher_group_link', {
      p_secret: linkSecret.trim(),
    })
    setRedeemBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    const gid = data as string
    setLinkSecret('')
    await reload()
    nav(`/t/groups/${gid}`)
  }

  if (loading) return <Loading />

  return (
    <div className="page">
      <PageHeader
        title="الأفواج"
        subtitle="قائمة بكل فوج: الاسم، المستوى، السنة الجامعية، المنسق، بلون مميّز لكل فوج."
      />
      <ErrorBanner message={err} />

      <div className="teacher-groups__toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setShowCreateForm((v) => !v)}
          aria-expanded={showCreateForm}
        >
          {showCreateForm ? 'إغلاق نموذج الإضافة' : 'إضافة فوج'}
        </button>
      </div>

      <section className="section">
        <h2 className="teacher-groups__list-heading">قائمة الأفواج</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="لا توجد أفواج بعد"
            hint='اضغط «إضافة فوج» لإنشاء فوج، أو استخدم «ربط فوج» في الأسفل.'
          />
        ) : (
          <div className="teacher-groups__sheet">
            <div className="teacher-groups__thead" aria-hidden>
              <span className="teacher-groups__th teacher-groups__th--accent" />
              <span className="teacher-groups__th">اسم الفوج</span>
              <span className="teacher-groups__th">المستوى</span>
              <span className="teacher-groups__th">السنة الجامعية</span>
              <span className="teacher-groups__th">التوقيت</span>
              <span className="teacher-groups__th">المسار</span>
              <span className="teacher-groups__th">المنسق</span>
              <span className="teacher-groups__th teacher-groups__th--meta" />
            </div>
            <ul className="teacher-groups__list teacher-groups__list--lines">
              {rows.map((r) => {
                const accent =
                  r.accent_color && /^#[0-9A-Fa-f]{6}$/.test(r.accent_color) ? r.accent_color : DEFAULT_GROUP_ACCENT
                const coordUnread = r.unread_coordinator_count
                const rowBg = rgbaFromHex(accent, 0.08) ?? undefined
                return (
                  <li key={r.group_id}>
                    <Link
                      to={`/t/groups/${r.group_id}`}
                      className="teacher-groups__row-line"
                      style={{ backgroundColor: rowBg }}
                    >
                      <span
                        className="teacher-groups__row-accent teacher-groups__row-accent--line"
                        style={{ backgroundColor: accent }}
                        aria-hidden
                      />
                      <span className="teacher-groups__cell teacher-groups__cell--name">{r.group_name}</span>
                      <span className="teacher-groups__cell muted">{studyLevelLabelAr(r.study_level)}</span>
                      <span className="teacher-groups__cell muted" title="السنة الجامعية">
                        {r.academic_year?.trim() || '—'}
                      </span>
                      <span className="teacher-groups__cell muted" title="توقيت الحصص">
                        {scheduleModeLabelAr(r.schedule_mode)}
                      </span>
                      <span className="teacher-groups__cell muted" title="مسار التكوين">
                        {studyTrackLabelAr(r.study_track)}
                      </span>
                      <span className="teacher-groups__cell teacher-groups__cell--coord" title="منسق الفوج">
                        <span className="teacher-groups__coord-name">{r.coordinator_name?.trim() || '—'}</span>
                        {coordUnread > 0 ? (
                          <span
                            className="teacher-groups__coord-unread teacher-groups__coord-unread--inline"
                            title="رسائل غير مقروءة من المنسق"
                          >
                            {coordUnread > 99 ? '99+' : coordUnread}
                          </span>
                        ) : null}
                      </span>
                      <span className="teacher-groups__cell teacher-groups__cell--meta">
                        {r.is_owner === false ? <span className="pill teacher-groups__compact-pill">مرتبط</span> : null}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      {showCreateForm ? (
        <section ref={createSectionRef} id="teacher-groups-create" className="section" tabIndex={-1}>
          <h2>إضافة فوج</h2>
          <form className="form form--grid" onSubmit={(e) => void createGroup(e)}>
            <label>
              اسم الفوج
              <input
                value={form.group_name}
                onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                required
                placeholder="اكتب اسم الفوج"
              />
            </label>
            <label>
              التوقيت
              <select
                value={form.schedule_mode}
                onChange={(e) => setForm({ ...form, schedule_mode: e.target.value as GroupScheduleMode })}
              >
                <option value="normal">توقيت عادي</option>
                <option value="simplified">توقيت ميسر</option>
              </select>
            </label>
            <label>
              المسار
              <select
                value={form.study_track}
                onChange={(e) => setForm({ ...form, study_track: e.target.value as GroupStudyTrack })}
              >
                <option value="normal">مسار عادي</option>
                <option value="excellence">مسار التميّز</option>
              </select>
            </label>
            <label className="teacher-groups__color-field">
              لون الفوج
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                aria-label="لون تمييز الفوج في القائمة"
              />
            </label>
            <label>
              المستوى الدراسي
              <select
                value={form.study_level}
                onChange={(e) => setForm({ ...form, study_level: e.target.value as StudyLevel })}
              >
                <option value="licence">إجازة</option>
                <option value="master">ماستر</option>
                <option value="doctorate">دكتوراه</option>
              </select>
            </label>
            <label>
              السنة الدراسية
              <input
                value={form.academic_year}
                onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                placeholder="مثال: 2025-2026"
              />
            </label>
            <label>
              لاحقة الرمز (اختياري)
              <input
                value={form.cohort_suffix}
                onChange={(e) => setForm({ ...form, cohort_suffix: e.target.value })}
                placeholder="مثال: A"
              />
            </label>
            <label className="teacher-groups__code-field">
              الرمز الرسمي (من المنسق، اختياري)
              <div className="teacher-groups__code-row">
                <input
                  value={form.cohort_official_code}
                  onChange={(e) => setForm({ ...form, cohort_official_code: e.target.value })}
                  placeholder="LIS-2025-2026-01"
                  dir="ltr"
                  className="input--ltr"
                />
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={suggesting}
                  onClick={() => void suggestOfficialCode()}
                >
                  {suggesting ? '…' : 'اقتراح'}
                </button>
              </div>
            </label>
            <label>
              الجامعة
              <input value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
            </label>
            <label>
              الكلية
              <input value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} />
            </label>
            <label>
              المادة
              <input value={form.subject_name} onChange={(e) => setForm({ ...form, subject_name: e.target.value })} />
            </label>
            <label>
              رابط واتساب (اختياري)
              <input
                value={form.whatsapp_link}
                onChange={(e) => setForm({ ...form, whatsapp_link: e.target.value })}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={creating}>
              {creating ? 'جاري الإنشاء…' : 'إنشاء'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="section">
        <h2>ربط فوج من أستاذ آخر</h2>
        <p className="muted small">
          أدخل رمز الربط الخاص بالأساتذة (من منشئ الفوج). ستشارك الجدول وبيانات الطلبة ومحادثة طاقم التدريس دون
          إنشاء فوج جديد.
        </p>
        <form className="form" onSubmit={(ev) => void redeemLink(ev)}>
          <label>
            رمز ربط الأستاذ
            <input
              value={linkSecret}
              onChange={(e) => setLinkSecret(e.target.value)}
              dir="ltr"
              className="input--ltr"
              placeholder="الصق الرمز الطويل هنا"
            />
          </label>
          <button type="submit" className="btn btn--secondary" disabled={redeemBusy}>
            {redeemBusy ? 'جاري الربط…' : 'ربط المساحة بهذا الفوج'}
          </button>
        </form>
      </section>
    </div>
  )
}
