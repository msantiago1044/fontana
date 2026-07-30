-- ============================================================
-- MIGRACIÓN: Telegram Bot operacional para Fontana
-- Fecha: 2026-07-30
-- ============================================================

-- 1. Agregar columna internal_notes a wishes (si no existe)
ALTER TABLE public.wishes
  ADD COLUMN IF NOT EXISTS internal_notes text;

COMMENT ON COLUMN public.wishes.internal_notes IS 'Notas internas del operador, editables desde el bot de Telegram con /nota [ID] [texto]';

-- 2. Agregar valores al enum email_type para uso del bot
-- PostgreSQL no permite IF NOT EXISTS en ALTER TYPE, así que usamos DO block
DO $$
BEGIN
  -- 'manual' para correos registrados manualmente sin envío real
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manual' AND enumtypid = 'email_type'::regtype) THEN
    ALTER TYPE email_type ADD VALUE 'manual';
  END IF;
  -- 'manual_reply' para respuestas a correos manuales
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manual_reply' AND enumtypid = 'email_type'::regtype) THEN
    ALTER TYPE email_type ADD VALUE 'manual_reply';
  END IF;
END $$;

-- 3. Actualizar la vista wishes_dashboard para incluir internal_notes y donor_alias
CREATE OR REPLACE VIEW public.wishes_dashboard AS
SELECT
  w.id AS wish_id,
  p.email AS login_email,
  w.contact_email,
  w.category,
  w.wish_text,
  w.donor_alias,
  w.status,
  w.amount_usd,
  w.cycle_started_at,
  w.cycle_due_at,
  (w.cycle_due_at - now()) AS time_remaining,
  greatest(0, extract(day FROM (now() - w.cycle_started_at))::int) AS days_elapsed,
  (SELECT count(*) FROM public.ai_thread t WHERE t.wish_id = w.id) AS ai_turns_count,
  (SELECT max(t.turn_number) FROM public.ai_thread t WHERE t.wish_id = w.id) AS last_turn_number,
  (SELECT count(*) FROM public.email_log e WHERE e.wish_id = w.id) AS emails_sent_count,
  (SELECT max(e.sent_at) FROM public.email_log e WHERE e.wish_id = w.id) AS last_email_sent_at,
  w.internal_notes,
  w.identity_name,
  w.identity_age,
  w.identity_context,
  w.final_email_sent_manual,
  w.followup_finished_manual
FROM public.wishes w
JOIN public.profiles p ON p.id = w.user_id
ORDER BY w.cycle_started_at ASC NULLS LAST;

-- 4. Vista para deseos sin actividad en email_log por más de 48h
CREATE OR REPLACE VIEW public.wishes_stale_48h AS
SELECT
  wd.*
FROM public.wishes_dashboard wd
WHERE wd.status = 'active'
  AND (
    -- No tiene ningún registro en email_log
    wd.emails_sent_count = 0
    OR
    -- El último correo fue hace más de 48 horas
    wd.last_email_sent_at < now() - interval '48 hours'
  )
  AND wd.cycle_started_at < now() - interval '48 hours';

COMMENT ON VIEW public.wishes_stale_48h IS 'Deseos activos sin actividad en email_log por más de 48 horas. Usado por el bot de Telegram para alertas automáticas.';
