import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loading } from './components/Loading'
import { ProfileMissingView } from './components/auth/ProfileMissingView'
import { RequireAdminRoute } from './features/admin-access'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomeRedirect } from './pages/HomeRedirect'
import { TeacherLayout } from './pages/teacher/TeacherLayout'
import { TeacherDashboard } from './pages/teacher/TeacherDashboard'
import { TeacherGroups } from './pages/teacher/TeacherGroups'
import { TeacherGroupDetail } from './pages/teacher/TeacherGroupDetail'
import { TeacherGroupStaffPage } from './pages/teacher/TeacherGroupStaffPage'
import { TeacherInbox } from './pages/teacher/TeacherInbox'
import { TeacherAdminChatPage } from './pages/teacher/TeacherAdminChatPage'
import { TeacherConversation } from './pages/teacher/TeacherConversation'
import { TeacherNotifications } from './pages/teacher/TeacherNotifications'
import { TeacherSchedulePage } from './pages/teacher/TeacherSchedulePage'
import { TeacherScheduleRequestsPage } from './pages/teacher/TeacherScheduleRequestsPage'
import { TeacherAccountPage } from './pages/teacher/TeacherAccountPage'
import { TeacherBooksPage } from './pages/teacher/TeacherBooksPage'
import { TeacherPostsPage } from './pages/teacher/TeacherPostsPage'
import { TeacherSettingsPage } from './pages/teacher/TeacherSettingsPage'
import { TeacherAchievementsPage } from './pages/teacher/TeacherAchievementsPage'
import { TeacherSeminarsPage } from './pages/teacher/TeacherSeminarsPage'
import { StudentLayout } from './pages/student/StudentLayout'
import { StudentHome } from './pages/student/StudentHome'
import { JoinGroupPage } from './pages/student/JoinGroupPage'
import { StudentGroupPage } from './pages/student/StudentGroupPage'
import { StudentMessages } from './pages/student/StudentMessages'
import { StudentThread } from './pages/student/StudentThread'
import { StudentNotifications } from './pages/student/StudentNotifications'
import { StudentPostsPage } from './pages/student/StudentPostsPage'
import { StudentMaterialsPage } from './pages/student/StudentMaterialsPage'
import { StudentSchedulePage } from './pages/student/StudentSchedulePage'
import { StudentAccountPage } from './pages/student/StudentAccountPage'
import { PublicTeacherSite } from './pages/public/PublicTeacherSite'
import { PublicTeacherLivePage } from './pages/public/PublicTeacherLivePage'
import { PublicTeacherPostPage } from './pages/public/PublicTeacherPostPage'
import { TeacherPublicSitePage } from './pages/teacher/TeacherPublicSitePage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminGroupsPage } from './pages/admin/AdminGroupsPage'
import { AdminInvitationsPage } from './pages/admin/AdminInvitationsPage'
import { AdminPostsPage } from './pages/admin/AdminPostsPage'
import { AdminMessagesPage } from './pages/admin/AdminMessagesPage'
import { AdminContentPage } from './pages/admin/AdminContentPage'
import { AdminTeachersPage } from './pages/admin/AdminTeachersPage'
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage'
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage'
import { AdminCollegeDetailPage } from './pages/admin/AdminCollegeDetailPage'
import { AdminUniversityDetailPage } from './pages/admin/AdminUniversityDetailPage'

function RequireTeacher({ children }: { children: React.ReactNode }) {
  const { profile, loading, session } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <ProfileMissingView />
  if (profile.role !== 'teacher' && profile.role !== 'admin') {
    return <Navigate to="/s" replace />
  }
  return <>{children}</>
}

function RequireStudent({ children }: { children: React.ReactNode }) {
  const { profile, loading, session } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <ProfileMissingView />
  if (profile.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />
  }
  if (profile.role === 'teacher') {
    return <Navigate to="/t" replace />
  }
  return <>{children}</>
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout layout--public">
      <header className="header header--simple">
        <a href="/" className="header__brand">
          Ostadi
        </a>
      </header>
      <main className="main main--narrow main--public">{children}</main>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicLayout><LoginPage /></PublicLayout>} />
      <Route path="/register" element={<PublicLayout><RegisterPage /></PublicLayout>} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/a" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/a/cohorts" element={<Navigate to="/admin/groups" replace />} />
      <Route path="/a/invitations" element={<Navigate to="/admin/invitations" replace />} />
      <Route path="/a/posts" element={<Navigate to="/admin/posts" replace />} />
      <Route path="/a/messages" element={<Navigate to="/admin/messages" replace />} />
      <Route
        path="/admin"
        element={
          <RequireAdminRoute>
            <AdminLayout />
          </RequireAdminRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="universities/:id" element={<AdminUniversityDetailPage />} />
        <Route path="colleges/:id" element={<AdminCollegeDetailPage />} />
        <Route path="teachers" element={<AdminTeachersPage />} />
        <Route path="groups" element={<AdminGroupsPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="content" element={<AdminContentPage />} />
        <Route path="invitations" element={<AdminInvitationsPage />} />
        <Route path="posts" element={<AdminPostsPage />} />
        <Route path="messages" element={<AdminMessagesPage />} />
        <Route path="notifications" element={<TeacherNotifications />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="/p/:slug/live" element={<PublicTeacherLivePage />} />
      <Route path="/p/:slug" element={<PublicTeacherSite />} />
      <Route path="/p/:slug/posts/:postId" element={<PublicTeacherPostPage />} />

      <Route
        path="/t"
        element={
          <RequireTeacher>
            <TeacherLayout />
          </RequireTeacher>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="account" element={<TeacherAccountPage />} />
        <Route path="public-site" element={<TeacherPublicSitePage />} />
        <Route path="books" element={<TeacherBooksPage />} />
        <Route path="posts" element={<TeacherPostsPage />} />
        <Route path="groups" element={<TeacherGroups />} />
        <Route path="groups/:id/staff" element={<TeacherGroupStaffPage />} />
        <Route path="groups/:id" element={<TeacherGroupDetail />} />
        <Route path="inbox" element={<TeacherInbox />} />
        <Route path="inbox/admin" element={<TeacherAdminChatPage />} />
        <Route path="inbox/:id" element={<TeacherConversation />} />
        <Route path="notifications" element={<TeacherNotifications />} />
        <Route path="schedule" element={<TeacherSchedulePage />} />
        <Route path="schedule-requests" element={<TeacherScheduleRequestsPage />} />
        <Route path="settings" element={<TeacherSettingsPage />} />
        <Route path="achievements" element={<TeacherAchievementsPage />} />
        <Route path="seminars" element={<TeacherSeminarsPage />} />
      </Route>

      <Route
        path="/s"
        element={
          <RequireStudent>
            <StudentLayout />
          </RequireStudent>
        }
      >
        <Route index element={<StudentHome />} />
        <Route path="join" element={<JoinGroupPage />} />
        <Route path="groups/:id" element={<StudentGroupPage />} />
        <Route path="messages" element={<StudentMessages />} />
        <Route path="messages/:id" element={<StudentThread />} />
        <Route path="notifications" element={<StudentNotifications />} />
        <Route path="posts" element={<StudentPostsPage />} />
        <Route path="schedule" element={<StudentSchedulePage />} />
        <Route path="materials" element={<StudentMaterialsPage />} />
        <Route path="account" element={<StudentAccountPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
