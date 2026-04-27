import type { SupabaseClient } from '@supabase/supabase-js'

let serverClockRpcUnavailable = false

function normalizeServerNow(raw: unknown): number | null {
  if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
    const ms = new Date(raw).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>
    const candidate = rec.now ?? rec.server_now ?? rec.current_time
    if (typeof candidate === 'string' || typeof candidate === 'number' || candidate instanceof Date) {
      const ms = new Date(candidate).getTime()
      return Number.isFinite(ms) ? ms : null
    }
  }
  return null
}

/**
 * Prefer DB/server time to avoid client clock drift.
 * Falls back to local time when RPC is unavailable.
 */
export async function getServerNowMs(client: SupabaseClient): Promise<number> {
  if (serverClockRpcUnavailable) return Date.now()

  const { data, error } = await client.rpc('app_server_now')
  if (error) {
    // 42883: undefined function (Postgres); avoid retrying every poll.
    if (error.code === '42883') serverClockRpcUnavailable = true
    return Date.now()
  }

  const direct = normalizeServerNow(data)
  if (direct != null) return direct
  if (Array.isArray(data) && data.length > 0) {
    const fromRow = normalizeServerNow(data[0])
    if (fromRow != null) return fromRow
  }

  return Date.now()
}
