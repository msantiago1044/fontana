-- ============================================================
-- MIGRACIÓN: Monitor crítico proactivo + tabla monitor_estado
-- Fecha: 2026-08-08
-- ============================================================
-- Este script:
--   1. Crea la tabla monitor_estado para trackear el último estado
--      de cada componente crítico (evitar spam de alertas)
--   2. Crea un cron job que ejecuta critical-monitor cada 15 minutos
--
-- REQUISITOS PREVIOS:
--   - pg_cron y pg_net deben estar habilitados (Database > Extensions)
--   - La Edge Function 'critical-monitor' debe estar desplegada
--
-- EJECUTAR EN: Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Tabla monitor_estado
-- Registra el último estado conocido de cada componente crítico.
-- Se usa para evitar enviar alertas repetidas cuando el componente
-- ya estaba fallando en la verificación anterior.

CREATE TABLE IF NOT EXISTS public.monitor_estado (
  componente    TEXT PRIMARY KEY,
  ultimo_estado TEXT        NOT NULL DEFAULT 'ok',  -- 'ok' | 'fail'
  ultima_vez    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.monitor_estado IS
  'Estado más reciente de cada componente crítico de Fontana. '
  'Actualizado por la Edge Function critical-monitor cada 15 minutos. '
  'Se usa para evitar alertas duplicadas (solo alerta en cambios de estado).';

-- RLS: solo el service_role puede leer/escribir (la función usa SUPA_KEY)
ALTER TABLE public.monitor_estado ENABLE ROW LEVEL SECURITY;

-- Insertar filas iniciales para los 3 componentes críticos
-- Si ya existen, no hacer nada (DO NOTHING)
INSERT INTO public.monitor_estado (componente, ultimo_estado, ultima_vez)
VALUES
  ('wompi-webhook', 'ok', now()),
  ('guardar-deseo', 'ok', now()),
  ('Supabase DB',   'ok', now())
ON CONFLICT (componente) DO NOTHING;

-- 2. Habilitar extensiones necesarias (si no están ya activas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Cron job: critical-monitor cada 15 minutos
-- Eliminar si ya existía (evitar duplicados)
SELECT cron.unschedule('fontana-critical-monitor')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fontana-critical-monitor'
);

-- Programar el nuevo cron cada 15 minutos
SELECT cron.schedule(
  'fontana-critical-monitor',          -- nombre único del job
  '*/15 * * * *',                      -- cada 15 minutos
  $$
  SELECT net.http_post(
    url     := 'https://cbvqwdrbwogsmcglsvzg.supabase.co/functions/v1/critical-monitor',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNidnF3ZHJid29nc21jZ2xzdnpnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjczNTE0NSwiZXhwIjoyMDk4MzExMTQ1fQ.DOJt4fiuWiqNT_AyLjN8mRzHFjZG3lrFV_zS0zUwZQM'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 4. Verificar todos los crons activos
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'fontana-close-cycle',
  'fontana-daily-summary',
  'fontana-monitor-hourly',
  'fontana-critical-monitor'
)
ORDER BY jobname;

-- 5. Verificar que la tabla monitor_estado tiene los datos iniciales
SELECT * FROM public.monitor_estado ORDER BY componente;
