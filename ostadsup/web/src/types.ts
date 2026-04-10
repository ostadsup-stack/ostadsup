export type Profile = {
  id: string
  full_name: string
  role: 'teacher' | 'student' | 'admin'
  avatar_url: string | null
  phone?: string | null
  whatsapp?: string | null
  bio?: string | null
  office_hours?: string | null
  specialty?: string | null
  social_links?: Record<string, string> | null
  cv_path?: string | null
  status: string
  created_at: string
}

export type Workspace = {
  id: string
  owner_teacher_id: string
  display_name: string
  slug: string
  status: string
}

export type StudyLevel = 'licence' | 'master' | 'doctorate'

export type Group = {
  id: string
  workspace_id: string
  group_name: string
  academic_year: string | null
  university: string | null
  faculty: string | null
  subject_name: string | null
  join_code: string
  whatsapp_link: string | null
  /** لون تمييز الفوج (#RRGGBB) */
  accent_color?: string | null
  /** يُملأ بعد هجرة cohort؛ الواجهة تفترض licence إن غاب */
  study_level?: StudyLevel
  cohort_official_code?: string | null
  cohort_sequence?: number | null
  cohort_suffix?: string | null
  status: string
}

/** صف من RPC teacher_group_list_summaries */
export type TeacherGroupSummaryRow = {
  group_id: string
  group_name: string
  study_level: StudyLevel
  cohort_official_code: string | null
  academic_year: string | null
  student_count: number
  unread_count: number
  unread_coordinator_count: number
  today_event_subject: string | null
  today_event_starts_at: string | null
  today_event_ends_at: string | null
  today_event_mode: string | null
  join_code: string
  /** يُرجع من RPC بعد هجرة multi-teacher */
  is_owner?: boolean
  accent_color: string | null
}

export type GroupMember = {
  id: string
  group_id: string
  user_id: string
  role_in_group: 'teacher' | 'coordinator' | 'student'
  display_name: string | null
  student_number: string | null
  joined_at: string
}

export type Post = {
  id: string
  workspace_id: string
  group_id: string | null
  scope: 'group' | 'workspace'
  title: string | null
  content: string
  post_type: string
  pinned: boolean
  created_at: string
  deleted_at?: string | null
}

export type Material = {
  id: string
  workspace_id?: string
  group_id: string | null
  title: string
  material_type: string
  file_path: string | null
  cover_path?: string | null
  description: string | null
  external_url?: string | null
  link_kind?: 'seminar' | 'video' | 'link' | null
  /** group = مرتبط بفوج؛ workspace_public = للعموم (كل المستخدمين + الصفحة العامة) */
  audience_scope?: 'group' | 'workspace_public'
  created_at: string
}

export type PublicMaterialRow = {
  id: string
  title: string
  material_type: string
  link_kind: string | null
  external_url: string | null
  group_name: string
}

export type PublicPostRow = {
  id: string
  title: string | null
  content: string
  created_at: string
  pinned: boolean
}

export type ScheduleEvent = {
  id: string
  group_id: string
  event_type: string
  mode: 'on_site' | 'online'
  subject_name: string | null
  starts_at: string
  ends_at: string
  location: string | null
  meeting_link: string | null
  note: string | null
  status?: string
}

export type Conversation = {
  id: string
  workspace_id: string
  group_id: string
  conversation_type: string
  subject: string | null
  created_by: string
  status: string
  created_at: string
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  message_kind: string
  body: string
  created_at: string
}

export type NotificationRow = {
  id: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  target_type: string
}

export type TeacherAchievement = {
  id: string
  teacher_id: string
  title: string
  year: number | null
  details: string | null
  url: string | null
  sort_order: number
  created_at: string
}
