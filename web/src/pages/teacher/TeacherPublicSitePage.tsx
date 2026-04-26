import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchOwnedWorkspaceForTeacher } from '../../lib/workspace'
import type { AcademicDegree, AcademicProfile, AcademicTextBlock, Post, PublicSiteSettings, Workspace } from '../../types'
import {
  mergePublicSiteSettings,
  PUBLIC_SECTION_IDS,
  type PublicSectionId,
} from '../../lib/publicSiteSettings'
import {
  isValidPublicWorkspaceSlug,
  normalizePublicWorkspaceSlug,
  publicWorkspaceSlugHint,
} from '../../lib/publicWorkspaceSlug'
import { emptyAcademicProfile, parseAcademicProfile, serializeAcademicProfile } from '../../lib/academicProfile'
import { PageHeader } from '../../components/PageHeader'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

type GroupRow = { id: string; group_name: string; show_on_public_site: boolean }
type EventRow = { id: string; subject_name: string | null; starts_at: string; show_on_public_site: boolean }

export function TeacherPublicSitePage() {
  const { session, refreshProfile } = useAuth()
  const [owned, setOwned] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [sectionOrder, setSectionOrder] = useState<PublicSectionId[]>([...PUBLIC_SECTION_IDS])
  const [sectionsVisible, setSectionsVisible] = useState<Record<PublicSectionId, boolean>>(
    () => ({ ...mergePublicSiteSettings({}).sectionsVisible }),
  )
  const [contactVisible, setContactVisible] = useState({
    phone: true,
    whatsapp: true,
    email: true,
    social: true,
    office_hours: true,
  })
  const [publicContactEmail, setPublicContactEmail] = useState('')
  /** عنوان الشريط العلوي للصفحة العامة (يُخزَّن في public_site_settings.page_header_title) */
  const [pageHeaderTitle, setPageHeaderTitle] = useState('')
  /** مسودة معرّف الرابط /p/{slug} */
  const [publicSlugDraft, setPublicSlugDraft] = useState('')
  const [academic, setAcademic] = useState<AcademicProfile>(() => emptyAcademicProfile())

  const [posts, setPosts] = useState<Post[]>([])
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])

  const publicPreviewUrl = useMemo(() => {
    if (!owned?.slug || typeof window === 'undefined') return null
    return `${window.location.origin}/p/${encodeURIComponent(owned.slug)}`
  }, [owned?.slug])

  const publicLiveUrl = useMemo(() => {
    if (!owned?.slug || typeof window === 'undefined') return null
    return `${window.location.origin}/p/${encodeURIComponent(owned.slug)}/live`
  }, [owned?.slug])

  const reload = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    const { workspace, error } = await fetchOwnedWorkspaceForTeacher(uid)
    if (error || !workspace) {
      setOwned(null)
      setErr(error?.message ?? null)
      setLoading(false)
      return
    }
    setOwned(workspace as Workspace)
    const merged = mergePublicSiteSettings((workspace as Workspace).public_site_settings)
    setSectionOrder(merged.sectionOrder)
    setSectionsVisible(merged.sectionsVisible)
    setContactVisible(merged.contactVisible)
    setPageHeaderTitle(merged.pageHeaderTitle)
    setPublicSlugDraft(String((workspace as Workspace).slug ?? ''))

    const { data: prof, error: pe } = await supabase
      .from('profiles')
      .select('academic_profile, public_contact_email')
      .eq('id', uid)
      .maybeSingle()
    if (pe) setErr(pe.message)
    const p = prof as { academic_profile?: unknown; public_contact_email?: string | null } | null
    setAcademic(parseAcademicProfile(p?.academic_profile))
    setPublicContactEmail((p?.public_contact_email ?? '').trim())

    const wsId = workspace.id as string
    const [pr, gr, ev] = await Promise.all([
      supabase
        .from('posts')
        .select('id, title, content, created_at, is_public_on_site, pinned, hidden_at')
        .eq('workspace_id', wsId)
        .eq('scope', 'workspace')
        .is('group_id', null)
        .is('deleted_at', null)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(80),
      supabase.from('groups').select('id, group_name, show_on_public_site').eq('workspace_id', wsId).order('created_at', { ascending: false }),
      supabase
        .from('schedule_events')
        .select('id, subject_name, starts_at, show_on_public_site')
        .eq('workspace_id', wsId)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(120),
    ])
    setPosts((pr.data as Post[]) ?? [])
    setGroups((gr.data as GroupRow[]) ?? [])
    setEvents((ev.data as EventRow[]) ?? [])
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  function buildPublicSiteSettingsPayload(): PublicSiteSettings {
    const prev =
      owned?.public_site_settings && typeof owned.public_site_settings === 'object' && !Array.isArray(owned.public_site_settings)
        ? (owned.public_site_settings as PublicSiteSettings)
        : {}
    const title = pageHeaderTitle.trim().slice(0, 200)
    return {
      ...prev,
      section_order: [...sectionOrder],
      sections_visible: { ...sectionsVisible },
      contact_visible: { ...contactVisible },
      page_header_title: title ? title : null,
    }
  }

  async function saveSiteSettings() {
    if (!owned?.id) return
    setBusy(true)
    setErr(null)
    setOkMsg(null)
    const payload = buildPublicSiteSettingsPayload()
    const { error } = await supabase.from('workspaces').update({ public_site_settings: payload }).eq('id', owned.id)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setOwned((prev) => (prev ? { ...prev, public_site_settings: payload } : null))
    setOkMsg('تم حفظ إعدادات الصفحة.')
  }

  async function savePublicSlugAndHeader() {
    if (!owned?.id) return
    setBusy(true)
    setErr(null)
    setOkMsg(null)
    const cand = normalizePublicWorkspaceSlug(publicSlugDraft)
    if (!isValidPublicWorkspaceSlug(cand)) {
      setErr(`معرّف الرابط غير صالح. ${publicWorkspaceSlugHint()}`)
      setBusy(false)
      return
    }
    const { data: exist, error: exErr } = await supabase.from('workspaces').select('id').eq('slug', cand).maybeSingle()
    if (exErr) {
      setErr(exErr.message)
      setBusy(false)
      return
    }
    if (exist && (exist as { id: string }).id !== owned.id) {
      setErr('هذا المعرف مستخدم لمساحة أخرى.')
      setBusy(false)
      return
    }
    const payload = buildPublicSiteSettingsPayload()
    const { error } = await supabase
      .from('workspaces')
      .update({ slug: cand, public_site_settings: payload })
      .eq('id', owned.id)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setOwned((prev) => (prev ? { ...prev, slug: cand, public_site_settings: payload } : null))
    setPublicSlugDraft(cand)
    setOkMsg('تم حفظ عنوان الصفحة ومُعرّف الرابط.')
  }

  async function saveAcademicAndEmail() {
    const uid = session?.user?.id
    if (!uid) return
    setBusy(true)
    setErr(null)
    setOkMsg(null)
    const ap = serializeAcademicProfile(academic)
    const email = publicContactEmail.trim() || null
    const { error } = await supabase
      .from('profiles')
      .update({ academic_profile: ap, public_contact_email: email })
      .eq('id', uid)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    await refreshProfile()
    setOkMsg('تم حفظ الملف الأكاديمي والبريد العام.')
  }

  async function togglePost(id: string, next: boolean) {
    setErr(null)
    const row = posts.find((x) => x.id === id)
    if (next && row?.hidden_at) {
      setErr('لا يمكن نشر منشور مخفي للعموم. أعد إظهاره من «منشوراتي» أولاً.')
      return
    }
    const { error } = await supabase.from('posts').update({ is_public_on_site: next }).eq('id', id)
    if (error) {
      setErr(error.message)
      return
    }
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, is_public_on_site: next } : p)))
  }

  async function toggleGroup(id: string, next: boolean) {
    setErr(null)
    const { error } = await supabase.from('groups').update({ show_on_public_site: next }).eq('id', id)
    if (error) {
      setErr(error.message)
      return
    }
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, show_on_public_site: next } : g)))
  }

  async function toggleEvent(id: string, next: boolean) {
    setErr(null)
    const { error } = await supabase.from('schedule_events').update({ show_on_public_site: next }).eq('id', id)
    if (error) {
      setErr(error.message)
      return
    }
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, show_on_public_site: next } : e)))
  }

  function moveSection(id: PublicSectionId, dir: -1 | 1) {
    setSectionOrder((prev) => {
      const i = prev.indexOf(id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[i]!
      next[i] = next[j]!
      next[j] = t
      return next
    })
  }

  function setDegree(i: number, patch: Partial<AcademicDegree>) {
    setAcademic((a) => {
      const degrees = [...(a.degrees ?? [])]
      degrees[i] = { ...degrees[i], title: degrees[i]?.title ?? '', ...patch }
      return { ...a, degrees }
    })
  }

  function addDegree() {
    setAcademic((a) => ({ ...a, degrees: [...(a.degrees ?? []), { title: '', institution: '', year: '' }] }))
  }

  function removeDegree(i: number) {
    setAcademic((a) => ({ ...a, degrees: (a.degrees ?? []).filter((_, idx) => idx !== i) }))
  }

  function setBlock(kind: 'training' | 'teachingExperience', i: number, patch: Partial<AcademicTextBlock>) {
    setAcademic((a) => {
      const key = kind
      const arr = [...(a[key] ?? [])]
      arr[i] = { ...arr[i], label: arr[i]?.label ?? '', body: arr[i]?.body ?? '', ...patch }
      return { ...a, [key]: arr }
    })
  }

  function addBlock(kind: 'training' | 'teachingExperience') {
    setAcademic((a) => ({ ...a, [kind]: [...(a[kind] ?? []), { label: '', body: '' }] }))
  }

  function removeBlock(kind: 'training' | 'teachingExperience', i: number) {
    setAcademic((a) => ({ ...a, [kind]: (a[kind] ?? []).filter((_, idx) => idx !== i) }))
  }

  if (!session?.user?.id) return <Loading />

  if (loading) return <Loading label="جاري التحميل…" />

  if (!owned) {
    return (
      <div className="page">
        <p className="breadcrumb">
          <Link to="/t">الرئيسية</Link> / الصفحة الرسمية
        </p>
        <PageHeader title="الصفحة الرسمية" subtitle="تعديل ما يظهر للزوار على الرابط العام." />
        <EmptyState title="لا مساحة مملوكة" hint="الصفحة الرسمية مرتبطة بمساحة يملكها حسابك. إن كنت أستاذاً ضيفاً في فوج فقط، يعدّل مالك المساحة الصفحة." />
      </div>
    )
  }

  return (
    <div className="page teacher-public-site">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / الصفحة الرسمية
      </p>
      <PageHeader
        title="الصفحة الرسمية"
        subtitle="تحكم بما يظهر للزائر على الرابط العام. المحتوى الحساس يبقى داخل المنصة ما لم تنشره صراحةً."
      />
      <ErrorBanner message={err} />
      {okMsg ? <p className="muted small">{okMsg}</p> : null}
      {publicPreviewUrl ? (
        <div className="teacher-account__public-banner teacher-public-site__preview">
          <p className="teacher-account__public-banner-title">خصص اسم الصفحة الرسمية</p>
          <p className="muted small wrap" dir="ltr">
            <a href={publicPreviewUrl} target="_blank" rel="noreferrer noopener">
              {publicPreviewUrl}
            </a>
          </p>
          {publicLiveUrl ? (
            <>
              <p className="teacher-account__public-banner-title teacher-public-site__live-title">
                رابط حصة عن بعد (ثابت)
              </p>
              <p className="muted small wrap" dir="ltr">
                <a href={publicLiveUrl} target="_blank" rel="noreferrer noopener">
                  {publicLiveUrl}
                </a>
              </p>
              <p className="muted small">
                انسخه للطلاب؛ تُحسب حالة «بدأت / بقي أقل من ساعة / انتهت» من حصصك الأونلاين في الجدول.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <section className="teacher-account__card teacher-public-site__section">
        <h2 className="teacher-settings__h2">تخصيص العنوان ومُعرّف الرابط</h2>
        <p className="muted small">
          يظهر العنوان في الشريط العلوي للزائر. يمكنك استبدال المعرف التلقائي (مثل t-811727fea689) بمعرّف
          أوضح يظهر في الرابط.
        </p>
        <label className="teacher-public-site__field">
          عنوان الصفحة في الأعلى (اختياري)
          <textarea
            rows={2}
            maxLength={200}
            value={pageHeaderTitle}
            onChange={(e) => setPageHeaderTitle(e.target.value)}
            placeholder="مثال: الصفحة الرسمية — الأستاذ فلان — قسم الرياضيات"
          />
        </label>
        <label className="teacher-public-site__field">
          معرّف الرابط بعد /p/…
          <input
            value={publicSlugDraft}
            onChange={(e) => setPublicSlugDraft(e.target.value)}
            dir="ltr"
            className="input--ltr"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="prof-math-smith"
            aria-describedby="public-slug-hint"
          />
        </label>
        <p id="public-slug-hint" className="muted small">
          {publicWorkspaceSlugHint()} إن غيّرت المعرف، الروابط القديمة بالمعرف السابق تتوقف عن العمل.
        </p>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void savePublicSlugAndHeader()}>
          {busy ? 'جاري الحفظ…' : 'حفظ العنوان والمعرّف'}
        </button>
      </section>

      <section className="teacher-account__card teacher-public-site__section">
        <h2 className="teacher-settings__h2">ترتيب الأقسام والإظهار</h2>
        <p className="muted small">فعّل الأقسام التي تريدها، ورتّبها بالأعلى والأسفل.</p>
        <ul className="teacher-public-site__section-list">
          {sectionOrder.map((id) => (
            <li key={id} className="teacher-public-site__section-row">
              <label className="teacher-public-site__section-label">
                <input
                  type="checkbox"
                  checked={sectionsVisible[id]}
                  onChange={(e) => setSectionsVisible((v) => ({ ...v, [id]: e.target.checked }))}
                />
                <span>{sectionLabelAr(id)}</span>
              </label>
              <span className="teacher-public-site__section-move">
                <button type="button" className="btn btn--ghost btn--small" onClick={() => moveSection(id, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => moveSection(id, 1)}>
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>
        <h3 className="teacher-public-site__h3">إظهار وسائل التواصل في الرأس وقسم التواصل</h3>
        <div className="teacher-public-site__checks">
          {(
            [
              ['phone', 'الهاتف'],
              ['whatsapp', 'واتساب'],
              ['email', 'البريد العام'],
              ['social', 'الشبكات'],
              ['office_hours', 'أوقات التواصل'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="teacher-public-site__check">
              <input
                type="checkbox"
                checked={contactVisible[k]}
                onChange={(e) => setContactVisible((c) => ({ ...c, [k]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void saveSiteSettings()}>
          {busy ? 'جاري الحفظ…' : 'حفظ إعدادات الصفحة'}
        </button>
      </section>

      <section className="teacher-account__card teacher-public-site__section">
        <h2 className="teacher-settings__h2">البريد العام والملف الأكاديمي</h2>
        <label className="teacher-public-site__field">
          بريد للعموم (اختياري)
          <input
            type="email"
            value={publicContactEmail}
            onChange={(e) => setPublicContactEmail(e.target.value)}
            dir="ltr"
            className="input--ltr"
            placeholder="you@university.ma"
          />
        </label>
        <label className="teacher-public-site__field">
          الصفة أو الرتبة
          <input value={academic.rankTitle ?? ''} onChange={(e) => setAcademic((a) => ({ ...a, rankTitle: e.target.value }))} />
        </label>
        <label className="teacher-public-site__field">
          المؤسسة (للعرض؛ يمكن أن تختلف عن اسم المساحة)
          <input value={academic.institution ?? ''} onChange={(e) => setAcademic((a) => ({ ...a, institution: e.target.value }))} />
        </label>
        <h3 className="teacher-public-site__h3">الشهادات</h3>
        {(academic.degrees ?? []).map((d, i) => (
          <div key={i} className="teacher-public-site__block-card">
            <label>
              العنوان
              <input value={d.title} onChange={(e) => setDegree(i, { title: e.target.value })} />
            </label>
            <label>
              المؤسسة
              <input value={d.institution ?? ''} onChange={(e) => setDegree(i, { institution: e.target.value })} />
            </label>
            <label>
              السنة
              <input value={d.year ?? ''} onChange={(e) => setDegree(i, { year: e.target.value })} dir="ltr" className="input--ltr" />
            </label>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => removeDegree(i)}>
              حذف
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--secondary btn--small" onClick={addDegree}>
          إضافة شهادة
        </button>
        <h3 className="teacher-public-site__h3">تكوين مكمل</h3>
        {(academic.training ?? []).map((b, i) => (
          <div key={i} className="teacher-public-site__block-card">
            <label>
              العنوان
              <input value={b.label} onChange={(e) => setBlock('training', i, { label: e.target.value })} />
            </label>
            <label>
              النص
              <textarea rows={3} value={b.body} onChange={(e) => setBlock('training', i, { body: e.target.value })} />
            </label>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => removeBlock('training', i)}>
              حذف
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--secondary btn--small" onClick={() => addBlock('training')}>
          إضافة فقرة تكوين
        </button>
        <h3 className="teacher-public-site__h3">خبرة بيداغوجية</h3>
        {(academic.teachingExperience ?? []).map((b, i) => (
          <div key={i} className="teacher-public-site__block-card">
            <label>
              العنوان
              <input value={b.label} onChange={(e) => setBlock('teachingExperience', i, { label: e.target.value })} />
            </label>
            <label>
              النص
              <textarea rows={3} value={b.body} onChange={(e) => setBlock('teachingExperience', i, { body: e.target.value })} />
            </label>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => removeBlock('teachingExperience', i)}>
              حذف
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--secondary btn--small" onClick={() => addBlock('teachingExperience')}>
          إضافة فقرة خبرة
        </button>
        <label className="teacher-public-site__field">
          اهتمامات بحثية (مفصولة بفاصلة)
          <input
            value={(academic.researchInterests ?? []).join('، ')}
            onChange={(e) =>
              setAcademic((a) => ({
                ...a,
                researchInterests: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
              }))
            }
          />
        </label>
        <label className="teacher-public-site__field">
          اللغات (مفصولة بفاصلة)
          <input
            value={(academic.languages ?? []).join('، ')}
            onChange={(e) =>
              setAcademic((a) => ({
                ...a,
                languages: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
              }))
            }
          />
        </label>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void saveAcademicAndEmail()}>
          {busy ? 'جاري الحفظ…' : 'حفظ الملف الأكاديمي والبريد'}
        </button>
      </section>

      <section className="teacher-account__card teacher-public-site__section">
        <h2 className="teacher-settings__h2">منشورات المساحة على الصفحة العامة</h2>
        <p className="muted small">فقط منشورات «كل الأفواج». عطّل ما لا تريد أن يظهر للزائر.</p>
        {posts.length === 0 ? (
          <p className="muted small">لا منشورات مستوى المساحة بعد.</p>
        ) : (
          <ul className="teacher-public-site__toggle-list">
            {posts.map((p) => (
              <li key={p.id} className="teacher-public-site__toggle-row">
                <div>
                  <strong>{p.title?.trim() || 'بدون عنوان'}</strong>
                  <p className="muted small">
                    {new Date(p.created_at).toLocaleDateString('ar-MA')}
                    {p.hidden_at ? (
                      <>
                        {' · '}
                        <span className="pill pill--compact">مخفي عن الطلاب</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <label className="teacher-public-site__toggle">
                  <input
                    type="checkbox"
                    disabled={Boolean(p.hidden_at)}
                    checked={p.hidden_at ? false : p.is_public_on_site !== false}
                    onChange={(e) => void togglePost(p.id, e.target.checked)}
                  />
                  للعموم
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="teacher-account__card teacher-public-site__section">
        <h2 className="teacher-settings__h2">الأفواج الظاهرة للعموم</h2>
        <p className="muted small">لا يُعرض رمز الانضمام ولا بيانات الطلاب — معلومات عامة فقط.</p>
        {groups.length === 0 ? (
          <p className="muted small">لا أفواج بعد.</p>
        ) : (
          <ul className="teacher-public-site__toggle-list">
            {groups.map((g) => (
              <li key={g.id} className="teacher-public-site__toggle-row">
                <span>{g.group_name}</span>
                <label className="teacher-public-site__toggle">
                  <input
                    type="checkbox"
                    checked={g.show_on_public_site}
                    onChange={(e) => void toggleGroup(g.id, e.target.checked)}
                  />
                  إظهار
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="teacher-account__card teacher-public-site__section">
        <h2 className="teacher-settings__h2">الحصص الظاهرة في معاينة الجدول</h2>
        <p className="muted small">
          يظهر الجدول للزائر فقط عند تفعيل قسم «الجدول» أعلاه. لا يُنشر رابط الاجتماع من هذه المعاينة.
        </p>
        {events.length === 0 ? (
          <p className="muted small">لا حصص قادمة في النطاق الزمني الحالي.</p>
        ) : (
          <ul className="teacher-public-site__toggle-list">
            {events.map((ev) => (
              <li key={ev.id} className="teacher-public-site__toggle-row">
                <div>
                  <strong>{ev.subject_name?.trim() || '—'}</strong>
                  <p className="muted small">
                    {new Date(ev.starts_at).toLocaleString('ar-MA', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <label className="teacher-public-site__toggle">
                  <input
                    type="checkbox"
                    checked={ev.show_on_public_site}
                    onChange={(e) => void toggleEvent(ev.id, e.target.checked)}
                  />
                  للعموم
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted small">
        الاسم والصورة والنبذة الأساسية من{' '}
        <Link to="/t/account">حسابي</Link>. الكتب والمواد «للعموم» من <Link to="/t/books">مكتبتي</Link>.
      </p>
    </div>
  )
}

function sectionLabelAr(id: PublicSectionId): string {
  const m: Record<PublicSectionId, string> = {
    hero: 'التعريف والرأس',
    academic: 'المسار الأكاديمي',
    posts: 'المنشورات العامة',
    library: 'المكتبة العلمية',
    schedule: 'معاينة الجدول',
    cohorts: 'الأفواج والمواد',
    contact: 'التواصل',
    footer: 'التذييل',
  }
  return m[id]
}
