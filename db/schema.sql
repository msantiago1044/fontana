-- ============================================================
-- FONTANA — Esquema de base de datos v2 (Supabase / PostgreSQL)
-- Rediseñado para OPERACIÓN MANUAL: tú trabajas los prompts y
-- respuestas a mano, registras cada correo enviado, y marcas el
-- cierre del seguimiento de 30 días tú mismo, en dos pasos.
-- ============================================================
-- Cómo usar: si ya corriste una versión anterior de este schema,
-- revisa primero la sección "MIGRACIÓN" al final del archivo.
-- Si es la primera vez, copia y pega TODO este archivo en el SQL
-- Editor de Supabase (Project > SQL Editor > New query) y ejecútalo.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- TABLA: profiles
-- Una fila por persona autenticada (login con Google).
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  auth_provider text default 'google',
  signup_ip text,
  device_fingerprint text,
  has_active_wish boolean default false,
  created_at timestamptz default now()
);

comment on table public.profiles is 'Una fila por usuario autenticado. has_active_wish bloquea un segundo deseo activo.';

-- ------------------------------------------------------------
-- TABLA: wishes
-- El deseo formulado por cada persona, y los controles manuales
-- de seguimiento que TÚ operas desde Supabase (Table Editor o SQL).
-- ------------------------------------------------------------
create type wish_status as enum (
  'pending_payment',   -- creado, esperando confirmación de pago
  'active',            -- pagado, en seguimiento manual de 30 días
  'completed',         -- ya enviaste el correo final y cerraste el deseo
  'refunded',          -- reembolsado dentro de la ventana de 48h
  'rejected'           -- contenido rechazado por moderación
);

create table if not exists public.wishes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  wish_text text not null,
  contact_email text not null,
  status wish_status default 'pending_payment',
  amount_usd numeric(10,2) not null default 1.00,
  donor_alias text,                    -- apodo público para el ranking de donadores
  stripe_payment_intent_id text,

  -- ---- datos opcionales del formulario "ayúdanos a conocerte mejor" ----
  identity_name text,
  identity_age int,
  identity_context text,

  -- ---- control del seguimiento de 30 días (TODO MANUAL) ----
  cycle_started_at timestamptz,        -- se llena cuando confirmas el pago
  cycle_due_at timestamptz,            -- informativo: cycle_started_at + 30 días, calculado solo
  final_email_sent_manual boolean default false,   -- PASO 1: marca cuando ya enviaste el correo final
  final_email_sent_at timestamptz,                 -- fecha real en que lo enviaste
  followup_finished_manual boolean default false,  -- PASO 2: marca cuando ya diste por cerrado el deseo
  followup_finished_at timestamptz,
  closing_notes text,                  -- tu propia nota sobre cómo quedó el deseo al cerrar

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Un usuario solo puede tener UN deseo que no esté reembolsado/rechazado.
create unique index if not exists one_active_wish_per_user
  on public.wishes(user_id)
  where status in ('pending_payment','active','completed');

comment on table public.wishes is 'Un deseo por usuario activo. El cierre a 30 días es 100% manual: primero marcas final_email_sent_manual, luego followup_finished_manual.';
comment on column public.wishes.final_email_sent_manual is 'PASO 1 del cierre: márcalo en true SOLO después de haber enviado tú mismo el correo final al usuario.';
comment on column public.wishes.followup_finished_manual is 'PASO 2 del cierre: márcalo en true cuando consideres el deseo totalmente cerrado. No lo marques si final_email_sent_manual sigue en false (hay un trigger que te lo va a impedir).';

-- Calcula cycle_due_at automáticamente cuando se llena cycle_started_at
create or replace function public.set_cycle_due_at()
returns trigger as $$
begin
  if new.cycle_started_at is not null then
    new.cycle_due_at := new.cycle_started_at + interval '30 days';
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_cycle_due_at on public.wishes;
create trigger trg_set_cycle_due_at
before insert or update on public.wishes
for each row execute function public.set_cycle_due_at();

