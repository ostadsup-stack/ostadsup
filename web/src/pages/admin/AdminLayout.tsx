import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchAdminChatUnreadPeerIds } from '../../lib/adminAdminChatRead'
import { AdminSidebar } from '../../components/admin-shell/AdminSidebar'
import { AdminTopbar } from '../../components/admin-shell/AdminTopbar'

export type AdminLayoutOutletContext = {
  adminUnreadFromPeer: Set<string>
  refreshAdminUnread: () => Promise<void>
}

/**
 * إطار إدارة SaaS: شريط جانبي يمين ثابت + Topbar + محتوى، RTL، ألوان هادئة ودعم الوضع الداكن.
 */
export function AdminLayout() {
  const { profile, signOut, session } = useAuth()
  const location = useLocation()
  const [unreadNotif, setUnreadNotif] = useState<number | null>(null)
  const [adminUnreadFromPeer, setAdminUnreadFromPeer] = useState<Set<string>>(() => new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const refreshAdminUnread = useCallback(async () => {
    const { ids, error } = await fetchAdminChatUnreadPeerIds()
    if (error) setAdminUnreadFromPeer(new Set())
    else setAdminUnreadFromPeer(ids)
  }, [])

  const displayName = profile?.full_name?.trim() || 'Admin'

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    let ok = true
    const uid = session?.user?.id
    if (!uid) {
      setUnreadNotif(null)
      return
    }
    ;(async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('is_read', false)
      if (!ok) return
      if (error) setUnreadNotif(null)
      else setUnreadNotif(count ?? 0)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) {
      setAdminUnreadFromPeer(new Set())
      return
    }
    void refreshAdminUnread()
    const t = window.setInterval(() => void refreshAdminUnread(), 30_000)
    return () => window.clearInterval(t)
  }, [session?.user?.id, refreshAdminUnread])

  const combinedTopbarBadge = (unreadNotif ?? 0) + adminUnreadFromPeer.size

  return (
    <div
      className="min-h-dvh bg-[#F8FAFC] text-slate-900 dark:bg-[#0B1220] dark:text-slate-100"
      dir="rtl"
    >
      <AdminSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        displayName={displayName}
        onSignOut={() => void signOut()}
      />
      <div className="flex min-h-dvh flex-col lg:pr-64">
        <AdminTopbar
          displayName={displayName}
          sidebarOpen={sidebarOpen}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          unreadNotif={combinedTopbarBadge > 0 ? combinedTopbarBadge : null}
        />
        <main className="flex-1 overflow-auto p-6 md:p-8">
          <Outlet context={{ adminUnreadFromPeer, refreshAdminUnread } as AdminLayoutOutletContext} />
        </main>
      </div>
    </div>
  )
}
