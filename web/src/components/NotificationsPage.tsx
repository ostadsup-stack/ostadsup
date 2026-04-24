import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { NotificationRow } from '../types'
import { Loading } from './Loading'
import { ErrorBanner } from './ErrorBanner'
import { EmptyState } from './EmptyState'

type SlotReqMeta = {
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  blocking_creator_id: string | null
  workspace_id: string
}

export function NotificationsPage() {
  const { session, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isTeacherUi = profile?.role === 'teacher' || profile?.role === 'admin'
  const uid = session?.user?.id
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
  const [slotRequestMetaById, setSlotRequestMetaById] = useState<Record<string, SlotReqMeta>>({})
  const [ownerWorkspaceIds, setOwnerWorkspaceIds] = useState<Set<string>>(() => new Set())

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }
    const userId = session.user.id
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('id,title,body,is_read,created_at,target_type,target_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(80)
    setErr(error?.message ?? null)
    setRows((data as NotificationRow[]) ?? [])

    const slotIds = [
      ...new Set(
        (data ?? [])
          .filter((n) => n.target_type === 'schedule_slot_request' && n.target_id)
          .map((n) => n.target_id as string),
      ),
    ]
    if (slotIds.length > 0) {
      const { data: reqs } = await supabase
        .from('schedule_slot_requests')
        .select('id,status,blocking_creator_id,workspace_id')
        .in('id', slotIds)
      const next: Record<string, SlotReqMeta> = {}
      for (const r of reqs ?? []) {
        next[r.id] = {
          status: r.status as SlotReqMeta['status'],
          blocking_creator_id: (r as { blocking_creator_id?: string | null }).blocking_creator_id ?? null,
          workspace_id: r.workspace_id as string,
        }
      }
      setSlotRequestMetaById(next)
    } else {
      setSlotRequestMetaById({})
    }

    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return

    const channel = supabase
      .channel(`notifications-user-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        },
        () => void reload(),
      )
      .subscribe()

    const onVis = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void supabase.removeChannel(channel)
    }
  }, [session?.user?.id, reload])

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

  function canDecideSlotRequest(meta: SlotReqMeta | undefined): boolean {
    if (!uid || !meta) return false
    return (
      isAdmin ||
      (meta.blocking_creator_id != null && meta.blocking_creator_id === uid) ||
      ownerWorkspaceIds.has(meta.workspace_id)
    )
  }

  /** رسالة نهائية بدل أزرار الموافقة/الرفض */
  function slotNotificationOutcome(
    n: NotificationRow,
    meta: SlotReqMeta | undefined,
  ): 'approved' | 'rejected' | null {
    if (meta?.status === 'approved' || n.title === 'تم قبول طلب الحصة') return 'approved'
    if (meta?.status === 'rejected' || n.title === 'رفض طلب الحصة') return 'rejected'
    return null
  }

  async function markRead(n: NotificationRow) {
    if (n.is_read) return
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    if (error) setErr(error.message)
    else await reload()
  }

  async function markAll() {
    if (!session?.user?.id) return
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false)
    if (error) setErr(error.message)
    else await reload()
  }

  async function approveSlotRequest(requestId: string) {
    setBusyRequestId(requestId)
    setErr(null)
    const { data, error } = await supabase.rpc('approve_schedule_slot_request', { p_request_id: requestId })
    setBusyRequestId(null)
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
            ? 'الفترة لم تعد محجوزة.'
            : payload?.error === 'proposed_slot_group_overlap'
              ? 'الفترة المقترحة تتداخل مع حصة أخرى في نفس الفوج؛ لا يمكن إتمام القبول.'
              : payload?.error === 'not_pending'
                ? 'الطلب لم يعد قيد الانتظار.'
                : 'تعذّر قبول الطلب.',
      )
      return
    }
    await reload()
  }

  async function rejectSlotRequest(requestId: string) {
    setBusyRequestId(requestId)
    setErr(null)
    const { data, error } = await supabase.rpc('reject_schedule_slot_request', { p_request_id: requestId })
    setBusyRequestId(null)
    if (error) {
      setErr(error.message)
      return
    }
    const payload = data as { ok?: boolean; error?: string } | null
    if (!payload?.ok) {
      setErr(payload?.error === 'forbidden' ? 'لا يمكنك رفض هذا الطلب.' : 'تعذّر رفض الطلب.')
      return
    }
    await reload()
  }

  if (loading) return <Loading />

  return (
    <div className="page">
      <h1>الإشعارات</h1>
      <ErrorBanner message={err} />
      {rows.some((r) => !r.is_read) ? (
        <button type="button" className="btn btn--secondary" onClick={() => void markAll()}>
          تعيين الكل كمقروء
        </button>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="لا إشعارات" />
      ) : (
        <ul className="notif-list">
          {rows.map((n) => (
            <li key={n.id} className="notif-list__row">
              <button
                type="button"
                className={`notif ${n.is_read ? '' : 'notif--unread'}`}
                onClick={() => void markRead(n)}
              >
                <strong>{n.title}</strong>
                {n.body ? <p>{n.body}</p> : null}
                <time className="muted">{new Date(n.created_at).toLocaleString('ar-MA')}</time>
              </button>
              {n.target_type === 'schedule_slot_request' && n.target_id && isTeacherUi ? (
                (() => {
                  const meta = slotRequestMetaById[n.target_id]
                  const outcome = slotNotificationOutcome(n, meta)
                  if (outcome === 'approved') {
                    return (
                      <p className="notif-list__outcome notif-list__outcome--ok">تمت الموافقة</p>
                    )
                  }
                  if (outcome === 'rejected') {
                    return (
                      <p className="notif-list__outcome notif-list__outcome--no">تم الرفض</p>
                    )
                  }
                  if (meta?.status === 'pending' && canDecideSlotRequest(meta)) {
                    return (
                      <div className="notif-list__actions">
                        <button
                          type="button"
                          className="btn btn--small btn--primary"
                          disabled={busyRequestId === n.target_id}
                          onClick={() => void approveSlotRequest(n.target_id!)}
                        >
                          {busyRequestId === n.target_id ? 'جاري…' : 'موافقة'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          disabled={busyRequestId === n.target_id}
                          onClick={() => void rejectSlotRequest(n.target_id!)}
                        >
                          رفض
                        </button>
                      </div>
                    )
                  }
                  return null
                })()
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