-- Guardrail: no puedes marcar followup_finished_manual=true si
-- todavía no enviaste el correo final. Esto evita que cierres por
-- error un deseo sin haber avisado al usuario.
create or replace function public.guard_followup_finished()
returns trigger as $$
begin
  if new.followup_finished_manual = true and new.final_email_sent_manual = false then
    raise exception 'No puedes marcar followup_finished_manual=true sin haber marcado primero final_email_sent_manual=true (es decir: sin haber enviado el correo final).';
  end if;
  if new.followup_finished_manual = true and old.followup_finished_manual = false then
    new.followup_finished_at := now();
    new.status := 'completed';
  end if;
  if new.final_email_sent_manual = true and old.final_email_sent_manual = false then
    new.final_email_sent_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_guard_followup_finished on public.wishes;
create trigger trg_guard_followup_finished
before update on public.wishes
for each row execute function public.guard_followup_finished();

-- Mantiene profiles.has_active_wish sincronizado: true mientras el
-- usuario tenga un deseo en pending_payment/active/completed. Esto es
-- lo que el frontend consulta para decidir si mostrar el formulario
-- de nuevo deseo o el mensaje de "ya tienes un deseo activo".
create or replace function public.sync_has_active_wish()
returns trigger as $$
begin
  update public.profiles
  set has_active_wish = exists (
    select 1 from public.wishes
    where user_id = coalesce(new.user_id, old.user_id)
    and status in ('pending_payment','active','completed')
  )
  where id = coalesce(new.user_id, old.user_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_has_active_wish on public.wishes;
create trigger trg_sync_has_active_wish
after insert or update or delete on public.wishes
for each row execute function public.sync_has_active_wish();

-- ------------------------------------------------------------
-- TABLA: ai_thread
-- El hilo COMPLETO y ORDENADO de prompts y respuestas para cada
-- deseo, como una conversación. turn_number se autoincrementa por
-- deseo (1, 2, 3...) para que siempre puedas ver el orden exacto.
-- Tú lo llenas a mano cada vez que trabajas un prompt con tu IA.
-- ------------------------------------------------------------
create table if not exists public.ai_thread (
  id uuid primary key default uuid_generate_v4(),
  wish_id uuid not null references public.wishes(id) on delete cascade,
  turn_number int not null,
  prompt_text text not null,
  response_text text,
  -- opcional: para qué fue este turno (tu propia nota de contexto)
  purpose text,                        -- ej: "primer paso", "seguimiento semana 2", "investigación inicial"
  created_at timestamptz default now(),
  unique (wish_id, turn_number)
);

comment on table public.ai_thread is 'Hilo completo de prompts/respuestas por deseo, en orden. turn_number es correlativo dentro de cada wish_id.';

-- Función que calcula automáticamente el siguiente turn_number,
-- así nunca tienes que contarlo a mano ni puedes chocar con otro.
create or replace function public.next_turn_number(p_wish_id uuid)
returns int as $$
  select coalesce(max(turn_number), 0) + 1 from public.ai_thread where wish_id = p_wish_id;
$$ language sql stable;

-- Ejemplo de uso al insertar (lo puedes copiar tal cual cuando registres un turno):
--   insert into public.ai_thread (wish_id, turn_number, prompt_text, response_text, purpose)
--   values (
--     '00000000-0000-0000-0000-000000000000',
--     public.next_turn_number('00000000-0000-0000-0000-000000000000'),
--     'aquí tu prompt...',
--     'aquí la respuesta de la IA...',
--     'primer paso'
--   );

-- ------------------------------------------------------------
-- TABLA: email_log
-- Cada correo real que enviaste al usuario (manualmente).
-- ------------------------------------------------------------
create type email_type as enum (
  'step_one',       -- correo inmediato tras el pago
  'identity_form',  -- correo con el formulario de "conocerte mejor"
  'followup',       -- cualquier correo de seguimiento durante los 30 días (sin número fijo)
  'final'           -- correo de cierre
);

create table if not exists public.email_log (
  id uuid primary key default uuid_generate_v4(),
  wish_id uuid not null references public.wishes(id) on delete cascade,
  type email_type not null,
  subject text,
  body_sent text,                      -- el cuerpo real que enviaste (no solo preview, ya que es manual)
  sent_at timestamptz default now(),
  related_thread_turn int              -- opcional: a qué turno de ai_thread corresponde este correo
);

comment on table public.email_log is 'Registro manual de cada correo real enviado al usuario, en cualquier momento del seguimiento de 30 días.';

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wishes enable row level security;
alter table public.ai_thread enable row level security;
alter table public.email_log enable row level security;

create policy "Los usuarios ven su propio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Los usuarios ven su propio deseo"
  on public.wishes for select
  using (auth.uid() = user_id);

create policy "Los usuarios crean su propio deseo"
  on public.wishes for insert
  with check (auth.uid() = user_id);

-- ai_thread y email_log NO tienen policy de usuario: son de uso
-- exclusivamente tuyo (operador), vía el Table Editor de Supabase
-- o la API con la service_role key. El usuario nunca los ve.

-- ------------------------------------------------------------
-- VISTAS DE AYUDA PARA TU OPERACIÓN MANUAL DIARIA
-- ------------------------------------------------------------

-- Panel principal: todos los deseos activos, con cuánto tiempo
-- llevan, cuántos turnos de IA tienen, y cuántos correos van enviados.
-- Ábrela cada día en Supabase (Table Editor > buscar la vista, o
-- SQL Editor > "select * from wishes_dashboard") para saber a quién
-- atender.
create or replace view public.wishes_dashboard as
select
  w.id as wish_id,
  p.email as login_email,
  w.contact_email,
  w.category,
  w.wish_text,
  w.status,
  w.cycle_started_at,
  w.cycle_due_at,
  (w.cycle_due_at - now()) as time_remaining,
  greatest(0, extract(day from (now() - w.cycle_started_at))::int) as days_elapsed,
  (select count(*) from public.ai_thread t where t.wish_id = w.id) as ai_turns_count,
  (select max(t.turn_number) from public.ai_thread t where t.wish_id = w.id) as last_turn_number,
  (select count(*) from public.email_log e where e.wish_id = w.id) as emails_sent_count,
  (select max(e.sent_at) from public.email_log e where e.wish_id = w.id) as last_email_sent_at,
  w.final_email_sent_manual,
  w.followup_finished_manual
from public.wishes w
join public.profiles p on p.id = w.user_id
order by w.cycle_started_at asc nulls last;

comment on view public.wishes_dashboard is 'Panel de control manual: úsalo para ver qué deseos están activos, cuánto llevan, y si ya toca cerrarlos.';

-- Deseos que ya pasaron los 30 días y SIGUEN sin cerrar — esto es
-- lo que más te importa revisar primero cada día.
create or replace view public.wishes_overdue_for_closing as
select * from public.wishes_dashboard
where status = 'active'
  and cycle_due_at <= now()
  and followup_finished_manual = false;

comment on view public.wishes_overdue_for_closing is 'Deseos que ya cumplieron 30 días y todavía no marcaste como cerrados. Revisa esta vista primero cada día.';

-- ============================================================
-- MIGRACIÓN — solo ejecuta esto si ya tenías el schema viejo
-- (el que usaba followups_sent, next_followup_at, ai_cycle_log)
-- ============================================================
-- Si tu proyecto de Supabase es NUEVO, ignora todo lo de abajo.
-- Si ya tenías datos con el esquema anterior, ejecuta esto para
-- migrar sin perder información:
--
-- alter table public.wishes drop column if exists next_followup_at;
-- alter table public.wishes drop column if exists followups_sent;
-- alter table public.wishes rename column final_email_sent to final_email_sent_manual;
-- alter table public.wishes add column if not exists cycle_due_at timestamptz;
-- alter table public.wishes add column if not exists final_email_sent_at timestamptz;
-- alter table public.wishes add column if not exists followup_finished_manual boolean default false;
-- alter table public.wishes add column if not exists followup_finished_at timestamptz;
-- alter table public.wishes add column if not exists closing_notes text;
-- alter table public.wishes add column if not exists donor_alias text;
-- alter table public.wishes add column if not exists identity_name text;
-- alter table public.wishes add column if not exists identity_age int;
-- alter table public.wishes add column if not exists identity_context text;
--
-- -- Migrar ai_cycle_log (cycle_number) hacia ai_thread (turn_number):
-- insert into public.ai_thread (wish_id, turn_number, prompt_text, response_text, purpose)
-- select wish_id, cycle_number, coalesce(prompt_sent, ''), ai_response, action_taken
-- from public.ai_cycle_log
-- on conflict (wish_id, turn_number) do nothing;
--
-- drop view if exists public.wishes_due_for_followup;
-- drop view if exists public.wishes_due_for_final_email;
-- drop table if exists public.ai_cycle_log;
