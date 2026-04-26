import { useCallback, useEffect, useState } from 'react'
import {
  loadAdminCollegesDashboard,
  type CollegeDashboardCard,
} from '../lib/adminCollegesDashboard'

export function useAdminCollegesDashboard(userId: string | undefined) {
  const [cards, setCards] = useState<CollegeDashboardCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) {
      setCards([])
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    const { cards: next, error: err } = await loadAdminCollegesDashboard()
    setCards(next)
    setError(err)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { cards, loading, error, reload }
}
