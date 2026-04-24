import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { supabase } from '../../lib/supabase'
import type {
  PublicGroupTeaserRow,
  PublicMaterialRow,
  PublicPostRow,
  PublicScheduleTeaserRow,
  PublicTeacherPageRow,
} from '../../types'
import { Loading } from '../../components/Loading'
import { EmptyState } from '../../components/EmptyState'
import { parseAcademicProfile } from '../../lib/academicProfile'
import { mergePublicSiteSettings, type PublicSectionId } from '../../lib/publicSiteSettings'
import { OfficialShell } from './official/OfficialShell'
import { OfficialHero } from './official/OfficialHero'
import { OfficialAcademic } from './official/OfficialAcademic'
import { OfficialPosts } from './official/OfficialPosts'
import { OfficialLibrary } from './official/OfficialLibrary'
import { OfficialSchedule } from './official/OfficialSchedule'
import { OfficialCohorts } from './official/OfficialCohorts'
import { OfficialContact } from './official/OfficialContact'
import { OfficialFooter } from './official/OfficialFooter'

export function PublicTeacherSite() {
  const { slug } = useParams<{ slug: string }>()
  const { session, profile } = useAuth()
  const [isOwnerTeacher, setIsOwnerTeacher] = useState(false)
  const [row, setRow] = useState<PublicTeacherPageRow | null>(null)
  const [materials, setMaterials] = useState<PublicMaterialRow[]>([])
  const [posts, setPosts] = useState<PublicPostRow[]>([])
  const [groups, setGroups] = useState<PublicGroupTeaserRow[]>([])
  const [schedule, setSchedule] = useState<PublicScheduleTeaserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!slug?.trim()) {
      setErr(null)
      setRow(null)
      setMaterials([])
      setPosts([])
      setGroups([])
      setSchedule([])
      setLoading(false)
      return
    }
    let ok = true
    setLoading(true)
    setErr(null)
    const s = slug.trim()
    ;(async () => {
      const [profRes, matRes, postRes, grpRes, schedRes] = await Promise.all([
        supabase.rpc('public_teacher_by_workspace_slug', { p_slug: s }),
        supabase.rpc('public_workspace_materials_by_slug', { p_slug: s }),
        supabase.rpc('public_workspace_posts_by_slug', { p_slug: s }),
        supabase.rpc('public_workspace_groups_teaser_by_slug', { p_slug: s }),
        supabase.rpc('public_workspace_schedule_teaser_by_slug', { p_slug: s }),
      ])
      if (!ok) return
      if (profRes.error) {
        setErr(profRes.error.message)
        setRow(null)
        setMaterials([])
        setPosts([])
        setGroups([])
        setSchedule([])
        setLoading(false)
        return
      }
      const list = profRes.data as PublicTeacherPageRow[] | null
      setRow(list && list.length > 0 ? list[0] : null)
      setMaterials(matRes.error ? [] : ((matRes.data as PublicMaterialRow[]) ?? []))
      setPosts(postRes.error ? [] : ((postRes.data as PublicPostRow[]) ?? []))
      setGroups(grpRes.error ? [] : ((grpRes.data as PublicGroupTeaserRow[]) ?? []))
      setSchedule(schedRes.error ? [] : ((schedRes.data as PublicScheduleTeaserRow[]) ?? []))
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [slug])

  useEffect(() => {
    let ok = true
    const s = slug?.trim()
    const uid = session?.user?.id
    if (!s || !uid || profile?.role !== 'teacher') {
      setIsOwnerTeacher(false)
      return
    }
    ;(async () => {
      const { workspace } = await fetchWorkspaceForTeacher(uid)
      if (!ok) return
      const mine = workspace?.slug != null && String(workspace.slug) === s
      setIsOwnerTeacher(mine)
    })()
    return () => {
      ok = false
    }
  }, [slug, session?.user?.id, profile?.role])

  const merged = useMemo(() => {
    if (!row) return null
    return mergePublicSiteSettings(row.public_site_settings)
  }, [row])

  const academic = useMemo(() => parseAcademicProfile(row?.academic_profile), [row?.academic_profile])

  const slugTrim = slug?.trim() ?? ''
  const publicBrandHref = slugTrim ? `/p/${encodeURIComponent(slugTrim)}` : '/'

  if (loading) {
    return (
      <OfficialShell session={session} isOwnerTeacher={false} brandHref={publicBrandHref} profile={profile}>
        <div className="official-public__narrow">
          <Loading label="جاري التحميل…" />
        </div>
      </OfficialShell>
    )
  }

  if (err) {
    return (
      <OfficialShell session={session} isOwnerTeacher={false} brandHref={publicBrandHref} profile={profile}>
        <div className="official-public__narrow">
          <EmptyState title="تعذّر التحميل" hint={err} />
        </div>
      </OfficialShell>
    )
  }

  if (!row || !merged) {
    return (
      <OfficialShell session={session} isOwnerTeacher={false} brandHref={publicBrandHref} profile={profile}>
        <div className="official-public__narrow">
          <EmptyState title="الصفحة غير موجودة" hint="تحقق من الرابط أو معرف المساحة (slug)." />
        </div>
      </OfficialShell>
    )
  }

  const s = slug!.trim()
  const { sectionOrder, sectionsVisible, contactVisible } = merged
  const pageRow = row

  function renderSection(id: PublicSectionId) {
    if (!sectionsVisible[id]) return null
    switch (id) {
      case 'hero':
        return <OfficialHero key="hero" row={pageRow} academic={academic} contactVisible={contactVisible} />
      case 'academic':
        return <OfficialAcademic key="academic" academic={academic} />
      case 'posts':
        return <OfficialPosts key="posts" slug={s} posts={posts} />
      case 'library':
        return <OfficialLibrary key="library" materials={materials} />
      case 'schedule':
        return <OfficialSchedule key="schedule" rows={schedule} />
      case 'cohorts':
        return <OfficialCohorts key="cohorts" groups={groups} />
      case 'contact':
        return <OfficialContact key="contact" row={pageRow} contactVisible={contactVisible} />
      case 'footer':
        return <OfficialFooter key="footer" row={pageRow} />
      default:
        return null
    }
  }

  return (
    <OfficialShell session={session} isOwnerTeacher={isOwnerTeacher} brandHref={publicBrandHref} profile={profile}>
      <div className="official-public__content">{sectionOrder.map((id) => renderSection(id))}</div>
    </OfficialShell>
  )
}
