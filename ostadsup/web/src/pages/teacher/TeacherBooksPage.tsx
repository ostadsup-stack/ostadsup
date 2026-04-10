import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import type { Group, Material } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'

type MaterialRow = Material & { groups: { group_name: string } | null }

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

const LINK_KIND_OPTIONS = [
  { value: 'seminar' as const, label: 'ندوة أو لقاء' },
  { value: 'video' as const, label: 'فيديو علمي' },
  { value: 'link' as const, label: 'رابط مرجعي' },
]

type AddPanel = 'book' | 'lesson_scientific' | 'lesson_class' | 'reference'

const WORKSPACE_PUBLIC_SCOPE = '__workspace_public__'

const LESSON_TAG_RE = /^\u200b\[lesson:(scientific|class)\]\s*/

function lessonCategoryFromDescription(desc: string | null | undefined): 'scientific' | 'class' {
  if (!desc) return 'scientific'
  const m = desc.match(LESSON_TAG_RE)
  if (m?.[1] === 'class') return 'class'
  return 'scientific'
}

function encodeLessonDescription(cat: 'scientific' | 'class', userNote: string) {
  const tag = cat === 'class' ? '\u200b[lesson:class] ' : '\u200b[lesson:scientific] '
  const note = userNote.trim()
  return note ? `${tag}${note}` : tag.trimEnd()
}

function stripLessonTagForInput(desc: string | null | undefined) {
  return (desc ?? '').replace(LESSON_TAG_RE, '').trim()
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')
}

function normalizeExternalUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^\/\//.test(t)) return `https:${t}`
  return `https://${t}`
}

