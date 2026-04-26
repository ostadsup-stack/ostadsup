/** بيانات تجريبية لواجهة الـ Dashboard (جدول + نظرة نشاط) */

export type MockSignup = { id: string; name: string; role: string; at: string }
export type MockCohort = { id: string; name: string; code: string; at: string }
export type MockTableRow = { id: string; name: string; count: number; status: 'نشط' | 'معلّق' }

export const MOCK_RECENT_SIGNUPS: MockSignup[] = [
  { id: '1', name: 'ليلى المنصوري', role: 'طالبة', at: 'منذ ساعتين' },
  { id: '2', name: 'عمر حداد', role: 'أستاذ', at: 'منذ 5 ساعات' },
  { id: '3', name: 'سارة بنعلي', role: 'طالبة', at: 'أمس' },
]

export const MOCK_RECENT_COHORTS: MockCohort[] = [
  { id: '1', name: 'جبر خطي — خريف', code: 'MTH-204-A', at: 'اليوم' },
  { id: '2', name: 'مختبر فيزياء', code: 'PHY-112-L', at: 'منذ يومين' },
  { id: '3', name: 'مدخل إلى البرمجة', code: 'CS-101-B', at: 'منذ 3 أيام' },
]

export const MOCK_OVERVIEW_TABLE: MockTableRow[] = [
  { id: '1', name: 'فوج الجبر الخطي', count: 32, status: 'نشط' },
  { id: '2', name: 'مختبر فيزياء عامة', count: 18, status: 'نشط' },
  { id: '3', name: 'أساسيات البرمجة', count: 45, status: 'معلّق' },
]
