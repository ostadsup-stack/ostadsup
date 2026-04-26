import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { AdminGroupEditModal } from './AdminGroupEditModal'
import { AdminGroupInviteModal } from './AdminGroupInviteModal'

type WorkspaceRow = { id: string; owner_teacher_id: string }

type GroupRow = {
  id: string
  group_name: string
  join_code: string
  status: string
  workspace_id: string
  owner_name: string
  student_count: number
}

function buildGroupRows(
  groups: { id: string; group_name: string; join_code: string; status: string; workspace_id: string }[],
  workspaces: WorkspaceRow[],
  profiles: { id: string; full_name: string }[],
  members: { group_id: string; role_in_group: string; status: string }[],
): GroupRow[] {
  const wsById = new Map(workspaces.map((w) => [w.id, w]))
  const profById = new Map(profiles.map((p) => [p.id, p.full_name?.trim() || '']))
  const studentCountByGroup = new Map<string, number>()
  for (const m of members) {
    if (m.role_in_group === 'student' && m.status === 'active') {
      studentCountByGroup.set(m.group_id, (studentCountByGroup.get(m.group_id) ?? 0) + 1)
    }
  }

  return groups.map((g) => {
    const ws = wsById.get(g.workspace_id)
    const ownerId = ws?.owner_teacher_id
    const ownerName = ownerId ? profById.get(ownerId) || '—' : '—'
    return {
      ...g,
      owner_name: ownerName,
      student_count: studentCountByGroup.get(g.id) ?? 0,
    }
  })
}

async function loadAdminGroups(): Promise<{ rows: GroupRow[]; error: string | null }> {
  const { data: groups, error: gErr } = await supabase
    .from('groups')
    .select('id, group_name, join_code, status, workspace_id')
    .order('group_name')

  if (gErr) return { rows: [], error: gErr.message }

  const gList = groups ?? []
  if (gList.length === 0) return { rows: [], error: null }

  const wsIds = [...new Set(gList.map((g) => g.workspace_id).filter(Boolean))]

  const { data: workspaces, error: wErr } = await supabase
    .from('workspaces')
    .select('id, owner_teacher_id')
    .in('id', wsIds)

  if (wErr) return { rows: [], error: wErr.message }

  const wsRows = (workspaces as WorkspaceRow[]) ?? []
  const ownerIds = [...new Set(wsRows.map((w) => w.owner_teacher_id).filter(Boolean))]

  const { data: profiles, error: pErr } =
    ownerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', ownerIds)
      : { data: [] as { id: string; full_name: string }[], error: null }

  if (pErr) return { rows: [], error: pErr.message }

  const groupIds = gList.map((g) => g.id)
  const { data: members, error: mErr } = await supabase
    .from('group_members')
    .select('group_id, role_in_group, status')
    .in('group_id', groupIds)

  if (mErr) return { rows: [], error: mErr.message }

  const rows = buildGroupRows(
    gList as { id: string; group_name: string; join_code: string; status: string; workspace_id: string }[],
    wsRows,
    (profiles as { id: string; full_name: string }[]) ?? [],
    (members as { group_id: string; role_in_group: string; status: string }[]) ?? [],
  )

  return { rows, error: null }
}

