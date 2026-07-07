# Fontana — Guía de operación manual (día a día)

Esto es lo que vas a hacer cada día mientras operas todo a mano, antes
de automatizar. Todas las consultas se corren en Supabase: **SQL
Editor > New query**.

## 1. Ver qué necesita tu atención hoy

```sql
select * from public.wishes_dashboard;
```

Te muestra TODOS los deseos activos, con: cuántos días lleva cada uno,
cuántos turnos de IA tiene, cuántos correos van enviados, y la fecha
del último correo. Úsala como tu lista de pendientes diaria.

## 2. Ver solo los que ya cumplieron 30 días y faltan por cerrar

```sql
select * from public.wishes_overdue_for_closing;
```

Esta es la consulta más importante: te dice a quién le falta el correo
de cierre. Revísala primero cada día.

## 3. Cuando trabajas un nuevo prompt para un deseo

Reemplaza `'EL-ID-DEL-DESEO'` por el `wish_id` real (lo copias de la
consulta del dashboard):

```sql
insert into public.ai_thread (wish_id, turn_number, prompt_text, response_text, purpose)
values (
  'EL-ID-DEL-DESEO',
  public.next_turn_number('EL-ID-DEL-DESEO'),
  'aquí pegas el prompt exacto que le diste a la IA',
  'aquí pegas la respuesta completa que te dio',
  'una nota corta para ti: ej. "primer paso", "seguimiento día 12"'
);
```

No necesitas calcular el número de turno — `next_turn_number()` lo
calcula solo, siempre va a continuar el hilo correctamente.

## 4. Ver el hilo completo de un deseo (la conversación en orden)

```sql
select turn_number, purpose, prompt_text, response_text, created_at
from public.ai_thread
where wish_id = 'EL-ID-DEL-DESEO'
order by turn_number asc;
```

## 5. Cuando envías un correo al usuario (de cualquier tipo)

```sql
insert into public.email_log (wish_id, type, subject, body_sent, related_thread_turn)
values (
  'EL-ID-DEL-DESEO',
  'followup',  -- o 'step_one', 'identity_form', 'final'
  'el asunto que usaste',
  'el cuerpo completo que enviaste',
  3  -- opcional: el turn_number de ai_thread del que salió este correo
);
```

## 6. Cerrar un deseo a los 30 días (en DOS pasos, en este orden)

**Paso A — primero marca que ya enviaste el correo final:**
```sql
update public.wishes
set final_email_sent_manual = true
where id = 'EL-ID-DEL-DESEO';
```

**Paso B — luego, y solo después, marca que terminaste el seguimiento:**
```sql
update public.wishes
set followup_finished_manual = true,
    closing_notes = 'tu nota sobre cómo quedó el deseo'
where id = 'EL-ID-DEL-DESEO';
```

Si intentas hacer el Paso B sin haber hecho el Paso A, la base de
datos te va a devolver un error a propósito — es la protección para
que nunca cierres un deseo sin haber avisado al usuario.

## 7. Ver el historial completo de un usuario (vista de "expediente")

```sql
select
  w.*,
  (select count(*) from public.ai_thread t where t.wish_id = w.id) as turnos_ia,
  (select count(*) from public.email_log e where e.wish_id = w.id) as correos_enviados
from public.wishes w
where w.contact_email = 'correo-del-usuario@ejemplo.com';
```

## Cómo encontrar el wish_id rápido

La forma más fácil en el día a día: ve a **Table Editor > wishes** en
el panel de Supabase, busca por correo o por texto del deseo, y copia
el `id` de la fila — ese es el `wish_id` que usas en todas las
consultas de arriba.
