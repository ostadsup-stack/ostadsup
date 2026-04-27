import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchWorkspaceForTeacher } from '../lib/workspace'
import { fetchActiveStudentMemberships, filterStudentRoleRows } from '../lib/studentGroup'
import {
  computeLiveSessionIndicator,
  fetchLiveSessionEventsForStudent,
  fetchLiveSessionEventsForTeacher,
  type LiveSessionIndicator,
} from '../lib/liveSessionHeader'
import { liveSessionPublicPagePath } from '../lib/publicLiveLinks'
import { resolveOnlineJoinForLiveHeader } from '../lib/scheduleMeetingJoin'

export type LiveSessionHeaderState = {
  indicator: LiveSessionIndicator
  /** مسار صفحة Ostadi العامة */
  livePath: string
  href: string
  external: boolean
  /** للأستاذ فقط عند حصة جارية أو قريبة: لإيقاف إظهار البث للطلاب */
  activeEventId: string | null
} | null

const POLL_MS = 60_000

async function loadTeacherState(client: SupabaseClient, userId: string): Promise<LiveSessionHeaderState> {
  const { workspace, error } = await fetchWorkspaceForTeacher(userId)
  if (error || !workspace?.id) return null
  const rows = await fetchLiveSessionEventsForTeacher(client, workspace.id as string, userId)
  const computed = computeLiveSessionIndicator(Date.now(), rows)
  if (!computed) return null
  const livePath = liveSessionPublicPagePath(computed.liveSlug)
  const { href, external } = resolveOnlineJoinForLiveHeader({
    liveSlug: computed.liveSlug,
    indicatorKind: computed.indicator.kind,
    meetingProvider: computed.meetingProvider,
    onlineJoinEnabled: computed.onlineJoinEnabled,
    meetingLink: computed.meetingLink,
  })
  const activeEventId =
    computed.indicator.kind === 'green' || computed.indicator.kind === 'orange' ? computed.eventId : null
  return {
    indicator: computed.indicator,
    livePath,
    href,
    external,
    activeEventId,
  }
}

async function loadStudentState(client: SupabaseClient, userId: string): Promise<LiveSessionHeaderState> {
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
  const computed = computeLiveSessionIndicator(Date.now(), evRows)
  if (!computed) return null
  const livePath = liveSessionPublicPagePath(computed.liveSlug)
  const { href, external } = resolveOnlineJoinForLiveHeader({
    liveSlug: computed.liveSlug,
    indicatorKind: computed.indicator.kind,
    meetingProvider: computed.meetingProvider,
    onlineJoinEnabled: computed.onlineJoinEnabled,
    meetingLink: computed.meetingLink,
  })
  return {
    indicator: computed.indicator,
    livePath,
    href,
    external,
    activeEventId: null,
  }
}

export type UseLiveSessionHeaderResult = {
  state: LiveSessionHeaderState
  reload: () => Promise<void>
}

/**
 * حالة حصة عن بعد للرأس: يحدّث دورياً من جدول الحصص (حصص أونلاين فقط).
 */
export function useLiveSessionHeader(
  role: 'teacher' | 'student' | 'admin' | undefined,
  userId: string | undefined,
): UseLiveSessionHeaderResult {
  const [state, setState] = useState<LiveSessionHeaderState>(null)

  const reload = useCallback(async () => {
    if (!userId || (role !== 'teacher' && role !== 'student')) {
      setState(null)
      return
    }
    try {
      const next =
        role === 'teacher' ? await loadTeacherState(supabase, userId) : await loadStudentState(supabase, userId)
      setState(next)
    } catch {
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
