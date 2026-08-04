-- ============================================================
-- MIGRACIÓN: Monitor de servicios + cron horario — Fontana
-- Fecha: 2026-08-03
-- ============================================================
-- Este script:
--   1. Crea la tabla monitor_state para persistir el último estado de cada servicio
--   2. Agrega un índice único en service_name (para upserts eficientes)
--   3. Crea un cron job horario que llama a la Edge Function 'monitor'
--
-- ANTES DE EJECUTAR:
--   1. Asegúrate de que pg_cron y pg_net estén habilitados
--      (Database > Extensions).
--   2. Reemplaza REPLACE_WITH_SERVICE_ROLE_KEY con tu Service Role Key real
--      (Supabase Dashboard > Settings > API).
--   3. Ejecuta en SQL Editor (Project > SQL Editor > New query).
-- ============================================================

-- 1. Tabla monitor_state
CREATE TABLE IF NOT EXISTS public.monitor_state (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name     text NOT NULL,
  last_status      text NOT NULL,           -- 'ok' | 'fail'
  last_checked_at  timestamptz DEFAULT now(),
  last_response_ms integer,
  last_error       text
);

-- Índice único para poder hacer upsert por service_name
CREATE UNIQUE INDEX IF NOT EXISTS monitor_state_service_name_key
  ON public.monitor_state (service_name);

COMMENT ON TABLE public.monitor_state IS 'Estado más reciente de cada servicio de Fontana. Un registro por servicio, actualizado por la Edge Function monitor.';

-- RLS: la tabla solo se lee/escribe con service_role (la función monitor usa SUPA_KEY)
ALTER TABLE public.monitor_state ENABLE ROW LEVEL SECURITY;

-- 2. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Cron horario: monitor health check cada hora en punto
-- Eliminar si ya existía
SELECT cron.unschedule('fontana-monitor-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fontana-monitor-hourly'
);

SELECT cron.schedule(
  'fontana-monitor-hourly',        -- nombre único del job
  '0 * * * *',                     -- cada hora en punto (ej. 14:00, 15:00, 16:00…)
  $$
  SELECT net.http_post(
    url     := 'https://cbvqwdrbwogsmcglsvzg.supabase.co/functions/v1/monitor',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer REPLACE_WITH_SERVICE_ROLE_KEY'
    ),
    body    := '{"silent": true}'::jsonb
  );
  $$
);

-- 4. Verificar ambos crons registrados
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('fontana-close-cycle', 'fontana-daily-summary', 'fontana-monitor-hourly')
ORDER BY jobname;
