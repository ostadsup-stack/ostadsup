-- جامعات (مؤسسات) + كليات تابعة + تعريف الكلية (description).

-- ---------------------------------------------------------------------------
-- universities
-- ---------------------------------------------------------------------------
create table if not exists public.universities (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  description text,
  created_at timestamptz not null default now (),
  constraint universities_name_nonempty_ck check (length(trim(name)) > 0)
);

create index if not exists universities_name_idx on public.universities (name);

comment on table public.universities is 'جامعة أو مؤسسة — تحتوي كليات.';

alter table public.universities enable row level security;

drop policy if exists universities_all_admin on public.universities;

create policy universities_all_admin on public.universities for all using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));

-- ---------------------------------------------------------------------------
-- colleges: تعريف + ارتباط بالجامعة
-- ---------------------------------------------------------------------------
alter table public.colleges
add column if not exists description text;

comment on column public.colleges.description is 'تعريف أو وصف الكلية.';

alter table public.colleges
add column if not exists university_id uuid references public.universities (id) on delete restrict;

-- جامعة افتراضية لربط كليات قديمة بلا جامعة
insert into public.universities (name, description)
select 'جامعة افتراضية', 'أُنشئت لربط كليات كانت موجودة قبل هجرة الجامعات.'
where
  not exists (select 1 from public.universities limit 1);

update public.colleges
set
  university_id = (
    select
      u.id
    from
      public.universities u
    order by
      u.created_at asc
    limit
      1
  )
where
  university_id is null;

alter table public.colleges
alter column university_id
set not null;

create index if not exists colleges_university_id_idx on public.colleges (university_id);

comment on column public.colleges.university_id is 'الجامعة التي تتبع لها الكلية.';
