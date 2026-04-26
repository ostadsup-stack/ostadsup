import { useCallback, useEffect, useState } from 'react'
import {
  loadAdminUniversitiesDashboard,
  type UniversityDashboardCard,
} from '../lib/adminUniversitiesDashboard'

export function useAdminUniversitiesDashboard(userId: string | undefined) {
  const [cards, setCards] = useState<UniversityDashboardCard[]>([])
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
    const { cards: next, error: err } = await loadAdminUniversitiesDashboard()
    setCards(next)
    setError(err)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { cards, loading, error, reload }
}
