-- طالب واحد نشط فقط: لا صفين active+student لمستخدم في فوجين.
-- يسدّ فجوة الإضافة اليدوية/الواجهات بخلاف join_group_by_*

-- إن وُجدت بيانات قديمة متعارضة: نُبقي أقدم انضماماً (joined_at) ونُسجّل الباقي كمغادَر
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by
        joined_at asc nulls last,
        id asc
    ) as rn
  from public.group_members
  where
    status = 'active'
    and role_in_group = 'student'
)
update public.group_members gm
set status = 'left'
from ranked r
where
  gm.id = r.id
  and r.rn > 1;

create unique index if not exists group_members_one_active_student_per_user_uidx
  on public.group_members (user_id)
  where
    status = 'active'
    and role_in_group = 'student';

comment on index public.group_members_one_active_student_per_user_uidx is
  'يمنع تسجيل نفس المستخدم كطالب نشط في أكثر من فوج (يغلق الثغرات خارج دوال join_group).';
