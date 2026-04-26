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

export type LiveSessionHeaderState = {
  indicator: LiveSessionIndicator
  /** مسار الصفحة العامة للحصة عن بعد */
  livePath: string
} | null

const POLL_MS = 60_000

async function loadTeacherState(client: SupabaseClient, userId: string): Promise<LiveSessionHeaderState> {
  const { workspace, error } = await fetchWorkspaceForTeacher(userId)
  if (error || !workspace?.id) return null
  const rows = await fetchLiveSessionEventsForTeacher(client, workspace.id as string, userId)
  const computed = computeLiveSessionIndicator(Date.now(), rows)
  if (!computed) return null
  return {
    indicator: computed.indicator,
    livePath: `/p/${encodeURIComponent(computed.liveSlug)}/live`,
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
  return {
    indicator: computed.indicator,
    livePath: `/p/${encodeURIComponent(computed.liveSlug)}/live`,
  }
}

/**
 * حالة حصة عن بعد للرأس: يحدّث دورياً من جدول الحصص (حصص أونلاين فقط).
 */
export function useLiveSessionHeader(role: 'teacher' | 'student' | 'admin' | undefined, userId: string | undefined) {
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

  return state
}