export function AdminGroupsPage() {
  const { session } = useAuth()
  const [rows, setRows] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [inviteCtx, setInviteCtx] = useState<{
    id: string
    name: string
    focus: 'teacher' | 'student'
  } | null>(null)

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setRows([])
      setLoading(false)
      return
    }
    setErr(null)
    setLoading(true)
    const { rows: next, error } = await loadAdminGroups()
    setRows(next)
    setErr(error)
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onDelete(r: GroupRow) {
    if (
      !window.confirm(
        `حذف فوج «${r.group_name}» نهائياً؟ سيُزال الفوج والبيانات المرتبطة حسب قواعد قاعدة البيانات.`,
      )
    ) {
      return
    }
    setDeletingId(r.id)
    setErr(null)
    const { error } = await supabase.from('groups').delete().eq('id', r.id)
    setDeletingId(null)
    if (error) {
      setErr(error.message)
      return
    }
    void reload()
  }

  async function onSetArchived(r: GroupRow, archived: boolean) {
    setStatusBusyId(r.id)
    setErr(null)
    const status = archived ? 'archived' : 'active'
    const { error } = await supabase.from('groups').update({ status }).eq('id', r.id)
    setStatusBusyId(null)
    if (error) {
      setErr(error.message)
      return
    }
    setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, status } : row)))
  }

  if (loading) return <Loading label="جاري تحميل الأفواج…" />

  return (
    <div className="page">
      <PageHeader
        title="إدارة الأفواج"
        subtitle="عرض كل الأفواج مع كود الانضمام، صاحب المساحة، وعدد الطلاب النشطين. تعديل، دعوة أستاذ أو طالب (منسق عبر نفس رابط الطالب)، أو تعطيل (أرشفة) وحذف."
      />
      <ErrorBanner message={err} />

      {rows.length === 0 ? (
        <section className="section">
          <EmptyState title="لا توجد أفواج" hint="يُنشأ الأفواج من مساحة الأستاذ أو أدوات الإدارة الأخرى." />
        </section>
      ) : (
        <section className="section">
          <div className="admin-cohorts__table-wrap" role="region" aria-label="قائمة الأفواج">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>اسم الفوج</th>
                  <th>الكود</th>
                  <th>الأستاذ المنشئ</th>
                  <th>عدد الطلبة</th>
                  <th>الحالة</th>
                  <th className="admin-table__actions">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isArchived = r.status === 'archived'
                  return (
                    <tr key={r.id}>
                      <td data-label="اسم الفوج">{r.group_name?.trim() || '—'}</td>
                      <td className="input--ltr" data-label="الكود">
                        {r.join_code?.trim() || '—'}
                      </td>
                      <td data-label="الأستاذ المنشئ">{r.owner_name}</td>
                      <td data-label="عدد الطلبة">{r.student_count.toLocaleString('ar')}</td>
                      <td data-label="الحالة">
                        {isArchived ? (
                          <span className="pill">معطّل</span>
                        ) : (
                          <span className="pill pill--ok">نشط</span>
                        )}
                      </td>
                      <td className="admin-table__actions">
                        <div className="admin-cohorts__row-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            onClick={() => setEditGroupId(r.id)}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() =>
                              setInviteCtx({
                                id: r.id,
                                name: r.group_name?.trim() || '—',
                                focus: 'teacher',
                              })
                            }
                          >
                            دعوة لأستاذ
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() =>
                              setInviteCtx({
                                id: r.id,
                                name: r.group_name?.trim() || '—',
                                focus: 'student',
                              })
                            }
                          >
                            دعوة لطالب (منسق)
                          </button>
                          {isArchived ? (
                            <button
                              type="button"
                              className="btn btn--secondary btn--small"
                              disabled={statusBusyId === r.id}
                              onClick={() => void onSetArchived(r, false)}
                            >
                              {statusBusyId === r.id ? '…' : 'تفعيل'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--ghost btn--small"
                              disabled={statusBusyId === r.id}
                              onClick={() => void onSetArchived(r, true)}
                            >
                              {statusBusyId === r.id ? '…' : 'تعطيل'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={deletingId === r.id}
                            onClick={() => void onDelete(r)}
                          >
                            {deletingId === r.id ? '…' : 'حذف'}
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

      {editGroupId ? (
        <AdminGroupEditModal
          key={editGroupId}
          open
          groupId={editGroupId}
          onClose={() => setEditGroupId(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      {inviteCtx ? (
        <AdminGroupInviteModal
          key={inviteCtx.id + inviteCtx.focus}
          open
          groupId={inviteCtx.id}
          groupLabel={inviteCtx.name}
          focus={inviteCtx.focus}
          onClose={() => setInviteCtx(null)}
        />
      ) : null}
    </div>
  )
}
