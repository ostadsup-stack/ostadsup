/** عنصر في الملف الأكاديمي للصفحة العامة (يُخزَّن في profiles.academic_profile JSONB). */
export type AcademicDegree = { title: string; institution?: string | null; year?: string | null }
export type AcademicTextBlock = { label: string; body: string }

export type AcademicProfile = {
  rankTitle?: string | null
  institution?: string | null
  degrees?: AcademicDegree[]
  training?: AcademicTextBlock[]
  teachingExperience?: AcademicTextBlock[]
  researchInterests?: string[]
  languages?: string[]
}

/** إعدادات الصفحة العامة (workspaces.public_site_settings JSONB). */
export type PublicSiteSettings = {
  /** عنوان مخصّص للشريط العلوي للزائر؛ إن وُجد يُستخدم بدل القالب الافتراضي مع الاسم. */
  page_header_title?: string | null
  section_order?: string[]
  sections_visible?: Partial<
    Record<'hero' | 'academic' | 'posts' | 'library' | 'schedule' | 'cohorts' | 'contact' | 'footer', boolean>
  >
  contact_visible?: Partial<Record<'phone' | 'whatsapp' | 'email' | 'social' | 'office_hours', boolean>>
}

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
  /** JSON — يُحرَّر من «الصفحة الرسمية» */
  academic_profile?: AcademicProfile | null
  public_contact_email?: string | null
  status: string
  created_at: string
}

export type Workspace = {
  id: string
  owner_teacher_id: string
  display_name: string
  slug: string
  status: string
  public_site_settings?: PublicSiteSettings | null
}

export type StudyLevel = 'licence' | 'master' | 'doctorate'

/** توقيت الحصص: عادي أو ميسر */
export type GroupScheduleMode = 'normal' | 'simplified'

/** المسار الدراسي: عادي أو تميّز */
export type GroupStudyTrack = 'normal' | 'excellence'

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
  show_on_public_site?: boolean
  schedule_mode?: GroupScheduleMode
  study_track?: GroupStudyTrack
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
  /** أول منسق نشط في الفوج (هجرة coordinator_name) */
  coordinator_name?: string | null
  schedule_mode: GroupScheduleMode
  study_track: GroupStudyTrack
}

export type GroupMember = {
  id: string
  group_id: string
  user_id: string
  role_in_group: 'teacher' | 'coordinator' | 'student'
  display_name: string | null
  student_number: string | null
  joined_at: string
  status?: string
}

export type Post = {
  id: string
  workspace_id: string
  author_id: string
  group_id: string | null
  scope: 'group' | 'workspace'
  title: string | null
  content: string
  post_type: string
  pinned: boolean
  created_at: string
  deleted_at?: string | null
  /** مخفي عن الطلاب والزائر؛ يظهر لصاحب المنشور فقط */
  hidden_at?: string | null
  attachment_url?: string | null
  updated_at?: string
  /** منشور مستوى المساحة يظهر في الصفحة العامة عند true */
  is_public_on_site?: boolean
  /** عند false لا يُعرض المنشور لأعضاء المساحة/الفوج (يبقى للمؤلف والمدير) */
  is_published?: boolean
}

export type Material = {
  id: string
  workspace_id?: string
  created_by?: string
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
  description?: string | null
  cover_path?: string | null
  file_path?: string | null
  publication_year?: number | null
}

export type PublicPostRow = {
  id: string
  title: string | null
  content: string
  created_at: string
  updated_at?: string
  pinned: boolean
  post_type?: string | null
  attachment_url?: string | null
}

export type PublicGroupTeaserRow = {
  id: string
  group_name: string
  subject_name: string | null
  academic_year: string | null
  study_level: string
  university: string | null
  faculty: string | null
  schedule_mode?: GroupScheduleMode
  study_track?: GroupStudyTrack
}

export type PublicScheduleTeaserRow = {
  id: string
  starts_at: string
  ends_at: string
  subject_name: string | null
  event_type: string
  mode: string
  group_label: string
}

/** صف واحد من RPC public_teacher_by_workspace_slug */
export type PublicTeacherPageRow = {
  workspace_display_name: string
  workspace_slug: string
  full_name: string
  specialty: string | null
  bio: string | null
  avatar_url: string | null
  phone: string | null
  whatsapp: string | null
  office_hours: string | null
  social_links: Record<string, string> | null
  cv_path: string | null
  academic_profile: unknown
  public_contact_email: string | null
  public_site_settings: unknown
}

export type ScheduleEvent = {
  id: string
  group_id: string
  created_at?: string
  /** منشئ الحصة (للعرض وصلاحيات التعديل) */
  created_by: string
  event_type: string
  mode: 'on_site' | 'online'
  subject_name: string | null
  starts_at: string
  ends_at: string
  location: string | null
  meeting_link: string | null
  note: string | null
  status?: string
  /** موافقة صريحة عند تداخل حصص لنفس الأستاذ بين فوجين (عمود قاعدة البيانات) */
  teacher_cross_group_overlap_ack?: boolean
  /** إظهار في معاينة الجدول على الصفحة العامة */
  show_on_public_site?: boolean
  /** يُملأ عند select مع join على profiles */
  profiles?: { full_name: string | null } | null
}

export type ScheduleSlotRequestRow = {
  id: string
  workspace_id: string
  group_id: string
  requester_id: string
  /** يُملأ من الهجرة schedule_slot_request_blocking_creator_notifications */
  blocking_creator_id?: string | null
  blocking_event_id: string
  proposed_event_type: string
  proposed_mode: 'on_site' | 'online'
  subject_name: string | null
  proposed_starts_at: string
  proposed_ends_at: string
  location: string | null
  meeting_link: string | null
  note: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  resolution_event_id: string | null
  created_at: string
  resolved_at: string | null
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
  target_id: string | null
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
