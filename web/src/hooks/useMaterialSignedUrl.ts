import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** رابط موقّع لملف في bucket materials (يعمل للزائر إن وُجدت سياسة القراءة). */
export function useMaterialSignedUrl(path: string | null | undefined, ttlSec = 3600) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const p = path?.trim()
    if (!p) {
      setUrl(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const { data, error } = await supabase.storage.from('materials').createSignedUrl(p, ttlSec)
      if (cancelled) return
      setLoading(false)
      if (error || !data?.signedUrl) {
        setUrl(null)
        return
      }
      setUrl(data.signedUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [path, ttlSec])

  return { url, loading }
}
