-- ============================================================
-- FONTANA — Migración: Plan 30 Días, Trabajo Diario y Métricas de Tokens
-- Fecha: 2026-11-02
-- Integra el flujo de Antigravity CLI / fontana_engine con
-- Human-In-The-Loop, handoffs diarios y contabilidad de tokens y tiempo.
-- ============================================================

-- 1. Añadir columnas de plan y métricas a wishes
alter table public.wishes
  add column if not exists plan_30d jsonb,
  add column if not exists plan_status text default 'pending_review',
  add column if not exists plan_approved_at timestamptz,
  add column if not exists plan_generation_ms int,
  add column if not exists plan_tokens int;

comment on column public.wishes.plan_30d is 'Estructura JSON del plan maestro de 30 días generado por el motor de IA.';
comment on column public.wishes.plan_status is 'Estado del plan de 30 días: pending_review, approved, rejected, in_revision.';
comment on column public.wishes.plan_approved_at is 'Momento en que el operador humano aprobó el plan en Telegram o CLI.';
comment on column public.wishes.plan_generation_ms is 'Tiempo en milisegundos que tomó la generación del plan de 30 días.';
comment on column public.wishes.plan_tokens is 'Total de tokens consumidos durante la generación del plan maestro.';

-- 2. Crear tabla ai_daily_work para sesiones diarias y handoff continuo
create table if not exists public.ai_daily_work (
  id uuid primary key default uuid_generate_v4(),
  wish_id uuid not null references public.wishes(id) on delete cascade,
  day_number int not null check (day_number between 1 and 30),
  focus_goal text not null,
  daily_result text not null,
  tomorrow_handoff text not null,
  human_override_notes text,
  session_duration_ms int not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  status text default 'completed',
  created_at timestamptz default now(),
  unique (wish_id, day_number)
);

comment on table public.ai_daily_work is 'Registro diario de ejecuciones de IA para cada uno de los 30 días con handoff continuo.';
comment on column public.ai_daily_work.tomorrow_handoff is 'Contexto e instrucción de entrega preparada para la sesión del día siguiente.';
comment on column public.ai_daily_work.session_duration_ms is 'Duración exacta de la sesión diaria en milisegundos.';

-- 3. Métricas en ai_thread (turnos ad-hoc)
alter table public.ai_thread
  add column if not exists duration_ms int,
  add column if not exists tokens int;

comment on column public.ai_thread.duration_ms is 'Duración en milisegundos del turno de IA.';
comment on column public.ai_thread.tokens is 'Tokens totales consumidos en este turno.';

-- 4. RLS para ai_daily_work
alter table public.ai_daily_work enable row level security;

-- Política de lectura/escritura para operador / service_role
create policy "service_role has full access to ai_daily_work"
  on public.ai_daily_work
  for all
  using (true)
  with check (true);

-- 5. Vista de métricas consolidadas de tokens y tiempo por deseo
create or replace view public.wishes_token_metrics as
select
  w.id as wish_id,
  w.contact_email,
  w.status,
  w.plan_status,
  count(d.id)::int as days_recorded,
  (coalesce(sum(d.session_duration_ms), 0) + coalesce(w.plan_generation_ms, 0))::bigint as total_duration_ms,
  round((coalesce(sum(d.session_duration_ms), 0) + coalesce(w.plan_generation_ms, 0))::numeric / 1000.0, 2) as total_seconds_worked,
  round((coalesce(sum(d.session_duration_ms), 0) + coalesce(w.plan_generation_ms, 0))::numeric / 60000.0, 2) as total_minutes_worked,
  coalesce(sum(d.prompt_tokens), 0)::int as total_prompt_tokens,
  coalesce(sum(d.completion_tokens), 0)::int as total_completion_tokens,
  (coalesce(sum(d.total_tokens), 0) + coalesce(w.plan_tokens, 0))::bigint as total_tokens_consumed,
  -- Modelo de costo: Prompt $0.15/1M, Completion $0.60/1M, Plan promedio $0.30/1M
  round(
    (
      (coalesce(sum(d.prompt_tokens), 0)::numeric * 0.00000015) +
      (coalesce(sum(d.completion_tokens), 0)::numeric * 0.00000060) +
      (coalesce(w.plan_tokens, 0)::numeric * 0.00000030)
    ),
    4
  ) as estimated_cost_usd
from public.wishes w
left join public.ai_daily_work d on d.wish_id = w.id
group by w.id, w.contact_email, w.status, w.plan_status, w.plan_generation_ms, w.plan_tokens;

comment on view public.wishes_token_metrics is 'Métricas agregadas de duración, tokens y costos estimados por deseo.';
