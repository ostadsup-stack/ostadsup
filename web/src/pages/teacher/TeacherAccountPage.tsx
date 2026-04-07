import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { TeacherAccountForm } from '../../components/TeacherAccountForm'
import { PageHeader } from '../../components/PageHeader'
import { Loading } from '../../components/Loading'

export function TeacherAccountPage() {
  const { session } = useAuth()
  const [wsSlug, setWsSlug] = useState<string | null>(null)
  const [wsLoading, setWsLoading] = useState(true)

  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) {
      setWsSlug(null)
      setWsLoading(false)
      return
    }
    let ok = true
    setWsLoading(true)
    ;(async () => {
      const { workspace } = await fetchWorkspaceForTeacher(uid)
      if (!ok) return
      setWsSlug(workspace?.slug ?? null)
      setWsLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  if (!session?.user?.id) return <Loading />

  const publicUrl =
    typeof window !== 'undefined' && wsSlug
      ? `${window.location.origin}/p/${encodeURIComponent(wsSlug)}`
      : null

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / حسابي
      </p>
      <PageHeader title="حسابي" subtitle="بياناتك الشخصية، صفحتك العامة، ووسائل التواصل." />
      {wsLoading ? null : wsSlug && publicUrl ? (
        <div className="teacher-account__public-banner">
          <p className="teacher-account__public-banner-title">صفحتك العامة</p>
          <p className="muted small">شارك الرابط مع الطلاب والزوار:</p>
          <p className="teacher-account__public-url wrap" dir="ltr">
            <a href={publicUrl}>{publicUrl}</a>
          </p>
        </div>
      ) : (
        <p className="muted small">لم يُعثر على مساحة (slug). أنشئ فوجاً أو راجع إعداد Supabase.</p>
      )}
      <TeacherAccountForm />
    </div>
  )
}
