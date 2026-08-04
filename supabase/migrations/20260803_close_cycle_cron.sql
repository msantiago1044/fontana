-- ============================================================
-- MIGRACIÓN: Cron job close-cycle para Fontana
-- Fecha: 2026-08-03
-- ============================================================
-- Este script configura un cron job en Supabase que dispara la
-- Edge Function close-cycle cada día a las 14:00 UTC (9am Colombia).
--
-- ANTES DE EJECUTAR:
--   1. Asegúrate de que las extensiones pg_cron y pg_net están habilitadas
--      en tu proyecto (Database > Extensions > buscar pg_cron y pg_net).
--   2. Reemplaza REPLACE_WITH_SERVICE_ROLE_KEY con tu Service Role Key real.
--      La encuentras en: Supabase Dashboard > Settings > API.
--   3. Ejecuta en SQL Editor (Project > SQL Editor > New query).
-- ============================================================

-- Habilitar extensiones necesarias (si no están ya activas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Eliminar el job previo si existe (para poder re-ejecutar este script sin error)
SELECT cron.unschedule('fontana-close-cycle')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fontana-close-cycle'
);

-- Crear el cron job
SELECT cron.schedule(
  'fontana-close-cycle',           -- nombre único del job
  '0 14 * * *',                    -- todos los días a las 14:00 UTC (= 9:00am Colombia UTC-5)
  $$
  SELECT net.http_post(
    url     := 'https://cbvqwdrbwogsmcglsvzg.supabase.co/functions/v1/close-cycle',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer REPLACE_WITH_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verificar que el cron quedó registrado
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'fontana-close-cycle';
