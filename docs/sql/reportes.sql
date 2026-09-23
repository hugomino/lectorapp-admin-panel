-- Pestaña "Reportes" del panel. Ejecutar UNA vez en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a lanzar sin problema.

-- 1. Urgencia manual (null = usar la sugerencia automática del panel).
alter table public.content_reports  add column if not exists urgency text;
alter table public.feedback_reports add column if not exists urgency text;

alter table public.content_reports  drop constraint if exists content_reports_urgency_check;
alter table public.feedback_reports drop constraint if exists feedback_reports_urgency_check;
alter table public.content_reports  add constraint content_reports_urgency_check
  check (urgency is null or urgency in ('green','yellow','orange','red','black'));
alter table public.feedback_reports add constraint feedback_reports_urgency_check
  check (urgency is null or urgency in ('green','yellow','orange','red','black'));

-- 2. feedback_reports no tenía estado de revisión.
alter table public.feedback_reports add column if not exists status text not null default 'pending';
alter table public.feedback_reports add column if not exists reviewed_at timestamptz;

-- 3. Estados permitidos: pending / reviewed / dismissed. Se eliminan los CHECK
--    previos que mencionen `status` (no conocemos su nombre) y se recrea uno.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.content_reports'::regclass, 'public.feedback_reports'::regclass)
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.content_reports  add constraint content_reports_status_check
  check (status in ('pending','reviewed','dismissed'));
alter table public.feedback_reports add constraint feedback_reports_status_check
  check (status in ('pending','reviewed','dismissed'));
