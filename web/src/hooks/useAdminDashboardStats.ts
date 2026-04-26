import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAdminDashboardCounts, type AdminDashboardCounts } from '../lib/adminDashboardStats'

export function useAdminDashboardStats() {
  const [counts, setCounts] = useState<AdminDashboardCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { counts: next, error: err } = await fetchAdminDashboardCounts(supabase)
    setCounts(next)
    setError(err)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { counts, loading, error, reload }
}
