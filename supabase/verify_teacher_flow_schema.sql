-- =============================================================================
-- Ostadi — تحقق سريع من مخطط «أستاذ فارغ + ربط فوج» (SQL Editor)
-- =============================================================================
-- نفّذ الاستعلامات؛ يجب أن تكون القيم true عند اكتمال الإعداد.
-- =============================================================================

select
  exists (
    select 1
    from information_schema.tables
    where
      table_schema = 'public'
      and table_name = 'group_staff'
  ) as group_staff_table_ok,
  exists (
    select 1
    from information_schema.tables
    where
      table_schema = 'public'
      and table_name = 'group_invite_tokens'
  ) as group_invite_tokens_table_ok,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where
      n.nspname = 'public'
      and p.proname = 'redeem_teacher_group_link'
  ) as redeem_teacher_group_link_ok,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where
      n.nspname = 'public'
      and p.proname = 'teacher_group_list_summaries'
  ) as teacher_group_list_summaries_ok;

select
  exists (
    select 1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'bio'
  ) as profiles_bio_ok,
  exists (
    select 1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'social_links'
  ) as profiles_social_links_ok;
