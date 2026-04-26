import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAdminRecentActivity, type AdminActivityItem } from '../lib/adminRecentActivity'

export function useAdminRecentActivity() {
  const [items, setItems] = useState<AdminActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { items: list, error: err } = await fetchAdminRecentActivity(supabase)
    setItems(list)
    setError(err)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, loading, error, reload }
}
