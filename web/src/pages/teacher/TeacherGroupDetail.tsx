import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { shareWhatsAppMessage } from '../../lib/workspace'
import { cohortPageSurfaceStyle, DEFAULT_GROUP_ACCENT, normalizeGroupAccent } from '../../lib/groupTheme'
import { whatsappHref } from '../../lib/whatsapp'
import {
  nextEndAfterStartChange,
  scheduleFieldsFromIso,
  formatHhmmDigitsInput,
  commitHhmmText,
  parseClock,
} from '../../lib/scheduleFormTimes'
import {
  findOverlappingScheduleEvents,
  isPostgresExclusionViolation,
  isScheduleStartInPast,
  isScheduleStartInPastViolation,
  isTeacherCrossGroupOverlapViolation,
  scheduleCrossGroupOverlapUserMessage,
  scheduleEventCreatorLabel,
  scheduleExclusionUserMessage,
  scheduleStartInPastUserMessage,
} from '../../lib/scheduleConflict'
import type {
  Group,
  GroupMember,
  GroupScheduleMode,
  GroupStudyTrack,
  Material,
  Post,
  ScheduleEvent,
  StudyLevel,
} from '../../types'
import { buildSuggestedCohortCode } from '../../lib/cohortCode'
import { studyLevelLabelAr } from '../../lib/teacherGroups'
import { addDays, sameLocalDay, startOfMonday } from '../../lib/teacherWeekSchedule'
import { formatAppDateTime, formatAppTime } from '../../lib/appDateTime'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

function applyStartHhmm<T extends { start_time: string; end_time: string }>(raw: string, s: T): T {
  const t = formatHhmmDigitsInput(raw)
  const p = parseClock(t)
  return {
    ...s,
    start_time: t,
    end_time: p ? nextEndAfterStartChange(s.start_time, s.end_time, t) : s.end_time,
  }
}

type MemberContactInfo = {
  phone: string | null
  whatsapp: string | null
  email: string
  student_number: string | null
  full_name: string | null
}

const emptySchedForm = {
  event_type: 'class' as 'class' | 'seminar',
  subject_name: '',
  mode: 'on_site' as 'on_site' | 'online',
  schedule_date: '',
  start_time: '',
  end_time: '',
  location: '',
  meeting_link: '',
  note: '',
}

