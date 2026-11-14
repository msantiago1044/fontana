-- ==============================================================================
-- Migración: Registro de Feedback Semanal de Clientes en Fontana
-- Fecha: 2026-11-05
-- ==============================================================================

alter table public.wishes
add column if not exists client_feedback jsonb default '[]'::jsonb;

comment on column public.wishes.client_feedback is 'Array de objetos JSON con calificaciones y notas de retroalimentación recibidas del cliente cada semana.';

