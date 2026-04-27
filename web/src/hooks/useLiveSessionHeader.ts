import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchWorkspaceForTeacher } from '../lib/workspace'
import { fetchActiveStudentMemberships, filterStudentRoleRows } from '../lib/studentGroup'
import {
  computeLiveSessionIndicator,
  enrichScheduleEventRowsForHeader,
  fetchLiveSessionEventsForStudent,
  fetchLiveSessionEventsForTeacher,
  type LiveSessionIndicator,
} from '../lib/liveSessionHeader'
import { liveSessionPublicPagePath, resolveLiveSessionHeaderTarget } from '../lib/publicLiveLinks'
import { getServerNowMs } from '../lib/serverClock'

export type LiveSessionHeaderState = {
  sessionMode: 'online' | 'on_site'
  sessionSummary: string | null
  indicator: LiveSessionIndicator
  /** مسار صفحة Ostadi العامة أو الجدول */
  livePath: string
  /** وجهة النقرة: رابط الاجتماع أو Jitsi أو الصفحة العامة أو جدول/فوج */
  href: string
  external: boolean
  /** الحصة المرتبطة بالمؤشر (لتسجيل بدء البث من الأستاذ) */
  scheduleEventId: string
} | null

const POLL_MS = 30_000

async function loadTeacherState(client: SupabaseClient, userId: string, nowMs: number): Promise<LiveSessionHeaderState> {
  const { workspace, error } = await fetchWorkspaceForTeacher(userId)
  if (error || !workspace?.id) return null
  const rows = await fetchLiveSessionEventsForTeacher(client, workspace.id as string, userId)
  const enriched = await enrichScheduleEventRowsForHeader(client, rows)
  const computed = computeLiveSessionIndicator(nowMs, enriched)
  if (!computed) return null
  const onlineFallbackHref = `/t/groups/${computed.groupId}#group-schedule`
  const onSiteHref = onlineFallbackHref
  const livePath = computed.liveSlug ? liveSessionPublicPagePath(computed.liveSlug) : onlineFallbackHref
  let href: string
  let external: boolean
  if (computed.status === 'upcoming') {
    href = onlineFallbackHref
    external = false
  } else if (computed.status === 'ended' || computed.sessionMode === 'on_site') {
    href = onSiteHref
    external = false
  } else {
    const r = resolveLiveSessionHeaderTarget({
      liveSlug: computed.liveSlug,
      meetingLink: computed.meetingLink,
      indicatorKind: computed.indicator.kind,
      internalFallbackHref: onlineFallbackHref,
    })
    href = r.href
    external = r.external
  }
  return {
    sessionMode: computed.sessionMode,
    sessionSummary: computed.sessionSummary,
    indicator: computed.indicator,
    livePath,
    href,
    external,
    scheduleEventId: computed.scheduleEventId,
  }
}

async function loadStudentState(client: SupabaseClient, userId: string, nowMs: number): Promise<LiveSessionHeaderState> {
  const { rows } = await fetchActiveStudentMemberships(client, userId)
  const students = filterStudentRoleRows(rows)
  const coords = rows.filter((r) => r.role_in_group === 'coordinator')
  const groupIds = [
    ...new Set(
      [...students, ...coords, ...rows].map((r) => r.group_id as string).filter((id): id is string => Boolean(id)),
    ),
  ]
  if (groupIds.length === 0) return null
  const evRows = await fetchLiveSessionEventsForStudent(client, groupIds)
  const enriched = await enrichScheduleEventRowsForHeader(client, evRows)
  const computed = computeLiveSessionIndicator(nowMs, enriched)
  if (!computed) return null
  const studentScheduleHref = '/s/schedule'
  const livePath = computed.liveSlug ? liveSessionPublicPagePath(computed.liveSlug) : studentScheduleHref
  let href: string
  let external: boolean
  if (computed.status === 'upcoming') {
    href = studentScheduleHref
    external = false
  } else if (computed.status === 'ended' || computed.sessionMode === 'on_site') {
    href = studentScheduleHref
    external = false
  } else {
    const r = resolveLiveSessionHeaderTarget({
      liveSlug: computed.liveSlug,
      meetingLink: computed.meetingLink,
      indicatorKind: computed.indicator.kind,
      internalFallbackHref: studentScheduleHref,
    })
    href = r.href
    external = r.external
  }
  return {
    sessionMode: computed.sessionMode,
    sessionSummary: computed.sessionSummary,
    indicator: computed.indicator,
    livePath,
    href,
    external,
    scheduleEventId: computed.scheduleEventId,
  }
}

/**
 * الحصة الجارية في الرأس (عن بعد أو حضوري): تحديث دوري من جدول الحصص.
 * يُعاد `reload` لاستدعائه بعد تسجيل بدء البث من الأستاذ (حصص عن بعد).
 */
export function useLiveSessionHeader(role: 'teacher' | 'student' | 'admin' | undefined, userId: string | undefined) {
  const [state, setState] = useState<LiveSessionHeaderState>(null)

  const reload = useCallback(async () => {
    if (!userId || (role !== 'teacher' && role !== 'student')) {
      setState(null)
      return
    }
    try {
      const nowMs = await getServerNowMs(supabase)
      const next =
        role === 'teacher'
          ? await loadTeacherState(supabase, userId, nowMs)
          : await loadStudentState(supabase, userId, nowMs)
      setState(next)
    } catch (err) {
      console.warn('useLiveSessionHeader reload failed', err)
      setState(null)
    }
  }, [role, userId])

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), POLL_MS)
    function onVis() {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  return { state, reload }
}
