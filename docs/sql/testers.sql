-- Pestaña "Testers" del panel. Ejecutar UNA vez en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a lanzar sin problema.
-- (Ya está aplicado en el proyecto de LectorApp; se deja aquí como referencia.)
--
-- La tabla public.beta_testers_android la rellena el formulario de lectorapp.es (solo puede AÑADIR filas).
-- Flujo: nueva solicitud -> aprobada (is_tester_added) -> avisada por correo (welcome_email_sent).

alter table public.beta_testers_android add column if not exists approved_at timestamptz;
alter table public.beta_testers_android add column if not exists invited_at timestamptz;

comment on column public.beta_testers_android.is_tester_added is 'true = ya añadido a la lista de testers de Play Console (aprobado en el panel)';
comment on column public.beta_testers_android.welcome_email_sent is 'true = ya recibió el correo con el enlace de descarga';
comment on column public.beta_testers_android.approved_at is 'cuándo se aprobó en el panel';
comment on column public.beta_testers_android.invited_at is 'cuándo se le envió el correo';

create index if not exists beta_testers_android_pending_idx
  on public.beta_testers_android (created_at desc) where not is_tester_added;

-- El envío del correo lo hace la Edge Function `send-tester-invites` (RESEND_API_KEY en sus secretos),
-- que solo acepta llamadas con la clave de servicio, es decir, desde este panel.
