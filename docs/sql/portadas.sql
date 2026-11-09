-- Pestaña "Portadas" del panel. Ejecutar UNA vez en el SQL Editor de Supabase (ANTES de desplegar el panel).
-- Es idempotente: se puede volver a lanzar sin problema.
--
-- Guarda cuándo se dio por buena la portada de cada libro desde el panel.
-- NULL = portada sin revisar. Los libros que dan de alta los usuarios con ISBN, título, autor y portada se
-- verifican solos (trigger auto_verify_ol_books) y no pasan por Verificación: esta columna permite revisarlos aparte.

alter table public.books add column if not exists cover_confirmed_at timestamptz;

comment on column public.books.cover_confirmed_at is 'Cuándo se dio por buena la portada en el panel de administración (pestaña Portadas). NULL = portada sin revisar.';

create index if not exists books_cover_unconfirmed_idx on public.books (id desc) where cover_confirmed_at is null;
