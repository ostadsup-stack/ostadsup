import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Material } from '../../types'
import { cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { fetchActiveStudentMemberships, filterStudentRoleRows } from '../../lib/studentGroup'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

export function StudentMaterialsPage() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [cohortSurface, setCohortSurface] = useState<CSSProperties | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }
      setLoading(true)
      const { rows, error: mErr } = await fetchActiveStudentMemberships(supabase, session.user.id)
      if (!ok) return
      if (mErr) {
        setErr(mErr)
        setMaterials([])
        setCohortSurface(null)
        setLoading(false)
        return
      }
      const students = filterStudentRoleRows(rows)
      const gid =
        students[0]?.group_id ?? rows.find((r) => r.role_in_group === 'coordinator')?.group_id ?? rows[0]?.group_id
      if (!gid) {
        setErr(null)
        setMaterials([])
        setCohortSurface(null)
        setLoading(false)
        return
      }
      const accent = normalizeGroupAccent(rows.find((r) => r.group_id === gid)?.groups?.accent_color)
      setCohortSurface(cohortPageSurfaceStyle(accent))
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('group_id', gid)
        .order('created_at', { ascending: false })
      if (!ok) return
      setErr(error?.message ?? null)
      setMaterials((data as Material[]) ?? [])
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  async function downloadMaterial(m: Material) {
    if (!m.file_path) return
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(m.file_path, 3600)
    if (error) {
      setErr(error.message)
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <Loading />

  return (
    <div className={cohortSurface ? 'page page--cohort' : 'page'} style={cohortSurface ?? undefined}>
      <PageHeader title="المواد العلمية" subtitle="ملفات وفقرات مرفوعة في فوجك." />
      <ErrorBanner message={err} />
      {materials.length === 0 ? (
        <EmptyState
          title="لا مواد بعد"
          hint={
            <>
              انضمّ إلى فوج من{' '}
              <Link to="/s/join">صفحة الانضمام</Link>.
            </>
          }
        />
      ) : (
        <ul className="list-links">
          {materials.map((m) => (
            <li key={m.id}>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => void downloadMaterial(m)}>
                {m.title}
              </button>{' '}
              {m.file_path ? <span className="muted small">(تنزيل)</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