export function TeacherGroupDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { session, profile } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [groupOwnerWorkspaceId, setGroupOwnerWorkspaceId] = useState<string | null>(null)
  const [isGroupOwner, setIsGroupOwner] = useState(false)
  const [isLinkedStaff, setIsLinkedStaff] = useState(false)
  const [joinUrlStudent, setJoinUrlStudent] = useState('')
  const [teacherLinkSecret, setTeacherLinkSecret] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [rotatingLink, setRotatingLink] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  /** كل حصصي في مساحة العمل (للكشف عن تداخل بين فوجين) */
  const [myWorkspaceScheduleMine, setMyWorkspaceScheduleMine] = useState<ScheduleEvent[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [memberContacts, setMemberContacts] = useState<Record<string, MemberContactInfo>>({})
  const [loading, setLoading] = useState(true)
  const [metaSaving, setMetaSaving] = useState(false)
  const [metaSuggesting, setMetaSuggesting] = useState(false)
  const [metaForm, setMetaForm] = useState({
    study_level: 'licence' as StudyLevel,
    schedule_mode: 'normal' as GroupScheduleMode,
    study_track: 'normal' as GroupStudyTrack,
    academic_year: '',
    cohort_official_code: '',
    cohort_suffix: '',
    cohort_sequence: '',
    accent_color: DEFAULT_GROUP_ACCENT,
  })

  const [postForm, setPostForm] = useState({
    scope: 'group' as 'group' | 'workspace',
    title: '',
    content: '',
  })
  const [matTitle, setMatTitle] = useState('')
  const [matFile, setMatFile] = useState<File | null>(null)
  const [sched, setSched] = useState({ ...emptySchedForm })
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editSched, setEditSched] = useState<typeof emptySchedForm | null>(null)
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null)
  const [scheduleEditSaving, setScheduleEditSaving] = useState(false)
  const [scheduleConflictBlocker, setScheduleConflictBlocker] = useState<ScheduleEvent | null>(null)
  const [editScheduleConflictBlocker, setEditScheduleConflictBlocker] = useState<ScheduleEvent | null>(null)
  const [slotRequestSending, setSlotRequestSending] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false)
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null)
  /** تداخل حصص لنفس الأستاذ بين فوجين — موافقة صريحة ثم teacher_cross_group_overlap_ack (مثل منطق طلب الموافقة لنفس الفوج) */
  const [crossGroupOverlapCard, setCrossGroupOverlapCard] = useState<{
    kind: 'new' | 'edit'
    otherSessions: ScheduleEvent[]
  } | null>(null)
  const [crossGroupOverlapSaving, setCrossGroupOverlapSaving] = useState(false)

  const cohortAccentHex = useMemo(() => {
    if (!group) return DEFAULT_GROUP_ACCENT
    if (isGroupOwner) {
      const t = metaForm.accent_color.trim()
      if (/^#[0-9A-Fa-f]{6}$/.test(t)) return normalizeGroupAccent(t)
    }
    return normalizeGroupAccent(group.accent_color)
  }, [group, isGroupOwner, metaForm.accent_color])

  const activeScheduleEvents = useMemo(
    () => events.filter((ev) => ev.status !== 'cancelled'),
    [events],
  )

  const scheduleBuckets = useMemo(() => {
    const now = new Date()
    const todayRef = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const mondayThis = startOfMonday(now)
    const sundayThisEnd = addDays(mondayThis, 6)
    sundayThisEnd.setHours(23, 59, 59, 999)
    const nextMonday = addDays(mondayThis, 7)
    const nextSundayEnd = addDays(nextMonday, 6)
    nextSundayEnd.setHours(23, 59, 59, 999)

    const startOf = (ev: ScheduleEvent) => new Date(ev.starts_at)
    const sortByStart = (a: ScheduleEvent, b: ScheduleEvent) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()

    const today = activeScheduleEvents
      .filter((ev) => sameLocalDay(startOf(ev), todayRef))
      .sort(sortByStart)

    const thisWeek = activeScheduleEvents
      .filter((ev) => {
        const t = startOf(ev)
        if (sameLocalDay(t, todayRef)) return false
        return t >= mondayThis && t <= sundayThisEnd
      })
      .sort(sortByStart)

    const nextWeek = activeScheduleEvents
      .filter((ev) => {
        const t = startOf(ev)
        return t >= nextMonday && t <= nextSundayEnd
      })
      .sort(sortByStart)

    return { today, thisWeek, nextWeek }
  }, [activeScheduleEvents])

  const activeMembers = useMemo(
    () => members.filter((m) => (m.status ?? 'active') === 'active'),
    [members],
  )

  const studentMembers = useMemo(
    () => activeMembers.filter((m) => m.role_in_group === 'student'),
    [activeMembers],
  )

  const coordinatorMembers = useMemo(
    () => activeMembers.filter((m) => m.role_in_group === 'coordinator'),
    [activeMembers],
  )

  const headerCoordinatorLabel = useMemo(() => {
    const names = coordinatorMembers
      .map((c) => (c.display_name ?? '').trim())
      .filter(Boolean)
    return names.length ? names.join('، ') : '—'
  }, [coordinatorMembers])

  const studentCount = studentMembers.length

  useEffect(() => {
    if (!joinUrlStudent) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void import('qrcode').then((QR) => {
      QR.toDataURL(joinUrlStudent, { margin: 1, width: 200 })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url)
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [joinUrlStudent])

  useEffect(() => {
    if (location.hash !== '#group-schedule' || loading) return
    setSchedulePanelOpen(true)
    const el = document.getElementById('group-schedule')
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash, loading])

  useEffect(() => {
    if (location.hash !== '#wall' || loading) return
    const el = document.getElementById('teacher-group-wall')
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash, loading])

  useEffect(() => {
    if (loading) return
    if (searchParams.get('compose') !== 'announce') return
    if (isGroupOwner || isLinkedStaff) {
      setPostForm((f) => ({ ...f, scope: 'workspace' }))
    }
    const el = document.getElementById('teacher-group-wall')
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('compose')
        return next
      },
      { replace: true },
    )
  }, [loading, searchParams, isGroupOwner, isLinkedStaff, setSearchParams])

  async function reload() {
    if (!id || !session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setIsLinkedStaff(false)
    setEditingEventId(null)
    setEditSched(null)
    setScheduleConflictBlocker(null)
    setEditScheduleConflictBlocker(null)
    const { data: ownedWs } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_teacher_id', session.user.id)
      .maybeSingle()

    const { data: g, error: gErr } = await supabase.from('groups').select('*').eq('id', id).single()
    if (gErr || !g) {
      setErr('الفوج غير موجود')
      setLoading(false)
      return
    }

    const { data: linkRow } = await supabase
      .from('group_staff')
      .select('id')
      .eq('group_id', id)
      .eq('teacher_id', session.user.id)
      .eq('status', 'active')
      .maybeSingle()

    const owner = !!ownedWs && ownedWs.id === g.workspace_id
    const linked = !!linkRow
    if (!owner && !linked) {
      setErr('الفوج غير موجود أو ليس لديك صلاحية')
      setLoading(false)
      return
    }

    setIsGroupOwner(owner)
    setIsLinkedStaff(linked)
    setGroupOwnerWorkspaceId(g.workspace_id)
    setGroup(g as Group)
    setErr(null)

    const { data: tokRows, error: tokErr } = await supabase.rpc('get_group_invite_tokens', {
      p_group_id: id,
    })
    if (!tokErr && tokRows && Array.isArray(tokRows) && tokRows.length > 0) {
      const tok = tokRows[0] as { student_join_secret: string; teacher_link_secret: string }
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      setJoinUrlStudent(`${origin}/s/join?t=${encodeURIComponent(tok.student_join_secret)}`)
      setTeacherLinkSecret(tok.teacher_link_secret)
    } else {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      setJoinUrlStudent(
        origin ? `${origin}/s/join?code=${encodeURIComponent((g as Group).join_code)}` : '',
      )
      setTeacherLinkSecret(null)
    }

    const [p, m, e, mem, mine] = await Promise.all([
      supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', g.workspace_id)
        .is('deleted_at', null)
        .or(`group_id.eq.${id},scope.eq.workspace`)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('materials')
        .select('*')
        .eq('group_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('schedule_events')
        .select('*, profiles:profiles!schedule_events_created_by_fkey(full_name)')
        .eq('group_id', id)
        .order('starts_at', { ascending: true }),
      supabase.from('group_members').select('*').eq('group_id', id),
      supabase
        .from('schedule_events')
        .select('id, group_id, starts_at, ends_at, status, created_by, event_type, mode')
        .eq('workspace_id', g.workspace_id)
        .eq('created_by', session.user.id),
    ])
    const batchErr =
      p.error?.message ??
      m.error?.message ??
      e.error?.message ??
      mem.error?.message ??
      mine.error?.message ??
      null
    setPosts((p.data as Post[]) ?? [])
    setMaterials((m.data as Material[]) ?? [])
    setEvents((e.data as ScheduleEvent[]) ?? [])
    setMembers((mem.data as GroupMember[]) ?? [])
    setMyWorkspaceScheduleMine((mine.data as ScheduleEvent[]) ?? [])

    const contactMap: Record<string, MemberContactInfo> = {}
    const { data: crew, error: crewErr } = await supabase.rpc('list_group_member_contacts_for_staff', {
      p_group_id: id,
    })
    if (!crewErr && crew) {
      for (const row of crew as {
        user_id: string
        full_name: string | null
        phone: string | null
        whatsapp: string | null
        email: string | null
        student_number: string | null
      }[]) {
        contactMap[row.user_id] = {
          full_name: row.full_name,
          phone: row.phone,
          whatsapp: row.whatsapp,
          email: row.email ?? '',
          student_number: row.student_number,
        }
      }
    }
    setMemberContacts(contactMap)
    setErr(batchErr ?? crewErr?.message ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [id, session?.user?.id])

  useEffect(() => {
    if (loading) return
    if (!isGroupOwner && !isLinkedStaff) {
      setPostForm((f) => (f.scope === 'workspace' ? { ...f, scope: 'group' } : f))
    }
  }, [loading, isGroupOwner, isLinkedStaff])

  useEffect(() => {
    if (!group) return
    setMetaForm({
      study_level: group.study_level ?? 'licence',
      schedule_mode: group.schedule_mode === 'simplified' ? 'simplified' : 'normal',
      study_track: group.study_track === 'excellence' ? 'excellence' : 'normal',
      academic_year: group.academic_year ?? '',
      cohort_official_code: group.cohort_official_code ?? '',
      cohort_suffix: group.cohort_suffix ?? '',
      cohort_sequence: group.cohort_sequence != null ? String(group.cohort_sequence) : '',
      accent_color:
        group.accent_color && /^#[0-9A-Fa-f]{6}$/.test(group.accent_color)
          ? group.accent_color
          : DEFAULT_GROUP_ACCENT,
    })
  }, [group])

  async function suggestMetaOfficialCode() {
    if (!groupOwnerWorkspaceId || !id) return
    setMetaSuggesting(true)
    setErr(null)
    const year = metaForm.academic_year.trim()
    const level = metaForm.study_level
    let q = supabase
      .from('groups')
      .select('cohort_sequence')
      .eq('workspace_id', groupOwnerWorkspaceId)
      .eq('study_level', level)
      .neq('id', id)
    if (year) q = q.eq('academic_year', year)
    else q = q.is('academic_year', null)
    const { data, error } = await q
    setMetaSuggesting(false)
    if (error) {
      setErr(error.message)
      return
    }
    const seqs = ((data ?? []) as { cohort_sequence: number | null }[])
      .map((r) => r.cohort_sequence)
      .filter((n): n is number => typeof n === 'number' && n > 0)
    const next = (seqs.length ? Math.max(...seqs) : 0) + 1
    const code = buildSuggestedCohortCode(level, year || '????', next, metaForm.cohort_suffix || undefined)
    setMetaForm((f) => ({ ...f, cohort_official_code: code, cohort_sequence: String(next) }))
  }

  async function saveGroupMeta(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !group) return
    setMetaSaving(true)
    setErr(null)
    const seqStr = metaForm.cohort_sequence.trim()
    const parsed = seqStr === '' ? null : parseInt(seqStr, 10)
    const accent = metaForm.accent_color.trim()
    const { error } = await supabase
      .from('groups')
      .update({
        study_level: metaForm.study_level,
        schedule_mode: metaForm.schedule_mode,
        study_track: metaForm.study_track,
        academic_year: metaForm.academic_year.trim() || null,
        cohort_official_code: metaForm.cohort_official_code.trim() || null,
        cohort_suffix: metaForm.cohort_suffix.trim() || null,
        cohort_sequence: parsed !== null && Number.isFinite(parsed) ? parsed : null,
        accent_color: /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : DEFAULT_GROUP_ACCENT,
      })
      .eq('id', id)
    setMetaSaving(false)
    if (error) setErr(error.message)
    else await reload()
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault()
    if (!groupOwnerWorkspaceId || !session?.user?.id || !id) return
    setErr(null)
    const row = {
      workspace_id: groupOwnerWorkspaceId,
      group_id: postForm.scope === 'group' ? id : null,
      author_id: session.user.id,
      scope: postForm.scope,
      title: postForm.title.trim() || null,
      content: postForm.content.trim(),
      post_type: 'general',
      is_public_on_site: postForm.scope === 'workspace',
    }
    const { error } = await supabase.from('posts').insert(row)
    if (error) {
      setErr(error.message)
      return
    }
    setPostForm({ scope: 'group', title: '', content: '' })
    await reload()
  }

  async function uploadMaterial(e: React.FormEvent) {
    e.preventDefault()
    if (!groupOwnerWorkspaceId || !session?.user?.id || !id || !matFile) {
      setErr('اختر ملفاً')
      return
    }
    setErr(null)
    const safeName = matFile.name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')
    const path = `${groupOwnerWorkspaceId}/${id}/${crypto.randomUUID()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('materials').upload(path, matFile)
    if (upErr) {
      setErr(upErr.message)
      return
    }
    const { error } = await supabase.from('materials').insert({
      workspace_id: groupOwnerWorkspaceId,
      group_id: id,
      created_by: session.user.id,
      material_type: 'lesson',
      title: matTitle.trim() || matFile.name,
      file_path: path,
    })
    if (error) {
      setErr(error.message)
      return
    }
    setMatTitle('')
    setMatFile(null)
    await reload()
  }

  function rejectCrossGroupOverlap() {
    const card = crossGroupOverlapCard
    const editId = editingEventId
    setCrossGroupOverlapCard(null)
    setErr(null)
    requestAnimationFrame(() => {
      if (card?.kind === 'edit' && editId) {
        document.getElementById(`schedule-event-${editId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const t = document.querySelector(
          `#schedule-event-${editId} .schedule-list__edit-form #schedule-edit-start`,
        ) as HTMLInputElement | null
        t?.focus()
        return
      }
      setSchedulePanelOpen(true)
      document.getElementById('group-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      document.getElementById('schedule-new-start')?.focus()
    })
  }

  async function confirmCrossGroupOverlap() {
    if (!crossGroupOverlapCard || !groupOwnerWorkspaceId || !session?.user?.id || !id) return
    const kind = crossGroupOverlapCard.kind
    if (kind === 'new') {
      if (!sched.schedule_date || !sched.start_time || !sched.end_time) {
        setErr('حدد اليوم ووقت البداية والنهاية')
        return
      }
      const starts = new Date(`${sched.schedule_date}T${sched.start_time}:00`)
      const ends = new Date(`${sched.schedule_date}T${sched.end_time}:00`)
      if (!(ends.getTime() > starts.getTime())) {
        setErr('وقت النهاية يجب أن يكون بعد وقت البداية في نفس اليوم')
        return
      }
      if (isScheduleStartInPast(starts)) {
        setErr(scheduleStartInPastUserMessage())
        setCrossGroupOverlapCard(null)
        return
      }
      const overlaps = findOverlappingScheduleEvents(events, starts, ends)
      const myId = session.user.id
      const selfBlocks = overlaps.filter((ev) => ev.created_by === myId)
      const otherBlock = overlaps.find((ev) => ev.created_by !== myId)
      if (selfBlocks.length > 0) {
        setErr('لديك حصة أو ندوة أخرى لهذا الفوج في هذا الوقت. غيّر الوقت أو عدّل الموعد القائم.')
        setCrossGroupOverlapCard(null)
        return
      }
      if (otherBlock) {
        setErr(
          `لا يمكن حجز نفس الفوج مرتين في هذا الوقت إلا بموافقة صاحب الحصة الحالية. يوجد ${otherBlock.event_type === 'seminar' ? 'ندوة' : 'حصة'} لـ ${scheduleEventCreatorLabel(otherBlock)}. غيّر الوقت أو اضغط «إرسال طلب موافقة» ليصل له طلبك ويقرّر.`,
        )
        setScheduleConflictBlocker(otherBlock)
        setCrossGroupOverlapCard(null)
        return
      }
      const otherGroupMine = myWorkspaceScheduleMine.filter(
        (ev) => ev.group_id !== id && ev.status !== 'cancelled',
      )
      const crossOverlap = findOverlappingScheduleEvents(otherGroupMine, starts, ends)
      const needsAck = crossOverlap.length > 0
      setCrossGroupOverlapSaving(true)
      setErr(null)
      const { error } = await supabase.from('schedule_events').insert({
        workspace_id: groupOwnerWorkspaceId,
        group_id: id,
        created_by: session.user.id,
        event_type: sched.event_type,
        mode: sched.mode,
        subject_name: sched.subject_name.trim() || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        location: sched.location.trim() || null,
        meeting_link: sched.meeting_link.trim() || null,
        note: sched.note.trim() || null,
        ...(needsAck ? { teacher_cross_group_overlap_ack: true } : {}),
      })
      setCrossGroupOverlapSaving(false)
      if (error) {
        if (isPostgresExclusionViolation(error)) setErr(scheduleExclusionUserMessage())
        else if (isTeacherCrossGroupOverlapViolation(error)) setErr(scheduleCrossGroupOverlapUserMessage())
        else if (isScheduleStartInPastViolation(error)) setErr(scheduleStartInPastUserMessage())
        else setErr(error.message)
        return
      }
      setCrossGroupOverlapCard(null)
      setSched({ ...emptySchedForm })
      await reload()
      return
    }

    if (!editingEventId || !editSched) return
    if (!editSched.schedule_date || !editSched.start_time || !editSched.end_time) {
      setErr('حدد اليوم ووقت البداية والنهاية')
      return
    }
    const starts = new Date(`${editSched.schedule_date}T${editSched.start_time}:00`)
    const ends = new Date(`${editSched.schedule_date}T${editSched.end_time}:00`)
    if (!(ends.getTime() > starts.getTime())) {
      setErr('وقت النهاية يجب أن يكون بعد وقت البداية في نفس اليوم')
      return
    }
    const prevEvForPast = events.find((e) => e.id === editingEventId)
    const prevFieldsForPast = prevEvForPast
      ? scheduleFieldsFromIso(prevEvForPast.starts_at, prevEvForPast.ends_at)
      : null
    const startUnchangedForPast =
      !!prevFieldsForPast &&
      prevFieldsForPast.schedule_date === editSched.schedule_date &&
      prevFieldsForPast.start_time === editSched.start_time
    if (isScheduleStartInPast(starts) && !startUnchangedForPast) {
      setErr(scheduleStartInPastUserMessage())
      setCrossGroupOverlapCard(null)
      return
    }
    const overlaps = findOverlappingScheduleEvents(events, starts, ends, editingEventId)
    const myId = session.user.id
    const selfBlocks = overlaps.filter((ev) => ev.created_by === myId)
    const otherBlock = overlaps.find((ev) => ev.created_by !== myId)
    if (selfBlocks.length > 0) {
      setErr('لديك حصة أو ندوة أخرى لهذا الفوج في هذا الوقت. اختر وقتاً لا يتعارض مع مواعيدك.')
      setCrossGroupOverlapCard(null)
      return
    }
    if (otherBlock) {
      setErr(
        `لا يمكن حجز نفس الفوج مرتين في هذا الوقت إلا بموافقة صاحب الحصة الحالية. يوجد ${otherBlock.event_type === 'seminar' ? 'ندوة' : 'حصة'} لـ ${scheduleEventCreatorLabel(otherBlock)}. غيّر الوقت أو أرسل طلب موافقة.`,
      )
      setEditScheduleConflictBlocker(otherBlock)
      setCrossGroupOverlapCard(null)
      return
    }
    const otherGroupMine = myWorkspaceScheduleMine.filter(
      (ev) => ev.group_id !== id && ev.status !== 'cancelled',
    )
    const crossOverlap = findOverlappingScheduleEvents(otherGroupMine, starts, ends, editingEventId)
    const needsAck = crossOverlap.length > 0
    setCrossGroupOverlapSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('schedule_events')
      .update({
        event_type: editSched.event_type,
        mode: editSched.mode,
        subject_name: editSched.subject_name.trim() || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        location: editSched.location.trim() || null,
        meeting_link: editSched.meeting_link.trim() || null,
        note: editSched.note.trim() || null,
        ...(needsAck ? { teacher_cross_group_overlap_ack: true } : {}),
      })
      .eq('id', editingEventId)
    setCrossGroupOverlapSaving(false)
    if (error) {
      if (isPostgresExclusionViolation(error)) setErr(scheduleExclusionUserMessage())
      else if (isTeacherCrossGroupOverlapViolation(error)) setErr(scheduleCrossGroupOverlapUserMessage())
      else if (isScheduleStartInPastViolation(error)) setErr(scheduleStartInPastUserMessage())
      else setErr(error.message)
      return
    }
    setCrossGroupOverlapCard(null)
    cancelEditSchedule()
    await reload()
  }

  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!groupOwnerWorkspaceId || !session?.user?.id || !id) return
    setCrossGroupOverlapCard(null)
    if (!sched.schedule_date || !sched.start_time || !sched.end_time) {
      setErr('حدد اليوم ووقت البداية والنهاية')
      return
    }
    const starts = new Date(`${sched.schedule_date}T${sched.start_time}:00`)
    const ends = new Date(`${sched.schedule_date}T${sched.end_time}:00`)
    if (!(ends.getTime() > starts.getTime())) {
      setErr('وقت النهاية يجب أن يكون بعد وقت البداية في نفس اليوم')
      return
    }
    if (isScheduleStartInPast(starts)) {
      setErr(scheduleStartInPastUserMessage())
      return
    }
    setScheduleConflictBlocker(null)
    setErr(null)
    const overlaps = findOverlappingScheduleEvents(events, starts, ends)
    const myId = session.user.id
    const selfBlocks = overlaps.filter((ev) => ev.created_by === myId)
    const otherBlock = overlaps.find((ev) => ev.created_by !== myId)
    if (selfBlocks.length > 0) {
      setErr('لديك حصة أو ندوة أخرى لهذا الفوج في هذا الوقت. غيّر الوقت أو عدّل الموعد القائم.')
      return
    }
    if (otherBlock) {
      setErr(
        `لا يمكن حجز نفس الفوج مرتين في هذا الوقت إلا بموافقة صاحب الحصة الحالية. يوجد ${otherBlock.event_type === 'seminar' ? 'ندوة' : 'حصة'} لـ ${scheduleEventCreatorLabel(otherBlock)}. غيّر الوقت أو اضغط «إرسال طلب موافقة» ليصل له طلبك ويقرّر.`,
      )
      setScheduleConflictBlocker(otherBlock)
      return
    }
    const otherGroupMine = myWorkspaceScheduleMine.filter(
      (ev) => ev.group_id !== id && ev.status !== 'cancelled',
    )
    const crossOverlap = findOverlappingScheduleEvents(otherGroupMine, starts, ends)
    if (crossOverlap.length > 0) {
      setSchedulePanelOpen(true)
      setCrossGroupOverlapCard({ kind: 'new', otherSessions: crossOverlap })
      setErr(null)
      requestAnimationFrame(() => {
        document.getElementById('schedule-cross-group-alert')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }
    const { error } = await supabase.from('schedule_events').insert({
      workspace_id: groupOwnerWorkspaceId,
      group_id: id,
      created_by: session.user.id,
      event_type: sched.event_type,
      mode: sched.mode,
      subject_name: sched.subject_name.trim() || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      location: sched.location.trim() || null,
      meeting_link: sched.meeting_link.trim() || null,
      note: sched.note.trim() || null,
    })
    if (error) {
      if (isPostgresExclusionViolation(error)) setErr(scheduleExclusionUserMessage())
      else if (isTeacherCrossGroupOverlapViolation(error)) setErr(scheduleCrossGroupOverlapUserMessage())
      else if (isScheduleStartInPastViolation(error)) setErr(scheduleStartInPastUserMessage())
      else setErr(error.message)
      return
    }
    setSched({ ...emptySchedForm })
    await reload()
  }

  async function submitScheduleSlotRequest(kind: 'new' | 'edit') {
    if (!groupOwnerWorkspaceId || !session?.user?.id || !id) return
    const blocker = kind === 'new' ? scheduleConflictBlocker : editScheduleConflictBlocker
    const form = kind === 'new' ? sched : editSched
    if (!blocker || !form) return
    if (!form.schedule_date || !form.start_time || !form.end_time) {
      setErr('حدد اليوم ووقت البداية والنهاية قبل إرسال الطلب')
      return
    }
    const starts = new Date(`${form.schedule_date}T${form.start_time}:00`)
    const ends = new Date(`${form.schedule_date}T${form.end_time}:00`)
    if (!(ends.getTime() > starts.getTime())) {
      setErr('وقت النهاية يجب أن يكون بعد وقت البداية في نفس اليوم')
      return
    }
    if (isScheduleStartInPast(starts)) {
      setErr(scheduleStartInPastUserMessage())
      return
    }
    setSlotRequestSending(true)
    setErr(null)
    const { data: insertedReq, error } = await supabase
      .from('schedule_slot_requests')
      .insert({
        workspace_id: groupOwnerWorkspaceId,
        group_id: id,
        requester_id: session.user.id,
        blocking_event_id: blocker.id,
        proposed_event_type: form.event_type,
        proposed_mode: form.mode,
        subject_name: form.subject_name.trim() || null,
        proposed_starts_at: starts.toISOString(),
        proposed_ends_at: ends.toISOString(),
        location: form.location.trim() || null,
        meeting_link: form.meeting_link.trim() || null,
        note: form.note.trim() || null,
      })
      .select('id')
      .maybeSingle()
    setSlotRequestSending(false)
    if (error) {
      if (error.code === '23505') {
        setErr('لديك بالفعل طلباً معلّقاً لهذه الحصة. راجع «طلبات الحصص» أو انتظر الرد.')
      } else {
        setErr(error.message)
      }
      return
    }
    let notifyFallback: string | null = null
    if (insertedReq?.id) {
      const { error: notifyErr } = await supabase.rpc('ensure_schedule_slot_request_notification', {
        p_request_id: insertedReq.id,
      })
      if (
        notifyErr &&
        !/function .* does not exist|schema cache/i.test(notifyErr.message) &&
        !/blocking_creator_id|column .* does not exist/i.test(notifyErr.message)
      ) {
        notifyFallback =
          'تم حفظ الطلب. إن لم يظهر تنبيه لزميلك، اطلب منه فتح «طلبات الحصص» أو حدّث الصفحة.'
      }
    }
    if (kind === 'new') {
      setScheduleConflictBlocker(null)
      setErr(notifyFallback ?? 'تم إرسال الطلب. ستصل إشعاراً لصاحب الحصة.')
    } else {
      setEditScheduleConflictBlocker(null)
      setErr(notifyFallback ?? 'تم إرسال الطلب. ستصل إشعاراً لصاحب الحصة.')
    }
  }

  const canManageSchedule = isGroupOwner || isLinkedStaff

  function canMutateScheduleEvent(ev: ScheduleEvent): boolean {
    const uid = session?.user?.id
    if (!uid) return false
    return isGroupOwner || ev.created_by === uid || profile?.role === 'admin'
  }

  useEffect(() => {
    if (loading || events.length === 0) return
    const raw = searchParams.get('event')
    if (!raw) return

    const exists = events.some((e) => e.id === raw)
    if (!exists) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('event')
          return n
        },
        { replace: true },
      )
      return
    }

    setHighlightEventId(raw)
    requestAnimationFrame(() => {
      document.getElementById(`schedule-event-${raw}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    window.setTimeout(() => setHighlightEventId(null), 4500)

    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('event')
        return n
      },
      { replace: true },
    )
  }, [loading, events, searchParams, setSearchParams])

  function startEditSchedule(ev: ScheduleEvent) {
    setEditScheduleConflictBlocker(null)
    const { schedule_date, start_time, end_time } = scheduleFieldsFromIso(ev.starts_at, ev.ends_at)
    setEditingEventId(ev.id)
    setEditSched({
      event_type: ev.event_type === 'seminar' ? 'seminar' : 'class',
      subject_name: ev.subject_name ?? '',
      mode: ev.mode,
      schedule_date,
      start_time,
      end_time,
      location: ev.location ?? '',
      meeting_link: ev.meeting_link ?? '',
      note: ev.note ?? '',
    })
  }

  function cancelEditSchedule() {
    setEditingEventId(null)
    setEditSched(null)
    setEditScheduleConflictBlocker(null)
    setCrossGroupOverlapCard(null)
  }

  async function saveEditSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEventId || !editSched) return
    setCrossGroupOverlapCard(null)
    if (!editSched.schedule_date || !editSched.start_time || !editSched.end_time) {
      setErr('حدد اليوم ووقت البداية والنهاية')
      return
    }
    const starts = new Date(`${editSched.schedule_date}T${editSched.start_time}:00`)
    const ends = new Date(`${editSched.schedule_date}T${editSched.end_time}:00`)
    if (!(ends.getTime() > starts.getTime())) {
      setErr('وقت النهاية يجب أن يكون بعد وقت البداية في نفس اليوم')
      return
    }
    const prevEvEdit = events.find((e) => e.id === editingEventId)
    const prevFieldsEdit = prevEvEdit ? scheduleFieldsFromIso(prevEvEdit.starts_at, prevEvEdit.ends_at) : null
    const startUnchangedEdit =
      !!prevFieldsEdit &&
      prevFieldsEdit.schedule_date === editSched.schedule_date &&
      prevFieldsEdit.start_time === editSched.start_time
    if (isScheduleStartInPast(starts) && !startUnchangedEdit) {
      setErr(scheduleStartInPastUserMessage())
      return
    }
    setEditScheduleConflictBlocker(null)
    const overlaps = findOverlappingScheduleEvents(events, starts, ends, editingEventId)
    const myId = session?.user?.id
    if (!myId) return
    const selfBlocks = overlaps.filter((ev) => ev.created_by === myId)
    const otherBlock = overlaps.find((ev) => ev.created_by !== myId)
    if (selfBlocks.length > 0) {
      setErr('لديك حصة أو ندوة أخرى لهذا الفوج في هذا الوقت. اختر وقتاً لا يتعارض مع مواعيدك.')
      return
    }
    if (otherBlock) {
      setErr(
        `لا يمكن حجز نفس الفوج مرتين في هذا الوقت إلا بموافقة صاحب الحصة الحالية. يوجد ${otherBlock.event_type === 'seminar' ? 'ندوة' : 'حصة'} لـ ${scheduleEventCreatorLabel(otherBlock)}. غيّر الوقت أو أرسل طلب موافقة.`,
      )
      setEditScheduleConflictBlocker(otherBlock)
      return
    }
    const otherGroupMine = myWorkspaceScheduleMine.filter(
      (ev) => ev.group_id !== id && ev.status !== 'cancelled',
    )
    const crossOverlap = findOverlappingScheduleEvents(otherGroupMine, starts, ends, editingEventId)
    if (crossOverlap.length > 0) {
      setSchedulePanelOpen(true)
      setCrossGroupOverlapCard({ kind: 'edit', otherSessions: crossOverlap })
      setErr(null)
      requestAnimationFrame(() => {
        document.getElementById('schedule-cross-group-alert')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }
    setScheduleEditSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('schedule_events')
      .update({
        event_type: editSched.event_type,
        mode: editSched.mode,
        subject_name: editSched.subject_name.trim() || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        location: editSched.location.trim() || null,
        meeting_link: editSched.meeting_link.trim() || null,
        note: editSched.note.trim() || null,
      })
      .eq('id', editingEventId)
    setScheduleEditSaving(false)
    if (error) {
      if (isPostgresExclusionViolation(error)) setErr(scheduleExclusionUserMessage())
      else if (isTeacherCrossGroupOverlapViolation(error)) setErr(scheduleCrossGroupOverlapUserMessage())
      else if (isScheduleStartInPastViolation(error)) setErr(scheduleStartInPastUserMessage())
      else setErr(error.message)
      return
    }
    cancelEditSchedule()
    await reload()
  }

  async function deleteScheduleEvent(evId: string) {
    if (!window.confirm('حذف هذه الحصة من الجدول؟')) return
    setErr(null)
    const { error } = await supabase.from('schedule_events').delete().eq('id', evId)
    if (error) {
      if (error.code === '42501' || /permission|policy|rls/i.test(error.message))
        setErr('لا يمكنك حذف حصة أستاذ آخر. يمكن لمالك المساحة أو مدير التطبيق حذفها إن لزم.')
      else setErr(error.message)
      return
    }
    if (editingEventId === evId) cancelEditSchedule()
    await reload()
  }

  async function promote(m: GroupMember, role: 'coordinator' | 'student') {
    if (!id) return
    setErr(null)
    const { error } = await supabase.rpc('set_group_member_role', {
      p_group_id: id,
      p_user_id: m.user_id,
      p_role: role,
    })
    if (error) setErr(error.message)
    else await reload()
  }

  function memberDisplayName(m: GroupMember) {
    const c = memberContacts[m.user_id]
    const fn = (c?.full_name ?? '').trim()
    if (fn) return fn
    const dn = (m.display_name ?? '').trim()
    if (dn) return dn
    return m.user_id
  }

  function memberPrimaryContactHref(userId: string): string | null {
    const c = memberContacts[userId]
    if (!c) return null
    const em = c.email?.trim()
    if (em) return `mailto:${em}`
    const wa = whatsappHref(c.whatsapp ?? '')
    if (wa) return wa
    const tel = c.phone?.trim()
    if (tel) return `tel:${tel.replace(/\s/g, '')}`
    return null
  }

  async function blockMember(m: GroupMember) {
    if (!id || !canManageSchedule) return
    const label = memberDisplayName(m)
    if (!window.confirm(`حجب «${label}» من هذا الفوج؟ لن يظهر في قائمة الطلبة النشطة.`)) return
    setMemberBusyId(m.id)
    setErr(null)
    const { error } = await supabase.from('group_members').update({ status: 'blocked' }).eq('id', m.id)
    setMemberBusyId(null)
    if (error) setErr(error.message)
    else await reload()
  }

  async function removeMember(m: GroupMember) {
    if (!id || !canManageSchedule) return
    const label = memberDisplayName(m)
    if (!window.confirm(`حذف «${label}» من عضوية الفوج نهائياً؟ لا يمكن التراجع من هنا.`)) return
    setMemberBusyId(m.id)
    setErr(null)
    const { error } = await supabase.from('group_members').delete().eq('id', m.id)
    setMemberBusyId(null)
    if (error) setErr(error.message)
    else await reload()
  }

  async function rotateTeacherLink() {
    if (!id || !isGroupOwner) return
    setRotatingLink(true)
    setErr(null)
    const { data, error } = await supabase.rpc('rotate_teacher_link_secret', { p_group_id: id })
    setRotatingLink(false)
    if (error) setErr(error.message)
    else if (typeof data === 'string') setTeacherLinkSecret(data)
  }

  function scheduleEventSummaryLine(ev: ScheduleEvent) {
    const kind = ev.event_type === 'seminar' ? 'ندوة' : 'حصة'
    const title = ev.subject_name ?? kind
    return `${formatAppDateTime(ev.starts_at)} → ${formatAppDateTime(ev.ends_at)} — ${title} — ${scheduleEventCreatorLabel(ev)} (${ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})${ev.location ? ` — ${ev.location}` : ''}`
  }

  async function handleArchiveGroup() {
    if (!id) return
    if (
      !window.confirm(
        'أرشفة هذا الفوج؟ سيختفي من قوائم الأفواج النشطة ولن يُعاد تنشيطه من هذه الواجهة.',
      )
    )
      return
    setArchiveBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('archive_group_by_owner', { p_group_id: id })
    setArchiveBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    const row = data as { ok?: boolean; error?: string } | null
    if (!row?.ok) {
      const code = row?.error
      const msg =
        code === 'forbidden'
          ? 'غير مصرح.'
          : code === 'not_found'
            ? 'الفوج غير موجود.'
            : code === 'not_authenticated'
              ? 'يجب تسجيل الدخول.'
              : 'تعذرت الأرشفة.'
      setErr(msg)
      return
    }
    navigate('/t/groups')
  }

  async function handleRevokeSelf() {
    if (!id) return
    if (!window.confirm('الانسحاب من هذا الفوج كأستاذ مرتبط؟ لن يبقى لك وصول بعد التأكيد.')) return
    setRevokeBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('revoke_own_group_staff', { p_group_id: id })
    setRevokeBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    const row = data as { ok?: boolean; error?: string } | null
    if (!row?.ok) {
      const code = row?.error
      const msg =
        code === 'owner_use_archive'
          ? 'مالك الفوج يستخدم «أرشفة الفوج» بدلاً من الانسحاب.'
          : code === 'not_linked'
            ? 'أنت غير مرتبط بهذا الفوج.'
            : code === 'not_authenticated'
              ? 'يجب تسجيل الدخول.'
              : 'تعذر الانسحاب.'
      setErr(msg)
      return
    }
    navigate('/t/groups')
  }

  function shareScheduleWhatsapp() {
    if (!group) return
    const lines = events
      .slice(0, 12)
      .map((ev) => {
        const kind = ev.event_type === 'seminar' ? 'ندوة' : 'حصة'
        return `${formatAppDateTime(ev.starts_at)} — ${ev.subject_name ?? kind} — ${scheduleEventCreatorLabel(ev)} (${kind}، ${ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})`
      })
    const link = joinUrlStudent || `${typeof window !== 'undefined' ? window.location.origin : ''}/s/join?code=${group.join_code}`
    const text = `جدول ${group.group_name}:\n${lines.join('\n')}\n\nرابط المنصة: ${link}`
    shareWhatsAppMessage(text)
  }

  function renderRosterRow(m: GroupMember, kind: 'coord' | 'student') {
    const c = memberContacts[m.user_id]
    const sn = c?.student_number ?? m.student_number ?? null
    const email = (c?.email ?? '').trim()
    const wa = (c?.whatsapp ?? '').trim()
    const href = memberPrimaryContactHref(m.user_id)
    const busy = memberBusyId === m.id

    return (
      <div
        key={m.id}
        className={`cohort-roster-row${kind === 'coord' ? ' cohort-roster-row--coord' : ''}`}
      >
        <div className="cohort-roster__cell cohort-roster__cell--action">
          {kind === 'coord' ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy || !canManageSchedule}
              onClick={() => void promote(m, 'student')}
            >
              إلغاء المنسق
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy || !canManageSchedule}
              onClick={() => void promote(m, 'coordinator')}
            >
              جعله منسقاً
            </button>
          )}
        </div>
        <div className="cohort-roster__cell cohort-roster__cell--name" title={memberDisplayName(m)}>
          {memberDisplayName(m)}
        </div>
        <div className="cohort-roster__cell cohort-roster__cell--num" dir="ltr">
          {sn?.trim() ? sn : '—'}
        </div>
        <div className="cohort-roster__cell cohort-roster__cell--email" dir="ltr">
          {email || '—'}
        </div>
        <div className="cohort-roster__cell cohort-roster__cell--wa" dir="ltr">
          {kind === 'coord' ? (wa || '—') : '—'}
        </div>
        <div className="cohort-roster__cell cohort-roster__cell--btn">
          {href ? (
            <a href={href} className="btn btn--small btn--secondary" rel="noreferrer">
              تواصل
            </a>
          ) : (
            <button type="button" className="btn btn--small btn--ghost" disabled>
              تواصل
            </button>
          )}
        </div>
        <div className="cohort-roster__cell cohort-roster__cell--btn">
          <button
            type="button"
            className="btn btn--small btn--ghost"
            disabled={busy || !canManageSchedule}
            onClick={() => void blockMember(m)}
          >
            حجب
          </button>
        </div>
        <div className="cohort-roster__cell cohort-roster__cell--btn">
          <button
            type="button"
            className="btn btn--small btn--ghost"
            disabled={busy || !canManageSchedule}
            onClick={() => void removeMember(m)}
          >
            حذف
          </button>
        </div>
      </div>
    )
  }

  if (loading || !group) {
    return loading ? <Loading /> : <EmptyState title="فوج غير موجود" />
  }

  return (
    <div className="page page--cohort" style={cohortPageSurfaceStyle(cohortAccentHex)}>
      <nav className="cohort-detail-nav" aria-label="تنقل الصفحة">
        <p className="breadcrumb">
          <Link to="/t">الرئيسية</Link>
          {' · '}
          <Link to="/t/groups">الأفواج</Link>
          {' / '}
          <span>{group.group_name}</span>
        </p>
      </nav>
      <ErrorBanner message={err} />

      <header className="cohort-detail-head" style={{ borderColor: cohortAccentHex }}>
        <div
          className="cohort-detail-head__accent"
          style={{ backgroundColor: cohortAccentHex }}
          aria-hidden
        />
        <div className="cohort-detail-head__body">
          <h1 className="cohort-detail-head__title">{group.group_name}</h1>
          <dl className="cohort-detail-head__meta">
            <div>
              <dt>المستوى</dt>
              <dd>{studyLevelLabelAr(group.study_level)}</dd>
            </div>
            <div>
              <dt>السنة الجامعية</dt>
              <dd>{group.academic_year?.trim() ? group.academic_year : '—'}</dd>
            </div>
            <div>
              <dt>المنسق</dt>
              <dd>{headerCoordinatorLabel}</dd>
            </div>
            <div>
              <dt>عدد الطلبة</dt>
              <dd>{studentCount}</dd>
            </div>
          </dl>
        </div>
      </header>

      {!isGroupOwner ? (
        <p className="muted small" style={{ marginBottom: '1.25rem' }}>
          أنت مرتبط بهذا الفوج كأستاذ مساعد؛ تعديل البيانات الرسمية متاح لمنشئ الفوج فقط.
        </p>
      ) : null}

      {isGroupOwner ? (
        <details className="cohort-disclosure">
          <summary className="cohort-disclosure__summary">دعوة الأساتذة</summary>
          <div className="cohort-disclosure__body">
            {teacherLinkSecret ? (
              <>
                <p className="muted small">لا يشارك مع الطلبة: انسخ الرمز لزميل يدرّس نفس الفوج.</p>
                <p className="mono wrap" dir="ltr">
                  {teacherLinkSecret}
                </p>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={rotatingLink}
                  onClick={() => void rotateTeacherLink()}
                >
                  {rotatingLink ? '…' : 'توليد رمز جديد'}
                </button>
              </>
            ) : (
              <p className="muted small">لا يتوفر رمز ربط حتى يُحمَّل من الخادم.</p>
            )}
          </div>
        </details>
      ) : null}

      <details className="cohort-disclosure">
        <summary className="cohort-disclosure__summary">دعوة الطلبة</summary>
        <div className="cohort-disclosure__body">
          <p>
            <strong>كود الانضمام القصير:</strong> {group.join_code}
          </p>
          {joinUrlStudent ? (
            <>
              <p className="muted small">رابط وQR آمن للانضمام (يُفضّل للطلبة):</p>
              <p className="muted wrap" dir="ltr">
                {joinUrlStudent}
              </p>
              {qrDataUrl ? (
                <p className="teacher-group__qr">
                  <img src={qrDataUrl} alt="QR انضمام الطلبة" width={200} height={200} />
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted wrap">
              {typeof window !== 'undefined' ? `${window.location.origin}/s/join?code=${group.join_code}` : ''}
            </p>
          )}
          <p>
            <Link to={`/t/groups/${id}/staff`} className="btn btn--secondary">
              محادثة طاقم التدريس
            </Link>
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() =>
              shareWhatsAppMessage(
                `انضم إلى فوج ${group.group_name} على Ostadi:\n${joinUrlStudent || `${typeof window !== 'undefined' ? window.location.origin : ''}/s/join?code=${group.join_code}`}\nالكود: ${group.join_code}`,
              )
            }
          >
            مشاركة واتساب
          </button>
        </div>
      </details>

      <section className="section">
        <h2>حصص اليوم</h2>
        <p className="muted small cohort-today-event__legend">
          <span className="cohort-today-event__swatch cohort-today-event--mine" aria-hidden /> حصصك (أنت منشئ الحصة)
          <span className="cohort-today-event__swatch cohort-today-event--other" aria-hidden /> حصص أساتذة آخرين
        </p>
        {scheduleBuckets.today.length === 0 ? (
          <EmptyState title="لا حصص اليوم" />
        ) : (
          <ul className="cohort-schedule-preview-list cohort-today-list">
            {scheduleBuckets.today.map((ev) => {
              const mine = Boolean(session?.user?.id && ev.created_by === session.user.id)
              return (
                <li key={ev.id}>
                  <a
                    href={`#schedule-event-${ev.id}`}
                    className={`cohort-today-event__link ${mine ? 'cohort-today-event--mine' : 'cohort-today-event--other'}`}
                  >
                    {scheduleEventSummaryLine(ev)}
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>حصص هذا الأسبوع</h2>
        <p className="muted small">بعد اليوم، ضمن الأسبوع الحالي المحلي.</p>
        {scheduleBuckets.thisWeek.length === 0 ? (
          <EmptyState title="لا حصص أخرى هذا الأسبوع" />
        ) : (
          <ul className="cohort-schedule-preview-list">
            {scheduleBuckets.thisWeek.map((ev) => (
              <li key={ev.id}>
                <a href={`#schedule-event-${ev.id}`} className="cohort-schedule-preview-list__link">
                  {scheduleEventSummaryLine(ev)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>حصص الأسبوع القادم</h2>
        {scheduleBuckets.nextWeek.length === 0 ? (
          <EmptyState title="لا حصص في الأسبوع القادم" />
        ) : (
          <ul className="cohort-schedule-preview-list">
            {scheduleBuckets.nextWeek.map((ev) => (
              <li key={ev.id}>
                <a href={`#schedule-event-${ev.id}`} className="cohort-schedule-preview-list__link">
                  {scheduleEventSummaryLine(ev)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section cohort-schedule-section">
        {crossGroupOverlapCard ? (
          <div
            id="schedule-cross-group-alert"
            className="banner banner--error student-home__warn"
            style={{ marginBottom: '1rem' }}
            role="alert"
          >
            <strong>تداخل: حصتان لك في نفس الوقت (فوجان مختلفان)</strong>
            <p className="small" style={{ marginTop: '0.5rem' }}>
              القاعدة لا تقبل الحفظ دون موافقة صريحة منك — بنفس فكرة «طلب موافقة» لنفس الفوج. راجع الحصص الأخرى
              المسجّلة باسمك أدناه، ثم إمّا تؤكّد أو تغيّر التاريخ/الوقت.
            </p>
            <ul className="small" style={{ margin: '0.75rem 0', paddingInlineStart: '1.25rem' }}>
              {crossGroupOverlapCard.otherSessions.map((ev) => (
                <li key={ev.id}>
                  <span className="input--ltr">
                    {formatAppTime(ev.starts_at, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {' — '}
                  <strong>
                    {(ev.subject_name ?? '').trim() || (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}
                  </strong>
                  {' — '}
                  <span className="muted">
                    {ev.mode === 'online' ? 'عن بُعد' : 'حضوري'} (فوج آخر)
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!canManageSchedule || crossGroupOverlapSaving}
                onClick={() => void confirmCrossGroupOverlap()}
              >
                {crossGroupOverlapSaving ? 'جاري التثبيت…' : 'موافقة وتثبيت'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={crossGroupOverlapSaving}
                onClick={rejectCrossGroupOverlap}
              >
                رفض — سأغيّر البيانات
              </button>
            </div>
          </div>
        ) : null}
        <details
          id="group-schedule"
          className="cohort-disclosure cohort-disclosure--schedule"
          open={schedulePanelOpen}
          onToggle={(e) => setSchedulePanelOpen(e.currentTarget.open)}
        >
          <summary className="cohort-disclosure__summary cohort-disclosure__summary--primary">
            إضافة حصة
          </summary>
          <div className="cohort-disclosure__body">
            <form className="form form--grid form--schedule-slot" onSubmit={submitSchedule}>
          <label>
            نوع الحدث
            <select
              value={sched.event_type}
              disabled={!canManageSchedule}
              onChange={(e) =>
                setSched({
                  ...sched,
                  event_type: e.target.value === 'seminar' ? 'seminar' : 'class',
                })
              }
            >
              <option value="class">حصة</option>
              <option value="seminar">ندوة</option>
            </select>
          </label>
          <label>
            المادة / عنوان الندوة
            <input
              value={sched.subject_name}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, subject_name: e.target.value })}
            />
          </label>
          <label>
            النمط
            <select
              value={sched.mode}
              disabled={!canManageSchedule}
              onChange={(e) =>
                setSched({
                  ...sched,
                  mode: e.target.value === 'online' ? 'online' : 'on_site',
                })
              }
            >
              <option value="on_site">حضوري</option>
              <option value="online">عن بُعد</option>
            </select>
          </label>
          <label className="span-2">
            اليوم
            <input
              type="date"
              className="input--ltr"
              value={sched.schedule_date}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, schedule_date: e.target.value })}
            />
          </label>
          <label>
            وقت البداية
            <input
              id="schedule-new-start"
              type="text"
              className="input--ltr"
              inputMode="numeric"
              autoComplete="off"
              placeholder="مثال: 21:30"
              title="24 ساعة: 00:00 — 23:59"
              value={sched.start_time}
              disabled={!canManageSchedule}
              onChange={(e) => setSched((s) => applyStartHhmm(e.target.value, s))}
              onBlur={() =>
                setSched((s) => {
                  const st = commitHhmmText(s.start_time)
                  const p = parseClock(st)
                  return {
                    ...s,
                    start_time: st,
                    end_time: p ? nextEndAfterStartChange(s.start_time, s.end_time, st) : s.end_time,
                  }
                })
              }
            />
          </label>
          <label>
            وقت النهاية
            <input
              type="text"
              className="input--ltr"
              inputMode="numeric"
              autoComplete="off"
              placeholder="مثال: 23:30"
              title="24 ساعة: 00:00 — 23:59"
              value={sched.end_time}
              disabled={!canManageSchedule}
              onChange={(e) => setSched((s) => ({ ...s, end_time: formatHhmmDigitsInput(e.target.value) }))}
              onBlur={() => setSched((s) => ({ ...s, end_time: commitHhmmText(s.end_time) }))}
            />
          </label>
          <label>
            قاعة
            <input
              value={sched.location}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, location: e.target.value })}
            />
          </label>
          <label>
            رابط الاجتماع
            <input
              value={sched.meeting_link}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, meeting_link: e.target.value })}
            />
          </label>
          <label className="span-2">
            ملاحظة
            <input
              value={sched.note}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, note: e.target.value })}
            />
          </label>
          <button
            type="submit"
            className="btn btn--primary schedule-add-submit"
            disabled={!canManageSchedule}
          >
            {sched.event_type === 'seminar' ? 'إضافة ندوة' : 'إضافة حصة'}
          </button>
        </form>
        {scheduleConflictBlocker ? (
          <div className="schedule-slot-request-banner muted small" style={{ marginTop: '0.75rem' }}>
            <p>
              النظام لا يقبل حجز نفس الفوج مرتين في هذا الوقت إلا بموافقة صاحب الحصة الحالية. أرسل طلباً إلى{' '}
              <strong>{scheduleEventCreatorLabel(scheduleConflictBlocker)}</strong>: عند موافقته تُلغى حصته وتُثبَّت
              حصتك بهذه البيانات.
            </p>
            <div className="schedule-slot-request-banner__actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={slotRequestSending || !canManageSchedule}
                onClick={() => void submitScheduleSlotRequest('new')}
              >
                {slotRequestSending ? 'جاري الإرسال…' : 'إرسال طلب موافقة'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setScheduleConflictBlocker(null)}>
                تجاهل
              </button>
              <Link to="/t/schedule-requests" className="btn btn--ghost">
                طلبات الحصص
              </Link>
            </div>
          </div>
        ) : null}
            <button type="button" className="btn btn--secondary" onClick={shareScheduleWhatsapp}>
              مشاركة الجدول بواتساب
            </button>
          </div>
        </details>
        <h2 className="cohort-schedule-section__list-title">الجدول — كل الحصص</h2>
        {events.length === 0 ? (
          <EmptyState title="لا أحداث في الجدول" />
        ) : (
          <ul className="schedule-list">
            {events.map((ev) => (
              <li
                key={ev.id}
                id={`schedule-event-${ev.id}`}
                className={`schedule-list__item${highlightEventId === ev.id ? ' schedule-list__item--focused' : ''}`}
              >
                <div>
                  {ev.event_type === 'seminar' ? (
                    <span className="pill pill--seminar">ندوة</span>
                  ) : (
                    <span className="pill">حصة</span>
                  )}{' '}
                  <strong>{ev.subject_name ?? (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}</strong> —{' '}
                  {scheduleEventCreatorLabel(ev)} —{' '}
                  {formatAppDateTime(ev.starts_at)} →{' '}
                  {formatAppDateTime(ev.ends_at)} ({ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})
                  {ev.location ? <span className="muted"> — {ev.location}</span> : null}
                </div>
                {canManageSchedule && canMutateScheduleEvent(ev) ? (
                  <div className="schedule-list__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() =>
                        editingEventId === ev.id ? cancelEditSchedule() : startEditSchedule(ev)
                      }
                    >
                      {editingEventId === ev.id ? 'إلغاء التعديل' : 'تعديل / إعادة جدولة'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => void deleteScheduleEvent(ev.id)}
                    >
                      حذف
                    </button>
                  </div>
                ) : null}
                {editingEventId === ev.id && editSched ? (
                  <form className="form form--grid schedule-list__edit-form" onSubmit={saveEditSchedule}>
                    <label>
                      نوع الحدث
                      <select
                        value={editSched.event_type}
                        disabled={scheduleEditSaving}
                        onChange={(e) =>
                          setEditSched({
                            ...editSched,
                            event_type: e.target.value === 'seminar' ? 'seminar' : 'class',
                          })
                        }
                      >
                        <option value="class">حصة</option>
                        <option value="seminar">ندوة</option>
                      </select>
                    </label>
                    <label>
                      المادة / عنوان الندوة
                      <input
                        value={editSched.subject_name}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, subject_name: e.target.value })}
                      />
                    </label>
                    <label>
                      النمط
                      <select
                        value={editSched.mode}
                        disabled={scheduleEditSaving}
                        onChange={(e) =>
                          setEditSched({
                            ...editSched,
                            mode: e.target.value === 'online' ? 'online' : 'on_site',
                          })
                        }
                      >
                        <option value="on_site">حضوري</option>
                        <option value="online">عن بُعد</option>
                      </select>
                    </label>
                    <label className="span-2">
                      اليوم
                      <input
                        type="date"
                        className="input--ltr"
                        value={editSched.schedule_date}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, schedule_date: e.target.value })}
                      />
                    </label>
                    <label>
                      وقت البداية
                      <input
                        id="schedule-edit-start"
                        type="text"
                        className="input--ltr"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="مثال: 21:30"
                        title="24 ساعة: 00:00 — 23:59"
                        value={editSched.start_time}
                        disabled={scheduleEditSaving}
                        onChange={(e) =>
                          setEditSched((s) => (s ? applyStartHhmm(e.target.value, s) : s))
                        }
                        onBlur={() =>
                          setEditSched((s) => {
                            if (!s) return s
                            const st = commitHhmmText(s.start_time)
                            const p = parseClock(st)
                            return {
                              ...s,
                              start_time: st,
                              end_time: p ? nextEndAfterStartChange(s.start_time, s.end_time, st) : s.end_time,
                            }
                          })
                        }
                      />
                    </label>
                    <label>
                      وقت النهاية
                      <input
                        type="text"
                        className="input--ltr"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="مثال: 23:30"
                        title="24 ساعة: 00:00 — 23:59"
                        value={editSched.end_time}
                        disabled={scheduleEditSaving}
                        onChange={(e) =>
                          setEditSched((s) => (s ? { ...s, end_time: formatHhmmDigitsInput(e.target.value) } : s))
                        }
                        onBlur={() =>
                          setEditSched((s) => (s ? { ...s, end_time: commitHhmmText(s.end_time) } : s))
                        }
                      />
                    </label>
                    <label>
                      قاعة
                      <input
                        value={editSched.location}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, location: e.target.value })}
                      />
                    </label>
                    <label>
                      رابط الاجتماع
                      <input
                        value={editSched.meeting_link}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, meeting_link: e.target.value })}
                      />
                    </label>
                    <label className="span-2">
                      ملاحظة
                      <input
                        value={editSched.note}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, note: e.target.value })}
                      />
                    </label>
                    <button type="submit" className="btn btn--primary" disabled={scheduleEditSaving}>
                      {scheduleEditSaving ? 'جاري الحفظ…' : 'حفظ التعديلات'}
                    </button>
                    {editScheduleConflictBlocker ? (
                      <div className="schedule-slot-request-banner muted small" style={{ marginTop: '0.75rem' }}>
                        <p>
                          لا يُقبل تعديلك إلى هذا الوقت إلا بموافقة صاحب الحصة الحالية. أرسل طلباً إلى{' '}
                          <strong>{scheduleEventCreatorLabel(editScheduleConflictBlocker)}</strong> لأخذ الفترة
                          بالبيانات أعلاه.
                        </p>
                        <div
                          className="schedule-slot-request-banner__actions"
                          style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}
                        >
                          <button
                            type="button"
                            className="btn btn--secondary"
                            disabled={slotRequestSending}
                            onClick={() => void submitScheduleSlotRequest('edit')}
                          >
                            {slotRequestSending ? 'جاري الإرسال…' : 'إرسال طلب موافقة'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setEditScheduleConflictBlocker(null)}
                          >
                            تجاهل
                          </button>
                          <Link to="/t/schedule-requests" className="btn btn--ghost">
                            طلبات الحصص
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>الطلبة والمنسّق</h2>
        <p className="muted small">
          صف واحد لكل عضو؛ صف المنسّق في الأعلى بلون مميّز. التواصل يفتح البريد أو واتساب أو الهاتف حسب التوفر.
        </p>
        {coordinatorMembers.length === 0 && studentMembers.length === 0 ? (
          <EmptyState title="لا طلبة بعد" />
        ) : (
          <div className="cohort-roster-wrap">
            <div className="cohort-roster-header cohort-roster-row" aria-hidden>
              <div className="cohort-roster__cell cohort-roster__cell--action">إجراء الدور</div>
              <div className="cohort-roster__cell cohort-roster__cell--name">الاسم الكامل</div>
              <div className="cohort-roster__cell cohort-roster__cell--num">الرقم الجامعي</div>
              <div className="cohort-roster__cell cohort-roster__cell--email">البريد</div>
              <div className="cohort-roster__cell cohort-roster__cell--wa">واتساب</div>
              <div className="cohort-roster__cell cohort-roster__cell--btn">تواصل</div>
              <div className="cohort-roster__cell cohort-roster__cell--btn">حجب</div>
              <div className="cohort-roster__cell cohort-roster__cell--btn">حذف</div>
            </div>
            {coordinatorMembers.map((m) => renderRosterRow(m, 'coord'))}
            {studentMembers.map((m) => renderRosterRow(m, 'student'))}
          </div>
        )}
      </section>

      {isLinkedStaff && !isGroupOwner ? (
        <section className="section cohort-danger-zone">
          <h2>انسحاب من الفوج</h2>
          <p className="muted small">
            أنت مرتبط بهذا الفوج كأستاذ مساعد. يمكنك إلغاء الربط دون حذف الفوج.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={revokeBusy}
            onClick={() => void handleRevokeSelf()}
          >
            {revokeBusy ? 'جاري المعالجة…' : 'الانسحاب من هذا الفوج'}
          </button>
        </section>
      ) : null}

      {isGroupOwner ? (
        <section className="section cohort-danger-zone cohort-danger-zone--archive">
          <h2>أرشفة الفوج</h2>
          <p className="muted small">
            الفوج المؤرشف لا يظهر في قوائم الأفواج النشطة. لا يمكن التراجع من هذه الصفحة.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={archiveBusy}
            onClick={() => void handleArchiveGroup()}
          >
            {archiveBusy ? 'جاري الأرشفة…' : 'أرشفة هذا الفوج'}
          </button>
        </section>
      ) : null}

      <details className="cohort-extra-content">
        <summary>محتوى إضافي (بيانات رسمية، حائط، مواد)</summary>

        {isGroupOwner ? (
          <section className="section">
            <h2>بيانات الفوج الرسمية</h2>
            <p className="muted small">
              المستوى والرمز الرسمي (مثل الرمز الذي يعطيه منسق الفوج) يربط المحتوى والجدول بهذا الفوج دون
              الخلط مع أفواج أخرى.
            </p>
            <form className="form form--grid" onSubmit={saveGroupMeta}>
              <label className="teacher-groups__color-field">
                لون الفوج (الصفحة، الرسائل، والقوائم المرتبطة بهذا الفوج)
                <input
                  type="color"
                  value={metaForm.accent_color}
                  onChange={(e) => setMetaForm({ ...metaForm, accent_color: e.target.value })}
                  aria-label="لون تمييز الفوج"
                />
              </label>
              <label>
                المستوى الدراسي
                <select
                  value={metaForm.study_level}
                  onChange={(e) => setMetaForm({ ...metaForm, study_level: e.target.value as StudyLevel })}
                >
                  <option value="licence">إجازة</option>
                  <option value="master">ماستر</option>
                  <option value="doctorate">دكتوراه</option>
                </select>
              </label>
              <label>
                التوقيت
                <select
                  value={metaForm.schedule_mode}
                  onChange={(e) =>
                    setMetaForm({ ...metaForm, schedule_mode: e.target.value as GroupScheduleMode })
                  }
                >
                  <option value="normal">توقيت عادي</option>
                  <option value="simplified">توقيت ميسر</option>
                </select>
              </label>
              <label>
                المسار
                <select
                  value={metaForm.study_track}
                  onChange={(e) => setMetaForm({ ...metaForm, study_track: e.target.value as GroupStudyTrack })}
                >
                  <option value="normal">مسار عادي</option>
                  <option value="excellence">مسار التميّز</option>
                </select>
              </label>
              <label>
                السنة الدراسية
                <input
                  value={metaForm.academic_year}
                  onChange={(e) => setMetaForm({ ...metaForm, academic_year: e.target.value })}
                />
              </label>
              <label>
                لاحقة الرمز (اختياري)
                <input
                  value={metaForm.cohort_suffix}
                  onChange={(e) => setMetaForm({ ...metaForm, cohort_suffix: e.target.value })}
                />
              </label>
              <label>
                تسلسل (اختياري)
                <input
                  value={metaForm.cohort_sequence}
                  onChange={(e) => setMetaForm({ ...metaForm, cohort_sequence: e.target.value })}
                  inputMode="numeric"
                />
              </label>
              <label className="teacher-groups__code-field">
                الرمز الرسمي
                <div className="teacher-groups__code-row">
                  <input
                    value={metaForm.cohort_official_code}
                    onChange={(e) => setMetaForm({ ...metaForm, cohort_official_code: e.target.value })}
                    dir="ltr"
                    className="input--ltr"
                  />
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={metaSuggesting}
                    onClick={() => void suggestMetaOfficialCode()}
                  >
                    {metaSuggesting ? '…' : 'اقتراح'}
                  </button>
                </div>
              </label>
              <button type="submit" className="btn btn--primary" disabled={metaSaving}>
                {metaSaving ? 'جاري الحفظ…' : 'حفظ بيانات الفوج'}
              </button>
            </form>
          </section>
        ) : null}

        <section id="teacher-group-wall" className="section">
          <h2>نشر على الحائط</h2>
          <form className="form" onSubmit={submitPost}>
            <label>
              النطاق
              <select
                value={postForm.scope}
                onChange={(e) =>
                  setPostForm({
                    ...postForm,
                    scope: e.target.value === 'workspace' ? 'workspace' : 'group',
                  })
                }
              >
                <option value="group">هذا الفوج فقط</option>
                <option value="workspace">كل أفواج المساحة</option>
              </select>
            </label>
            <label>
              العنوان (اختياري)
              <input
                value={postForm.title}
                onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
              />
            </label>
            <label>
              المحتوى
              <textarea
                rows={4}
                value={postForm.content}
                onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                required
              />
            </label>
            <button type="submit" className="btn btn--primary">
              نشر
            </button>
          </form>
          <h3>آخر المنشورات</h3>
          {posts.length === 0 ? (
            <EmptyState title="لا منشورات بعد" />
          ) : (
            <ul className="post-list">
              {posts.map((p) => (
                <li key={p.id} className="post-card">
                  {p.pinned ? <span className="pill">مثبت</span> : null}
                  <span className="pill">{p.scope === 'workspace' ? 'عام' : 'الفوج'}</span>
                  {p.title ? <h4>{p.title}</h4> : null}
                  <p>{p.content}</p>
                  <time className="muted">{formatAppDateTime(p.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <h2>المواد والملفات</h2>
          <form className="form" onSubmit={uploadMaterial}>
            <label>
              عنوان الملف
              <input value={matTitle} onChange={(e) => setMatTitle(e.target.value)} />
            </label>
            <label>
              ملف
              <input type="file" onChange={(e) => setMatFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="submit" className="btn btn--primary">
              رفع
            </button>
          </form>
          {materials.length === 0 ? (
            <EmptyState title="لا ملفات بعد" />
          ) : (
            <ul>
              {materials.map((m) => (
                <li key={m.id}>
                  {m.title} {m.file_path ? <span className="muted">(مخزن)</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </details>

      <p className="cohort-detail-footer-nav">
        <Link to="/t" className="btn btn--ghost">
          العودة إلى الرئيسية
        </Link>
      </p>
    </div>
  )
}