export function TeacherBooksPage() {
  const { session } = useAuth()
  const location = useLocation()
  const addDetailsRef = useRef<HTMLDetailsElement>(null)
  const uid = session?.user?.id
  const [err, setErr] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null)
  const [groups, setGroups] = useState<Pick<Group, 'id' | 'group_name'>[]>([])
  const [books, setBooks] = useState<MaterialRow[]>([])
  const [scientificLessons, setScientificLessons] = useState<MaterialRow[]>([])
  const [classLessons, setClassLessons] = useState<MaterialRow[]>([])
  const [links, setLinks] = useState<MaterialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({})

  const [addPanel, setAddPanel] = useState<AddPanel | null>(null)
  const [editingRow, setEditingRow] = useState<MaterialRow | null>(null)

  /** فوج محدد أو WORKSPACE_PUBLIC_SCOPE للكتب العامة */
  const [bookScopeValue, setBookScopeValue] = useState<string | null>(null)
  const [bookTitle, setBookTitle] = useState('')
  const [bookCover, setBookCover] = useState<File | null>(null)
  const [bookFile, setBookFile] = useState<File | null>(null)
  const [bookSaving, setBookSaving] = useState(false)

  const [lessonGroupId, setLessonGroupId] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonNote, setLessonNote] = useState('')
  const [lessonCategory, setLessonCategory] = useState<'scientific' | 'class'>('scientific')
  const [lessonFile, setLessonFile] = useState<File | null>(null)
  const [lessonSaving, setLessonSaving] = useState(false)

  const [linkGroupId, setLinkGroupId] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkKind, setLinkKind] = useState<'seminar' | 'video' | 'link'>('seminar')
  const [linkSaving, setLinkSaving] = useState(false)

  const closeAddMenu = () => {
    addDetailsRef.current?.removeAttribute('open')
  }

  const reload = useCallback(async () => {
    if (!uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    const { workspace, error: wErr } = await fetchWorkspaceForTeacher(uid)
    if (wErr || !workspace) {
      setErr(wErr?.message ?? 'لم يُعثر على مساحة الأستاذ')
      setBooks([])
      setScientificLessons([])
      setClassLessons([])
      setLinks([])
      setGroups([])
      setWorkspaceId(null)
      setWorkspaceSlug(null)
      setLoading(false)
      return
    }
    const wsId = workspace.id as string
    setWorkspaceId(wsId)
    setWorkspaceSlug((workspace.slug as string) ?? null)

    const [gRes, mRes] = await Promise.all([
      supabase.from('groups').select('id, group_name').eq('workspace_id', wsId).order('group_name'),
      supabase
        .from('materials')
        .select('*, groups(group_name)')
        .eq('workspace_id', wsId)
        .eq('created_by', uid)
        .order('created_at', { ascending: false }),
    ])

    if (gRes.error) setErr(gRes.error.message)
    else setGroups((gRes.data as Pick<Group, 'id' | 'group_name'>[]) ?? [])

    if (mRes.error) {
      setErr(mRes.error.message)
      setBooks([])
      setScientificLessons([])
      setClassLessons([])
      setLinks([])
    } else {
      const all = (mRes.data as MaterialRow[]) ?? []
      setBooks(all.filter((m) => m.material_type === 'book'))
      const lessonRows = all.filter((m) => m.material_type === 'lesson')
      setScientificLessons(lessonRows.filter((m) => lessonCategoryFromDescription(m.description) === 'scientific'))
      setClassLessons(lessonRows.filter((m) => lessonCategoryFromDescription(m.description) === 'class'))
      setLinks(all.filter((m) => m.material_type === 'reference'))
    }

    setLoading(false)
  }, [uid])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (groups.length && bookScopeValue === null) setBookScopeValue(groups[0].id)
    if (groups.length && !lessonGroupId) setLessonGroupId(groups[0].id)
    if (groups.length && !linkGroupId) setLinkGroupId(groups[0].id)
  }, [groups, bookScopeValue, lessonGroupId, linkGroupId])

  useEffect(() => {
    let ok = true
    ;(async () => {
      const next: Record<string, string> = {}
      for (const b of books) {
        const p = b.cover_path
        if (!p) continue
        const { data } = await supabase.storage.from('materials').createSignedUrl(p, 3600)
        if (data?.signedUrl && ok) next[b.id] = data.signedUrl
      }
      if (ok) setCoverUrls(next)
    })()
    return () => {
      ok = false
    }
  }, [books])

  useEffect(() => {
    if (loading) return
    const raw = location.hash.replace(/^#/, '')
    const anchors = new Set([
      'library-add',
      'library-edit',
      'library-books',
      'library-scientific',
      'library-class-lessons',
      'library-links',
    ])
    if (!anchors.has(raw)) return
    const t = window.requestAnimationFrame(() => {
      document.getElementById(raw)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(t)
  }, [location.hash, loading])

  async function removeStoragePaths(paths: (string | null | undefined)[]) {
    const clean = paths.filter((p): p is string => !!p?.trim())
    if (clean.length === 0) return
    await supabase.storage.from('materials').remove(clean)
  }

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 3600)
    if (error) {
      setErr(error.message)
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function openAddPanel(panel: AddPanel) {
    setEditingRow(null)
    setAddPanel(panel)
    if (panel === 'book') {
      setBookScopeValue(groups[0]?.id ?? WORKSPACE_PUBLIC_SCOPE)
    }
    if (panel === 'lesson_scientific') setLessonCategory('scientific')
    if (panel === 'lesson_class') setLessonCategory('class')
    if (panel === 'reference') setLinkKind('seminar')
    closeAddMenu()
    window.requestAnimationFrame(() => {
      document.getElementById('library-add')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function startEdit(row: MaterialRow) {
    setAddPanel(null)
    setEditingRow(row)
    if (row.material_type === 'book') {
      setBookScopeValue(
        row.audience_scope === 'workspace_public' || row.group_id == null
          ? WORKSPACE_PUBLIC_SCOPE
          : row.group_id,
      )
      setBookTitle(row.title)
      setBookCover(null)
      setBookFile(null)
    } else if (row.material_type === 'lesson') {
      setLessonGroupId(row.group_id ?? '')
      setLessonTitle(row.title)
      setLessonCategory(lessonCategoryFromDescription(row.description))
      setLessonNote(stripLessonTagForInput(row.description))
      setLessonFile(null)
    } else if (row.material_type === 'reference') {
      setLinkGroupId(row.group_id ?? '')
      setLinkTitle(row.title)
      setLinkUrl(row.external_url ?? '')
      setLinkKind(row.link_kind ?? 'link')
    }
    window.requestAnimationFrame(() => {
      document.getElementById('library-edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function cancelEdit() {
    setEditingRow(null)
    setBookCover(null)
    setBookFile(null)
    setLessonFile(null)
  }

  async function deleteMaterial(row: MaterialRow) {
    if (!window.confirm(`حذف «${row.title}» نهائياً؟`)) return
    setErr(null)
    const paths: string[] = []
    if (row.file_path) paths.push(row.file_path)
    if (row.cover_path) paths.push(row.cover_path)
    await removeStoragePaths(paths)
    const { error } = await supabase.from('materials').delete().eq('id', row.id)
    if (error) {
      setErr(error.message)
      return
    }
    if (editingRow?.id === row.id) cancelEdit()
    await reload()
  }

  async function submitBook(e: React.FormEvent) {
    e.preventDefault()
    const scope = bookScopeValue ?? groups[0]?.id ?? WORKSPACE_PUBLIC_SCOPE
    const isPublic = scope === WORKSPACE_PUBLIC_SCOPE
    if (!workspaceId || !uid || !bookTitle.trim()) {
      setErr('أدخل عنوان الكتاب')
      return
    }
    if (!isPublic && !scope) {
      setErr('اختر فوجاً أو «للعموم»')
      return
    }
    const isEdit = editingRow?.material_type === 'book'
    if (!isEdit && !bookFile) {
      setErr('أرفق ملف الكتاب')
      return
    }
    if (bookCover) {
      const ext = (bookCover.name.split('.').pop() ?? '').toLowerCase()
      if (!IMAGE_EXT.has(ext)) {
        setErr('غلاف الكتاب: صورة jpg أو png أو gif أو webp فقط')
        return
      }
    }
    setBookSaving(true)
    setErr(null)

    const storageSeg = isPublic ? 'public' : scope

    let filePath = editingRow?.file_path ?? null
    let coverPath = editingRow?.cover_path ?? null

    if (bookFile) {
      const safeBook = safeFileName(bookFile.name)
      const bookPath = `${workspaceId}/${storageSeg}/${crypto.randomUUID()}-${safeBook}`
      const { error: upBook } = await supabase.storage.from('materials').upload(bookPath, bookFile)
      if (upBook) {
        setErr(upBook.message)
        setBookSaving(false)
        return
      }
      if (isEdit && editingRow?.file_path) await removeStoragePaths([editingRow.file_path])
      filePath = bookPath
    }

    if (bookCover) {
      const ext = (bookCover.name.split('.').pop() ?? 'jpg').toLowerCase()
      const cPath = `${workspaceId}/${storageSeg}/cover-${crypto.randomUUID()}.${ext}`
      const { error: upC } = await supabase.storage.from('materials').upload(cPath, bookCover, {
        contentType: bookCover.type || `image/${ext}`,
      })
      if (upC) {
        setErr(upC.message)
        setBookSaving(false)
        return
      }
      if (isEdit && editingRow?.cover_path) await removeStoragePaths([editingRow.cover_path])
      coverPath = cPath
    }

    if (isEdit && editingRow) {
      const { error: up } = await supabase
        .from('materials')
        .update({
          title: bookTitle.trim(),
          group_id: isPublic ? null : scope,
          audience_scope: isPublic ? 'workspace_public' : 'group',
          file_path: filePath,
          cover_path: coverPath,
        })
        .eq('id', editingRow.id)
      setBookSaving(false)
      if (up) {
        setErr(up.message)
        return
      }
      cancelEdit()
    } else {
      const { error: ins } = await supabase.from('materials').insert({
        workspace_id: workspaceId,
        group_id: isPublic ? null : scope,
        audience_scope: isPublic ? 'workspace_public' : 'group',
        created_by: uid,
        material_type: 'book',
        title: bookTitle.trim(),
        file_path: filePath!,
        cover_path: coverPath,
      })
      setBookSaving(false)
      if (ins) {
        setErr(ins.message)
        return
      }
      setBookTitle('')
      setBookCover(null)
      setBookFile(null)
      setAddPanel(null)
    }
    await reload()
  }

  async function submitLesson(e: React.FormEvent) {
    e.preventDefault()
    const cat = addPanel === 'lesson_class' ? 'class' : addPanel === 'lesson_scientific' ? 'scientific' : lessonCategory
    if (!workspaceId || !uid || !lessonGroupId || !lessonTitle.trim()) {
      setErr('اختر فوجاً واسم المحتوى')
      return
    }
    const isEdit = editingRow?.material_type === 'lesson'
    if (!isEdit && !lessonFile) {
      setErr('أرفق ملف الدرس أو المادة')
      return
    }
    setLessonSaving(true)
    setErr(null)

    let path = editingRow?.file_path ?? null
    if (lessonFile) {
      const safe = safeFileName(lessonFile.name)
      const newPath = `${workspaceId}/${lessonGroupId}/${crypto.randomUUID()}-${safe}`
      const { error: upErr } = await supabase.storage.from('materials').upload(newPath, lessonFile)
      if (upErr) {
        setErr(upErr.message)
        setLessonSaving(false)
        return
      }
      if (isEdit && editingRow?.file_path) await removeStoragePaths([editingRow.file_path])
      path = newPath
    }

    const desc = encodeLessonDescription(cat, lessonNote)

    if (isEdit && editingRow) {
      const { error: up } = await supabase
        .from('materials')
        .update({
          title: lessonTitle.trim(),
          group_id: lessonGroupId,
          file_path: path,
          description: desc || null,
        })
        .eq('id', editingRow.id)
      setLessonSaving(false)
      if (up) {
        setErr(up.message)
        return
      }
      cancelEdit()
    } else {
      const { error: ins } = await supabase.from('materials').insert({
        workspace_id: workspaceId,
        group_id: lessonGroupId,
        created_by: uid,
        material_type: 'lesson',
        title: lessonTitle.trim(),
        file_path: path!,
        description: desc || null,
      })
      setLessonSaving(false)
      if (ins) {
        setErr(ins.message)
        return
      }
      setLessonTitle('')
      setLessonNote('')
      setLessonFile(null)
      setAddPanel(null)
    }
    await reload()
  }

  async function submitLink(e: React.FormEvent) {
    e.preventDefault()
    const url = normalizeExternalUrl(linkUrl)
    if (!workspaceId || !uid || !linkGroupId || !linkTitle.trim() || !url) {
      setErr('اختر فوجاً وعنواناً ورابطاً صالحاً (https://…)')
      return
    }
    setLinkSaving(true)
    setErr(null)

    if (editingRow?.material_type === 'reference') {
      const { error: up } = await supabase
        .from('materials')
        .update({
          title: linkTitle.trim(),
          group_id: linkGroupId,
          external_url: url,
          link_kind: linkKind,
        })
        .eq('id', editingRow.id)
      setLinkSaving(false)
      if (up) {
        setErr(up.message)
        return
      }
      cancelEdit()
    } else {
      const { error: ins } = await supabase.from('materials').insert({
        workspace_id: workspaceId,
        group_id: linkGroupId,
        created_by: uid,
        material_type: 'reference',
        title: linkTitle.trim(),
        file_path: null,
        external_url: url,
        link_kind: linkKind,
      })
      setLinkSaving(false)
      if (ins) {
        setErr(ins.message)
        return
      }
      setLinkTitle('')
      setLinkUrl('')
      setLinkKind('seminar')
      setAddPanel(null)
    }
    await reload()
  }

  if (!uid) return <Loading />

  const groupSelect = (value: string, onChange: (v: string) => void) => (
    <label>
      الفوج
      <select value={value || groups[0]?.id || ''} onChange={(e) => onChange(e.target.value)} required>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.group_name}
          </option>
        ))}
      </select>
    </label>
  )

  const publicPageUrl =
    workspaceSlug && typeof window !== 'undefined'
      ? `${window.location.origin}/p/${encodeURIComponent(workspaceSlug)}`
      : null

  const addPanelTitle =
    addPanel === 'book'
      ? 'إضافة كتاب'
      : addPanel === 'lesson_scientific'
        ? 'إضافة مادة علمية'
        : addPanel === 'lesson_class'
          ? 'إضافة درس'
          : addPanel === 'reference'
            ? 'إضافة ندوة أو رابط'
            : null

  const lessonFormIntro =
    addPanel === 'lesson_scientific'
      ? 'رفع ملف مرتبط بمادة أو مساق (عرض، PDF، أرشيف…).'
      : addPanel === 'lesson_class'
        ? 'رفع ملف الدرس (حصة محددة).'
        : 'تعديل الملف أو العنوان أو الفوج.'

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / مكتبتي
      </p>
      <PageHeader
        title="مكتبتي"
        subtitle="إدارة الكتب والمواد والدروس والروابط. يمكنك الإضافة من القائمة، ثم التعديل أو الحذف من كل قسم."
      />
      {publicPageUrl ? (
        <p className="library-public-hint muted small">
          <strong className="library-public-hint__label">معاينة الصفحة العامة:</strong>{' '}
          <a href={publicPageUrl} target="_blank" rel="noreferrer noopener" className="library-public-hint__link">
            فتح الصفحة الرسمية
          </a>
        </p>
      ) : null}
      <ErrorBanner message={err} />

      {loading ? (
        <Loading label="جاري التحميل…" />
      ) : (
        <>
          <div className="library-add-toolbar">
            <details ref={addDetailsRef} className="library-add-details">
              <summary className="btn btn--primary library-add-summary">
                إضافة
              </summary>
              <ul className="library-add-menu" role="menu">
                <li role="none">
                  <button type="button" role="menuitem" className="library-add-menu__btn" onClick={() => openAddPanel('book')}>
                    كتب
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="library-add-menu__btn"
                    onClick={() => openAddPanel('lesson_scientific')}
                  >
                    مادة علمية
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="library-add-menu__btn"
                    onClick={() => openAddPanel('lesson_class')}
                  >
                    درس
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="library-add-menu__btn"
                    onClick={() => openAddPanel('reference')}
                  >
                    ندوة أو رابط
                  </button>
                </li>
              </ul>
            </details>
            <p className="muted small library-add-toolbar__hint">اختر نوع المحتوى، ثم املأ النموذج أدناه.</p>
          </div>

          <nav className="library-toc" aria-label="تنقل داخل مكتبتي">
            <a href="#library-books">كتبي</a>
            <span className="library-toc__sep" aria-hidden>
              ·
            </span>
            <a href="#library-scientific">مواد علمية</a>
            <span className="library-toc__sep" aria-hidden>
              ·
            </span>
            <a href="#library-class-lessons">دروس</a>
            <span className="library-toc__sep" aria-hidden>
              ·
            </span>
            <a href="#library-links">ندوات وروابط</a>
            <span className="library-toc__sep" aria-hidden>
              ·
            </span>
            <a href="#library-add">إضافة</a>
          </nav>

          {editingRow ? (
            <section id="library-edit" className="section library-section library-section--edit" tabIndex={-1}>
              <h2 className="library-section__title">تعديل المحتوى</h2>
              <button type="button" className="btn btn--ghost library-section__cancel" onClick={cancelEdit}>
                إلغاء التعديل
              </button>

              {editingRow.material_type === 'book' ? (
                <form className="form teacher-library__form" onSubmit={(e) => void submitBook(e)} aria-label="تعديل كتاب">
                  <label>
                    الظهور
                    <select
                      value={bookScopeValue ?? WORKSPACE_PUBLIC_SCOPE}
                      onChange={(e) => setBookScopeValue(e.target.value)}
                    >
                      <option value={WORKSPACE_PUBLIC_SCOPE}>للعموم (جميع مستخدمي التطبيق)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          فوج: {g.group_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="field-hint muted small">
                    «للعموم»: يظهر في صفحتك العامة ولأي مستخدم مسجّل دون ربط بفوج.
                  </p>
                  <label>
                    اسم الكتاب
                    <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} required maxLength={200} />
                  </label>
                  <label>
                    صورة الغلاف (اتركه فارغاً للإبقاء على الحالي)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={(e) => setBookCover(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    ملف الكتاب (اتركه فارغاً للإبقاء على الحالي)
                    <input type="file" onChange={(e) => setBookFile(e.target.files?.[0] ?? null)} />
                  </label>
                  <button type="submit" className="btn btn--primary" disabled={bookSaving}>
                    {bookSaving ? 'جاري الحفظ…' : 'حفظ التعديلات'}
                  </button>
                </form>
              ) : null}

              {editingRow.material_type === 'lesson' && groups.length > 0 ? (
                <form className="form teacher-library__form" onSubmit={(e) => void submitLesson(e)} aria-label="تعديل درس أو مادة">
                  {groupSelect(lessonGroupId, setLessonGroupId)}
                  <label>
                    العنوان
                    <input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} required maxLength={200} />
                  </label>
                  <label>
                    التصنيف في المكتبة
                    <select
                      value={lessonCategory}
                      onChange={(e) => setLessonCategory(e.target.value === 'class' ? 'class' : 'scientific')}
                    >
                      <option value="scientific">مادة علمية</option>
                      <option value="class">درس</option>
                    </select>
                  </label>
                  <label>
                    ملاحظة داخلية (اختياري)
                    <input value={lessonNote} onChange={(e) => setLessonNote(e.target.value)} maxLength={500} />
                  </label>
                  <label>
                    ملف جديد (اتركه فارغاً للإبقاء على الحالي)
                    <input type="file" onChange={(e) => setLessonFile(e.target.files?.[0] ?? null)} />
                  </label>
                  <button type="submit" className="btn btn--primary" disabled={lessonSaving}>
                    {lessonSaving ? 'جاري الحفظ…' : 'حفظ التعديلات'}
                  </button>
                </form>
              ) : null}

              {editingRow.material_type === 'reference' && groups.length > 0 ? (
                <form className="form teacher-library__form" onSubmit={(e) => void submitLink(e)} aria-label="تعديل رابط">
                  {groupSelect(linkGroupId, setLinkGroupId)}
                  <label>
                    العنوان
                    <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} required maxLength={200} />
                  </label>
                  <label>
                    نوع المحتوى
                    <select value={linkKind} onChange={(e) => setLinkKind(e.target.value as 'seminar' | 'video' | 'link')}>
                      {LINK_KIND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    الرابط (URL)
                    <input
                      type="text"
                      inputMode="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      dir="ltr"
                      className="input--ltr"
                      required
                    />
                  </label>
                  <button type="submit" className="btn btn--primary" disabled={linkSaving}>
                    {linkSaving ? 'جاري الحفظ…' : 'حفظ التعديلات'}
                  </button>
                </form>
              ) : null}

              {editingRow && editingRow.material_type !== 'book' && groups.length === 0 ? (
                <p className="muted">
                  لا يوجد فوج. أنشئ فوجاً من <Link to="/t/groups">الأفواج</Link>.
                </p>
              ) : null}
            </section>
          ) : null}

          {addPanel && (addPanel === 'book' || groups.length > 0) ? (
            <section id="library-add" className="section library-section" tabIndex={-1}>
              <div className="library-section__add-head">
                <h2 className="library-section__title">{addPanelTitle}</h2>
                <button type="button" className="btn btn--ghost" onClick={() => setAddPanel(null)}>
                  إغلاق النموذج
                </button>
              </div>

              {addPanel === 'book' ? (
                <form className="form teacher-library__form" onSubmit={(e) => void submitBook(e)} aria-label="إضافة كتاب">
                  <label>
                    الظهور
                    <select
                      value={bookScopeValue ?? WORKSPACE_PUBLIC_SCOPE}
                      onChange={(e) => setBookScopeValue(e.target.value)}
                    >
                      <option value={WORKSPACE_PUBLIC_SCOPE}>للعموم (جميع مستخدمي التطبيق)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          فوج: {g.group_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="field-hint muted small">
                    «للعموم»: يظهر في صفحتك العامة ولأي مستخدم مسجّل دون ربط بفوج.
                  </p>
                  <label>
                    اسم الكتاب
                    <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} required maxLength={200} />
                  </label>
                  <label>
                    صورة الغلاف (اختياري)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={(e) => setBookCover(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    ملف الكتاب
                    <input type="file" onChange={(e) => setBookFile(e.target.files?.[0] ?? null)} required />
                  </label>
                  <button type="submit" className="btn btn--primary" disabled={bookSaving}>
                    {bookSaving ? 'جاري الرفع…' : 'حفظ الكتاب'}
                  </button>
                </form>
              ) : null}

              {addPanel === 'lesson_scientific' || addPanel === 'lesson_class' ? (
                <form className="form teacher-library__form" onSubmit={(e) => void submitLesson(e)} aria-label={addPanelTitle ?? ''}>
                  <p className="muted small">{lessonFormIntro}</p>
                  {groupSelect(lessonGroupId, setLessonGroupId)}
                  <label>
                    العنوان
                    <input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} required maxLength={200} />
                  </label>
                  <label>
                    ملاحظة داخلية (اختياري)
                    <input value={lessonNote} onChange={(e) => setLessonNote(e.target.value)} maxLength={500} />
                  </label>
                  <label>
                    الملف
                    <input type="file" onChange={(e) => setLessonFile(e.target.files?.[0] ?? null)} required />
                  </label>
                  <button type="submit" className="btn btn--primary" disabled={lessonSaving}>
                    {lessonSaving ? 'جاري الرفع…' : 'حفظ'}
                  </button>
                </form>
              ) : null}

              {addPanel === 'reference' ? (
                <form className="form teacher-library__form" onSubmit={(e) => void submitLink(e)} aria-label="إضافة رابط">
                  {groupSelect(linkGroupId, setLinkGroupId)}
                  <label>
                    العنوان
                    <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} required maxLength={200} />
                  </label>
                  <label>
                    نوع المحتوى
                    <select value={linkKind} onChange={(e) => setLinkKind(e.target.value as 'seminar' | 'video' | 'link')}>
                      {LINK_KIND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    الرابط (URL)
                    <input
                      type="text"
                      inputMode="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://…"
                      dir="ltr"
                      className="input--ltr"
                      required
                    />
                  </label>
                  <button type="submit" className="btn btn--primary" disabled={linkSaving}>
                    {linkSaving ? 'جاري الحفظ…' : 'حفظ الرابط'}
                  </button>
                </form>
              ) : null}
            </section>
          ) : addPanel && groups.length === 0 ? (
            <section id="library-add" className="section library-section" tabIndex={-1}>
              <p className="muted">
                لا يوجد فوج بعد. أنشئ فوجاً من <Link to="/t/groups">الأفواج</Link> ثم عُد للإضافة.
              </p>
            </section>
          ) : null}

          <section id="library-books" className="section library-section" aria-labelledby="library-books-heading">
            <h2 id="library-books-heading" className="library-section__title">
              كتبي
            </h2>
            {books.length === 0 ? (
              <EmptyState title="لا كتب بعد" hint='اضغط «إضافة» ثم اختر «كتب».' />
            ) : (
              <ul className="library-books-grid" aria-label="قائمة الكتب">
                {books.map((b) => (
                  <li key={b.id} className="library-book-tile">
                    <button
                      type="button"
                      className="library-book-tile__inner"
                      onClick={() => b.file_path && void openFile(b.file_path)}
                      disabled={!b.file_path}
                      aria-label={`فتح ملف الكتاب: ${b.title}`}
                    >
                      <div className="library-book-tile__cover">
                        {coverUrls[b.id] ? (
                          <img src={coverUrls[b.id]} alt={`غلاف ${b.title}`} className="library-book-tile__img" />
                        ) : (
                          <span className="library-book-tile__placeholder" aria-hidden>
                            {b.title.charAt(0) || '📖'}
                          </span>
                        )}
                      </div>
                      <span className="library-book-tile__name">{b.title}</span>
                    </button>
                    <p className="library-book-tile__meta muted small">
                      {b.audience_scope === 'workspace_public' || b.group_id == null ? (
                        <span className="pill pill--public">للعموم</span>
                      ) : (
                        <>
                          {b.groups?.group_name ?? 'فوج'} ·{' '}
                          <Link to={`/t/groups/${b.group_id}`} onClick={(e) => e.stopPropagation()}>
                            الفوج
                          </Link>
                        </>
                      )}
                    </p>
                    <div className="library-item-actions">
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => startEdit(b)}>
                        تعديل
                      </button>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => void deleteMaterial(b)}>
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="library-scientific" className="section library-section">
            <h2 className="library-section__title">المواد العلمية</h2>
            {scientificLessons.length === 0 ? (
              <EmptyState title="لا مواد بعد" hint='اضغط «إضافة» ثم «مادة علمية».' />
            ) : (
              <ul className="library-lessons-list">
                {scientificLessons.map((m) => (
                  <li key={m.id} className="library-lesson-row">
                    <div>
                      <strong>{m.title}</strong>
                      <p className="muted small">
                        {m.group_id ? (
                          <>
                            {m.groups?.group_name ?? 'فوج'} ·{' '}
                            <Link to={`/t/groups/${m.group_id}`}>فتح الفوج</Link>
                          </>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                    <div className="library-lesson-row__actions">
                      {m.file_path ? (
                        <button type="button" className="btn btn--ghost" onClick={() => void openFile(m.file_path!)}>
                          فتح / تحميل
                        </button>
                      ) : (
                        <span className="muted small">لا ملف</span>
                      )}
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => startEdit(m)}>
                        تعديل
                      </button>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => void deleteMaterial(m)}>
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="library-class-lessons" className="section library-section">
            <h2 className="library-section__title">الدروس</h2>
            {classLessons.length === 0 ? (
              <EmptyState title="لا دروس بعد" hint='اضغط «إضافة» ثم «درس».' />
            ) : (
              <ul className="library-lessons-list">
                {classLessons.map((m) => (
                  <li key={m.id} className="library-lesson-row">
                    <div>
                      <strong>{m.title}</strong>
                      <p className="muted small">
                        {m.group_id ? (
                          <>
                            {m.groups?.group_name ?? 'فوج'} ·{' '}
                            <Link to={`/t/groups/${m.group_id}`}>فتح الفوج</Link>
                          </>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                    <div className="library-lesson-row__actions">
                      {m.file_path ? (
                        <button type="button" className="btn btn--ghost" onClick={() => void openFile(m.file_path!)}>
                          فتح / تحميل
                        </button>
                      ) : (
                        <span className="muted small">لا ملف</span>
                      )}
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => startEdit(m)}>
                        تعديل
                      </button>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => void deleteMaterial(m)}>
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="library-links" className="section library-section">
            <h2 className="library-section__title">الندوات والروابط</h2>
            {links.length === 0 ? (
              <EmptyState title="لا روابط بعد" hint='اضغط «إضافة» ثم «ندوة أو رابط».' />
            ) : (
              <ul className="library-links-list">
                {links.map((l) => {
                  const href = l.external_url?.trim() ? normalizeExternalUrl(l.external_url) : null
                  const kindLabel = LINK_KIND_OPTIONS.find((o) => o.value === l.link_kind)?.label ?? 'رابط'
                  return (
                    <li key={l.id} className="library-link-row">
                      <div>
                        <span className="pill pill--seminar library-link-row__kind">{kindLabel}</span>
                        <strong className="library-link-row__title">{l.title}</strong>
                        <p className="muted small">
                          {l.groups?.group_name ?? 'فوج'}
                          {href ? (
                            <>
                              {' · '}
                              <a href={href} target="_blank" rel="noreferrer noopener" dir="ltr" className="library-link-row__url">
                                فتح الرابط
                              </a>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="library-item-actions library-item-actions--row">
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => startEdit(l)}>
                          تعديل
                        </button>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => void deleteMaterial(l)}>
                          حذف
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
