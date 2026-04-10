import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loading } from './components/Loading'
import { ErrorBanner } from './components/ErrorBanner'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomeRedirect } from './pages/HomeRedirect'
import { TeacherLayout } from './pages/teacher/TeacherLayout'
import { TeacherDashboard } from './pages/teacher/TeacherDashboard'
import { TeacherGroups } from './pages/teacher/TeacherGroups'
import { TeacherGroupDetail } from './pages/teacher/TeacherGroupDetail'
import { TeacherGroupStaffPage } from './pages/teacher/TeacherGroupStaffPage'
import { TeacherInbox } from './pages/teacher/TeacherInbox'
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
import { StudentAccountPage } from './pages/student/StudentAccountPage'
import { PublicTeacherSite } from './pages/public/PublicTeacherSite'

/** عند وجود جلسة دون profile: إظهار الخطأ أو الاستمرار بالتحميل (مثل HomeRedirect) */
function ProfileMissingView() {
  const { error, signOut } = useAuth()
  return (
    <div className="main main--narrow" style={{ margin: '2rem auto' }}>
      {error ? (
        <>
          <ErrorBanner message={error} />
          <p className="muted">
            إن استمرت المشكلة بعد تنفيذ SQL للدالة ensure_my_profile، جرّب تسجيل الخروج والدخول مجدداً.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => void signOut()}>
            تسجيل الخروج
          </button>
        </>
      ) : (
        <Loading label="جاري تحميل الملف الشخصي…" />
      )}
    </div>
  )
}

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
  if (profile.role === 'teacher' || profile.role === 'admin') {
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
      <Route path="/p/:slug" element={<PublicTeacherSite />} />

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
        <Route path="books" element={<TeacherBooksPage />} />
        <Route path="posts" element={<TeacherPostsPage />} />
        <Route path="groups" element={<TeacherGroups />} />
        <Route path="groups/:id/staff" element={<TeacherGroupStaffPage />} />
        <Route path="groups/:id" element={<TeacherGroupDetail />} />
        <Route path="inbox" element={<TeacherInbox />} />
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
