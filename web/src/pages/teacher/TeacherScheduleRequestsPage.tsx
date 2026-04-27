import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatAppDateTime } from '../../lib/appDateTime'
import type { ScheduleSlotRequestRow } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'

type RequestRow = ScheduleSlotRequestRow & {
  groups: { group_name: string } | null
  requester: { full_name: string | null } | null
  blocking_event: {
    id: string
    subject_name: string | null
    starts_at: string
    ends_at: string
    created_by: string
    profiles: { full_name: string | null } | null
  } | null
}

function formatRange(starts: string, ends: string) {
  const a = formatAppDateTime(starts)
  const b = formatAppDateTime(ends)
  return `${a} → ${b}`
}

function slotRequestOutcomeMessage(status: ScheduleSlotRequestRow['status']) {
  if (status === 'approved') return 'تمت الموافقة'
  if (status === 'rejected') return 'تم الرفض'
  return null
}

export function TeacherScheduleRequestsPage() {
  const { session, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const uid = session?.user?.id
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RequestRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [ownerWorkspaceIds, setOwnerWorkspaceIds] = useState<Set<string>>(() => new Set())

  const reload = useCallback(async () => {
    if (!uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    const { data, error } = await supabase
      .from('schedule_slot_requests')
      .select(
        `
        *,
        groups (group_name),
        requester:profiles!schedule_slot_requests_requester_id_fkey (full_name),
        blocking_event:schedule_events!schedule_slot_requests_blocking_event_id_fkey (
          id,
          subject_name,
          starts_at,
          ends_at,
          created_by,
          profiles:profiles!schedule_events_created_by_fkey (full_name)
        )
      `,
      )
      .order('created_at', { ascending: false })
      .limit(80)

    setLoading(false)
    if (error) {
      setErr(error.message)
      setRows([])
      return
    }
    setRows((data as RequestRow[]) ?? [])
  }, [uid])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!uid) {
      setOwnerWorkspaceIds(new Set())
      return
    }
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from('workspaces').select('id').eq('owner_teacher_id', uid)
      if (cancelled) return
      setOwnerWorkspaceIds(new Set((data ?? []).map((w) => w.id)))
    })()
    return () => {
      cancelled = true
    }
  }, [uid])

  const { incoming, outgoing, oversight } = useMemo(() => {
    if (!uid) {
      return {
        incoming: [] as RequestRow[],
        outgoing: [] as RequestRow[],
        oversight: [] as RequestRow[],
      }
    }
    const inc: RequestRow[] = []
    const out: RequestRow[] = []
    const over: RequestRow[] = []
    for (const r of rows) {
      const blockerId = (r.blocking_creator_id ?? r.blocking_event?.created_by) || null
      const ownerCanDecide = ownerWorkspaceIds.has(r.workspace_id) && r.requester_id !== uid
      const adminCanDecide = isAdmin && r.status === 'pending' && r.requester_id !== uid
      if (r.requester_id === uid) out.push(r)
      else if (blockerId === uid || ownerCanDecide || adminCanDecide) inc.push(r)
      else over.push(r)
    }
    return { incoming: inc, outgoing: out, oversight: over }
  }, [rows, uid, ownerWorkspaceIds, isAdmin])

  async function approve(id: string) {
    setBusyId(id)
    setErr(null)
    const { data, error } = await supabase.rpc('approve_schedule_slot_request', { p_request_id: id })
    setBusyId(null)
    if (error) {
      setErr(error.message)
      return
    }
    const payload = data as { ok?: boolean; error?: string } | null
    if (!payload?.ok) {
      setErr(
        payload?.error === 'forbidden'
          ? 'لا يمكنك قبول هذا الطلب.'
          : payload?.error === 'slot_already_free'
            ? 'الفترة لم تعد محجوزة؛ أُلغي الطلب.'
            : payload?.error === 'proposed_slot_group_overlap'
              ? 'الفترة المقترحة تتداخل مع حصة أخرى في نفس الفوج؛ لا يمكن إتمام القبول.'
              : payload?.error === 'not_pending'
                ? 'الطلب لم يعد قيد الانتظار.'
                : 'تعذّر قبول الطلب.',
      )
    }
    await reload()
  }

  async function reject(id: string) {
    setBusyId(id)
    setErr(null)
    const { data, error } = await supabase.rpc('reject_schedule_slot_request', { p_request_id: id })
    setBusyId(null)
    if (error) {
      setErr(error.message)
      return
    }
    const payload = data as { ok?: boolean; error?: string } | null
    if (!payload?.ok) {
      setErr(payload?.error === 'forbidden' ? 'لا يمكنك رفض هذا الطلب.' : 'تعذّر رفض الطلب.')
    }
    await reload()
  }

  async function cancelOwn(id: string) {
    setBusyId(id)
    setErr(null)
    const { error } = await supabase.from('schedule_slot_requests').update({ status: 'cancelled' }).eq('id', id)
    setBusyId(null)
    if (error) setErr(error.message)
    else await reload()
  }

  if (!uid) return <Loading />

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / <Link to="/t/schedule">الحصص</Link> / طلبات الحصص
      </p>
      <PageHeader
        title="طلبات الحصص"
        subtitle="طلبات أخذ فترة زميل في نفس الفوج. لا يُفعّل الحجز الثاني إلا بموافقة صاحب الحصة الحالية؛ عند الموافقة تُلغى حصته وتُثبَّت حصتك بالبيانات المقترحة."
      />
      <ErrorBanner message={err} />
      {loading ? (
        <Loading label="جاري التحميل…" />
      ) : (
        <>
          <section className="section">
            <h2 className="library-section__title">واردة (تحتاج قرارك)</h2>
            {incoming.length === 0 ? (
              <EmptyState title="لا طلبات واردة" hint="عندما يطلب أستاذ آخر فترتك الزمنية يظهر هنا." />
            ) : (
              <ul className="post-list">
                {incoming.map((r) => (
                  <li key={r.id} className="post-card">
                    <p className="muted small">
                      {r.groups?.group_name ?? 'فوج'} —{' '}
                      {r.status === 'pending' ? (
                        <span className="pill">معلّق</span>
                      ) : r.status === 'approved' ? (
                        <span className="pill pill--seminar">مقبول</span>
                      ) : r.status === 'rejected' ? (
                        <span className="pill">مرفوض</span>
                      ) : (
                        <span className="pill">ملغى</span>
                      )}
                    </p>
                    <h3>
                      طلب من {r.requester?.full_name?.trim() || 'أستاذ'} — مقترح:{' '}
                      {r.subject_name?.trim() || (r.proposed_event_type === 'seminar' ? 'ندوة' : 'حصة')}
                    </h3>
                    <p className="muted small">
                      فترتك الحالية:{' '}
                      {r.blocking_event
                        ? `${r.blocking_event.subject_name ?? 'حصة'} — ${formatRange(r.blocking_event.starts_at, r.blocking_event.ends_at)}`
                        : '—'}
                    </p>
                    <p className="muted small">
                      المقترح: {formatRange(r.proposed_starts_at, r.proposed_ends_at)} —{' '}
                      {r.proposed_mode === 'online' ? 'عن بُعد' : 'حضوري'}
                    </p>
                    {r.status === 'pending' ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={busyId === r.id}
                          onClick={() => void approve(r.id)}
                        >
                          {busyId === r.id ? 'جاري…' : 'موافقة (إلغاء حصتي وتثبيت حصته)'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busyId === r.id}
                          onClick={() => void reject(r.id)}
                        >
                          رفض
                        </button>
                      </div>
                    ) : slotRequestOutcomeMessage(r.status) ? (
                      <p
                        className={`schedule-slot-outcome schedule-slot-outcome--${r.status === 'approved' ? 'ok' : 'no'}`}
                        style={{ marginTop: '0.75rem' }}
                      >
                        {slotRequestOutcomeMessage(r.status)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <h2 className="library-section__title">الصادرة (طلباتك)</h2>
            {outgoing.length === 0 ? (
              <EmptyState
                title="لا طلبات صادرة"
                hint="من جدول الفوج، عند تعارض مع حصة زميل يمكنك «إرسال طلب موافقة»."
              />
            ) : (
              <ul className="post-list">
                {outgoing.map((r) => (
                  <li key={r.id} className="post-card">
                    <p className="muted small">
                      {r.groups?.group_name ?? 'فوج'} —{' '}
                      {r.status === 'pending' ? (
                        <span className="pill">معلّق</span>
                      ) : r.status === 'approved' ? (
                        <span className="pill pill--seminar">مقبول</span>
                      ) : r.status === 'rejected' ? (
                        <span className="pill">مرفوض</span>
                      ) : (
                        <span className="pill">ملغى</span>
                      )}
                    </p>
                    <h3>
                      طلب أخذ فترة {r.blocking_event?.profiles?.full_name?.trim() || 'زميل'}
                    </h3>
                    <p className="muted small">
                      حصته:{' '}
                      {r.blocking_event
                        ? `${r.blocking_event.subject_name ?? 'حصة'} — ${formatRange(r.blocking_event.starts_at, r.blocking_event.ends_at)}`
                        : '—'}
                    </p>
                    <p className="muted small">
                      مقترحك: {formatRange(r.proposed_starts_at, r.proposed_ends_at)} —{' '}
                      {r.proposed_mode === 'online' ? 'عن بُعد' : 'حضوري'}
                    </p>
                    {r.status === 'pending' ? (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ marginTop: '0.5rem' }}
                        disabled={busyId === r.id}
                        onClick={() => void cancelOwn(r.id)}
                      >
                        {busyId === r.id ? 'جاري…' : 'إلغاء الطلب'}
                      </button>
                    ) : slotRequestOutcomeMessage(r.status) ? (
                      <p
                        className={`schedule-slot-outcome schedule-slot-outcome--${r.status === 'approved' ? 'ok' : 'no'}`}
                        style={{ marginTop: '0.5rem' }}
                      >
                        {slotRequestOutcomeMessage(r.status)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {oversight.length > 0 ? (
            <section className="section">
              <h2 className="library-section__title">طلبات في مساحة عملك (لمتابعة الإشراف)</h2>
              <p className="muted small">
                لا يمكنك الموافقة أو الرفض هنا إلا إذا كنت صاحب الحصة المحجوزة؛ القرار لأستاذي الفوج.
              </p>
              <ul className="post-list">
                {oversight.map((r) => (
                  <li key={r.id} className="post-card">
                    <p className="muted small">{r.groups?.group_name ?? 'فوج'}</p>
                    <h3>
                      {r.requester?.full_name?.trim() || 'أستاذ'} ←{' '}
                      {r.blocking_event?.profiles?.full_name?.trim() || 'أستاذ'}
                    </h3>
                    <p className="muted small">{formatRange(r.proposed_starts_at, r.proposed_ends_at)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
