-- =============================================================================
-- ربط pgcrypto + gen_random_bytes (للصق في Supabase SQL Editor)
-- =============================================================================
-- يصلح: function gen_random_bytes(integer) does not exist
-- حتى لو كان الامتداد مفعّلاً، الدالة تبقى في المخطط extensions وليست في public،
-- ودوال SECURITY DEFINER التي تضبط search_path = public لا تراها.
--
-- نفّذ هذا الملف مرة واحدة (أو قبل apply_afwaaj_sql_editor.sql إن لم يكن مدمجاً هناك).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.gen_random_bytes (len int)
returns bytea
language sql
immutable
parallel safe
security invoker
set search_path = public, extensions
as $$
  select extensions.gen_random_bytes (len);
$$;

comment on function public.gen_random_bytes (int) is
  'Ostadi: يفوّض إلى extensions.gen_random_bytes عند search_path = public';
