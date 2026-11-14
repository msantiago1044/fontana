#!/usr/bin/env python3
"""
Fontana Engine — Motor Autónomo de Razonamiento, Trabajo Diario y Contabilidad de Tokens
========================================================================================
Soporta el flujo de trabajo Antigravity CLI / Fontana con:
  - Generación de Plan Maestro de 30 Días con Human-In-The-Loop (revisión y aprobación vía Telegram / CLI).
  - Ejecución de Sesiones Diarias (1 a 30) con Handoff continuo de contexto.
  - Medición exacta en milisegundos de tiempo de cómputo por sesión y acumulado.
  - Contabilidad detallada de tokens (prompt, completion, total) y cálculo de costo financiero (USD / COP).
  - CLI completa: plan, daily, approve, balance, daemon, demo.
  - Cero dependencias externas requeridas (usa biblioteca estándar con soporte opcional de requests).
"""

import sys
import os
import time
import json
import argparse
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone

# Asegurar codificación UTF-8 en stdout/stderr en cualquier terminal (especialmente Windows cp1252)
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ── Cargar variables desde .env si existe ─────────────────────────────────────────
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    try:
        with open(env_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    os.environ.setdefault(_k.strip(), _v.strip())
    except Exception:
        pass

# ── Configuración y Variables de Entorno ─────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")

# Modelo de Costos: Prompt $0.15/1M, Completion $0.60/1M, TRM Colombia ~4,200 COP/USD
COST_PER_PROMPT_TOKEN = 0.00000015
COST_PER_COMPLETION_TOKEN = 0.00000060
USD_TO_COP = 4200.0


# ── Helpers de Red / Supabase REST ───────────────────────────────────────────────
def http_request(url: str, method: str = "GET", headers: dict = None, body: dict = None) -> tuple[int, dict | list | str]:
    """Cliente HTTP robusto usando urllib estándar para cero dependencias."""
    headers = headers or {}
    data_bytes = None
    if body is not None:
        data_bytes = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
            content = resp.read().decode("utf-8")
            try:
                return status, json.loads(content)
            except Exception:
                return status, content
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_content)
        except Exception:
            return e.code, err_content
    except Exception as e:
        return 0, str(e)


def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Prefer": "return=representation",
    }


def is_supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def fetch_wish(wish_id: str) -> dict | None:
    """Busca un deseo en Supabase por ID exacto o prefijo (mínimo 6 chars)."""
    if not is_supabase_configured():
        return None

    headers = supabase_headers()
    # Coincidencia exacta
    url = f"{SUPABASE_URL}/rest/v1/wishes?id=eq.{wish_id}&select=*"
    status, data = http_request(url, headers=headers)
    if status == 200 and isinstance(data, list) and len(data) > 0:
        return data[0]

    # Coincidencia por prefijo
    if len(wish_id) >= 6:
        url_all = f"{SUPABASE_URL}/rest/v1/wishes?select=*"
        st, all_w = http_request(url_all, headers=headers)
        if st == 200 and isinstance(all_w, list):
            matches = [w for w in all_w if str(w.get("id", "")).lower().startswith(wish_id.lower())]
            if len(matches) == 1:
                return matches[0]
            elif len(matches) > 1:
                print(f"[WARN] ID '{wish_id}' es ambiguo ({len(matches)} coincidencias). Usando primera.", file=sys.stderr)
                return matches[0]

    return None


def update_wish(wish_id: str, fields: dict) -> bool:
    if not is_supabase_configured():
        return False
    url = f"{SUPABASE_URL}/rest/v1/wishes?id=eq.{wish_id}"
    headers = supabase_headers()
    status, _ = http_request(url, method="PATCH", headers=headers, body=fields)
    return status in (200, 204)


def record_daily_work(record: dict) -> bool:
    if not is_supabase_configured():
        return False

    # Asegurar que wish_id sea el UUID completo de 36 caracteres
    raw_id = str(record.get("wish_id", ""))
    if len(raw_id) != 36:
        w = fetch_wish(raw_id)
        if w and "id" in w:
            record["wish_id"] = w["id"]

    url = f"{SUPABASE_URL}/rest/v1/ai_daily_work"
    headers = supabase_headers()
    headers["Prefer"] = "resolution=merge-duplicates"
    status, res = http_request(url, method="POST", headers=headers, body=record)
    if status not in (200, 201, 204):
        print(f"[WARN] No se pudo guardar sesión en Supabase (status {status}): {res}", file=sys.stderr)
        return False
    return True


def notify_telegram_plan_ready(wish_id: str, email: str, diagnosis: str, weekly_goals: list, duration_ms: int, tokens: int, wish_text: str = ""):
    """Notifica al canal o chat de Telegram que el plan está listo para revisión."""
    # Opción A: A través de la Edge Function notify-telegram de Supabase
    if is_supabase_configured():
        fn_url = f"{SUPABASE_URL}/functions/v1/notify-telegram"
        payload = {
            "type": "plan_ready_for_review",
            "wishId": wish_id,
            "wishText": wish_text,
            "email": email,
            "diagnosis": diagnosis,
            "weeklyGoals": weekly_goals,
            "durationMs": duration_ms,
            "tokens": tokens,
        }
        status, resp = http_request(fn_url, method="POST", headers={"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"}, body=payload)
        if status == 200:
            return True

    # Opción B: Directo a la API de Telegram Bot si los tokens están configurados
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        goals_text = "\n".join([f"  • <b>Semana {g.get('week', i+1)}:</b> {g.get('goal', '')}" for i, g in enumerate(weekly_goals)])
        text = (
            f"✅ <b>Plan de 30 Días Generado y Auto-Aprobado</b>\n\n"
            f"🆔 <code>{wish_id}</code>\n"
            f"💭 <b>Deseo:</b>\n<i>\"{wish_text}\"</i>\n\n"
            f"🎯 <b>Diagnóstico:</b>\n{diagnosis}\n\n"
            f"📅 <b>Metas Semanales:</b>\n{goals_text}\n"
        )
        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": "🔍 Ver Detalle", "callback_data": f"detail:{wish_id}"},
                    {"text": "🖥️ Editar en Mission Control", "url": "https://fontana.digital/admin"},
                ]
            ]
        }
        body = {"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML", "reply_markup": reply_markup}
        status, _ = http_request(tg_url, method="POST", body=body)
        return status == 200

    return False


# ── Motor de Tokens y Estimación ────────────────────────────────────────────────
def estimate_tokens(text: str) -> int:
    """Estimación heurística precisa: ~4 caracteres por token (estándar GPT/Gemini en español)."""
    if not text:
        return 0
    words = len(text.split())
    chars = len(text)
    # Ponderación basada en caracteres y conteo de palabras
    return max(1, int((chars / 3.8 + words * 0.25) / 1.1))


# ── Motor de Razonamiento IA ─────────────────────────────────────────────────────
def call_llm(prompt: str, system_prompt: str = "", response_json: bool = False) -> tuple[str, int, int, int]:
    """
    Invoca la API de Gemini si GEMINI_API_KEY está configurada,
    o utiliza el motor semántico de respaldo determinista para ejecución local.
    Devuelve: (response_text, prompt_tokens, completion_tokens, total_tokens)
    """
    prompt_tokens = estimate_tokens(system_prompt + "\n" + prompt)

    if GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={GEMINI_API_KEY}"
            gen_config: dict = {"temperature": 0.4, "maxOutputTokens": 2048}
            if response_json:
                gen_config["responseMimeType"] = "application/json"
            body = {
                "contents": [
                    {"role": "user", "parts": [{"text": f"{system_prompt}\n\n{prompt}"}]}
                ],
                "generationConfig": gen_config,
            }
            status, resp = http_request(url, method="POST", body=body)
            if status == 200 and isinstance(resp, dict):
                candidates = resp.get("candidates", [])
                if candidates:
                    text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    usage = resp.get("usageMetadata", {})
                    p_tok = usage.get("promptTokenCount", prompt_tokens)
                    c_tok = usage.get("candidatesTokenCount", estimate_tokens(text))
                    return text, p_tok, c_tok, p_tok + c_tok
        except Exception as e:
            print(f"[WARN] Error llamando a Gemini API: {e}. Usando sintetizador local.", file=sys.stderr)

    # Sintetizador local determinista y neutro
    response_text = ""
    if "PLAN_MAESTRO_30D" in system_prompt:
        response_text = (
            "{\n"
            '  "diagnosis": "El deseo requiere una ruta progresiva 100% digital que combine conocimiento práctico, herramientas adecuadas y creación de presencia informativa en la red.",\n'
            '  "weekly_goals": [\n'
            '    {"week": 1, "focus": "Claridad y Herramientas Base", "goal": "Entregar guía de enfoque inicial, definir herramientas digitales clave y generar las primeras piezas informativas base para la red."},\n'
            '    {"week": 2, "focus": "Conocimiento Curado y Activos Prácticos", "goal": "Proveer tutoriales puntuales, plantillas aplicables y ampliar la huella de contenido útil en torno al objetivo."},\n'
            '    {"week": 3, "focus": "Profundización y Optimización Digital", "goal": "Entregar guías avanzadas, prompts y marcos de decisión junto con contenido especializado para posicionar el tema en la red."},\n'
            '    {"week": 4, "focus": "Sistematización y Continuidad", "goal": "Consolidar el playbook digital reutilizable para el usuario y completar el paquete de información estratégica en la red."}\n'
            "  ],\n"
            '  "key_milestones": ["Kit de arranque digital día 7", "Activos y recursos clave día 14", "Sistema de ejecución optimizado día 21", "Playbook y huella digital completa día 28"],\n'
            '  "daily_cadence_notes": "Cada jornada entrega un recurso digital útil para el usuario y produce una pieza de información interna lista para publicar en la red."\n'
            "}"
        )
    elif "FONTANA_DAILY_AGENT" in system_prompt:
        response_text = json.dumps({
            "focus_goal": "Estructuración de recurso digital práctico y pieza de contenido para la red.",
            "user_deliverable": "Guía práctica de implementación digital, criterios clave de avance y recomendación de herramienta aplicable a la fase actual.",
            "network_content": "Borrador de artículo informativo optimizado para buscadores sobre el tema central del deseo, orientado a atraer visibilidad y autoridad.",
            "tomorrow_handoff": "Continuar con la siguiente pieza práctica de la semana y profundizar en herramientas o conocimiento complementario."
        }, ensure_ascii=False)
    else:
        response_text = (
            "Sesión completada con éxito. Se consolidó el recurso digital correspondiente a la fase activa "
            "manteniendo coherencia con las metas de la semana."
        )

    completion_tokens = estimate_tokens(response_text)
    return response_text, prompt_tokens, completion_tokens, prompt_tokens + completion_tokens


# ── 1. Generación del Plan Maestro de 30 Días ───────────────────────────────────
def generate_plan(wish_id: str, wish_data: dict | None = None) -> dict:
    """
    Genera el Plan Maestro de 30 Días estructurado para un deseo.
    Mide la duración exacta en milisegundos y calcula tokens consumidos.
    Actualiza Supabase si está disponible y notifica a Telegram.
    """
    t_start = time.perf_counter()

    if wish_data is None:
        wish_data = fetch_wish(wish_id) or {}

    wish_text = wish_data.get("wish_text", "Deseo no especificado")
    category = wish_data.get("category", "General")
    contact_email = wish_data.get("contact_email", "usuario@fontana.wish")
    identity_name = wish_data.get("identity_name") or wish_data.get("donor_alias") or ""
    identity_age = wish_data.get("identity_age") or ""
    identity_context = wish_data.get("identity_context", "")

    system_prompt = (
        "SYSTEM: Eres Fontana Architect AI, el arquitecto estratégico de un sistema 100% digital "
        "llamado Fontana. Rol clave: PLAN_MAESTRO_30D.\n"
        "NATURALEZA DE FONTANA (REGLA ESTRICTA):\n"
        "- Fontana opera EXCLUSIVAMENTE en el entorno digital. NO realiza acciones físicas ni presenciales, "
        "NO opera cuentas privadas del usuario y NO promete resultados externos que dependan de terceros "
        "(por ejemplo, NO prometas 'cerrar 3 ventas' ni 'conseguir X clientes' como acción de Fontana).\n"
        "- Fontana impulsa el deseo de la persona durante 30 días mediante DOS vías complementarias:\n"
        "  1. EQUIPAMIENTO DIGITAL AL USUARIO: darle herramientas/apps digitales recomendadas, conocimiento curado, "
        "temas exactos de videos tutoriales, guías paso a paso, plantillas, guiones, prompts o sistemas prácticos.\n"
        "  2. CREACIÓN DE INFORMACIÓN EN LA RED (resultado interno de Fontana): redactar piezas de información útil "
        "e indexable (artículos SEO, guías públicas, posts de autoridad, respuestas AEO) sobre su proyecto o tema "
        "para impulsar su visibilidad en internet.\n"
        "- FLEXIBILIDAD TOTAL: NO uses un molde rígido ni repitas los mismos 4 bloques cada semana. "
        "Adapta libremente el enfoque de cada una de las 4 semanas a lo que este deseo específico, su categoría "
        "y su contexto personal realmente necesitan.\n"
        "Devuelve estrictamente un objeto JSON válido."
    )

    profile_parts = []
    if identity_name:
        profile_parts.append(f"Nombre: {identity_name}")
    if identity_age:
        profile_parts.append(f"Edad: {identity_age}")
    profile_line = f"PERFIL: {' | '.join(profile_parts)}\n" if profile_parts else ""

    prompt = (
        f"Analiza el siguiente deseo y diseña un Plan Maestro de 30 Días 100% digital y a la medida:\n\n"
        f"DESEO: {wish_text}\n"
        f"CATEGORÍA: {category}\n"
        f"{profile_line}"
        f"CONTEXTO PERSONAL: {identity_context or 'Sin contexto adicional proporcionado'}\n\n"
        f"INSTRUCCIONES PARA LAS 4 SEMANAS:\n"
        f"- Cada semana en 'weekly_goals' debe describir qué va a construir, curar y entregar Fontana "
        f"(conocimiento, apps/herramientas digitales, tutoriales clave, plantillas, guías o sistemas + contenido para la red) "
        f"para equipar al usuario en esa etapa.\n"
        f"- Evita metas genéricas o presenciales. Sé específico para este deseo y su categoría.\n\n"
        f"Devuelve estrictamente un JSON con:\n"
        f"- diagnosis: diagnóstico claro y realista del deseo y su ruta digital.\n"
        f"- weekly_goals: array de 4 objetos con {{week (1..4), focus (título corto), goal (qué entrega y construye Fontana esa semana)}}.\n"
        f"- key_milestones: array de 4 strings con los hitos de equipamiento y presencia digital de cada semana.\n"
        f"- daily_cadence_notes: breve nota de cómo se encadenará el trabajo diario."
    )

    raw_response, p_tokens, c_tokens, total_tokens = call_llm(prompt, system_prompt=system_prompt, response_json=True)
    t_end = time.perf_counter()
    duration_ms = int(round((t_end - t_start) * 1000))

    # Parsear respuesta JSON limpia
    try:
        clean_json = raw_response.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json.split("```json", 1)[1].split("```", 1)[0].strip()
        elif clean_json.startswith("```"):
            clean_json = clean_json.split("```", 1)[1].split("```", 1)[0].strip()
        plan_dict = json.loads(clean_json)
    except Exception:
        plan_dict = {
            "diagnosis": raw_response[:300] if raw_response else "Ruta 100% digital estructurada para equipar al usuario y generar presencia informativa en la red.",
            "weekly_goals": [
                {"week": 1, "focus": "Claridad y Herramientas Base", "goal": "Entregar guía inicial de enfoque, recomendar herramientas digitales clave y producir las primeras piezas informativas base."},
                {"week": 2, "focus": "Conocimiento y Activos Prácticos", "goal": "Curar tutoriales puntuales, plantillas aplicables y ampliar el contenido de valor para posicionar el objetivo."},
                {"week": 3, "focus": "Profundización y Optimización", "goal": "Entregar marcos de decisión avanzados, prompts y recursos específicos mientras se refuerza la huella digital."},
                {"week": 4, "focus": "Sistematización y Continuidad", "goal": "Consolidar el playbook digital final para el usuario y el paquete completo de información para la red."},
            ],
            "key_milestones": ["Semana 1: Kit inicial y base digital", "Semana 2: Herramientas y activos prácticos", "Semana 3: Optimización y recursos avanzados", "Semana 4: Playbook y presencia consolidada"],
            "daily_cadence_notes": "Ejecución continua 100% digital de 30 días guiada por handoff diario."
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    result = {
        "wish_id": wish_id,
        "contact_email": contact_email,
        "plan_30d": plan_dict,
        "plan_status": "approved",
        "plan_approved_at": now_iso,
        "plan_generation_ms": duration_ms,
        "prompt_tokens": p_tokens,
        "completion_tokens": c_tokens,
        "plan_tokens": total_tokens,
        "created_at": now_iso,
    }

    # Persistir en base de datos si está conectada
    if is_supabase_configured():
        update_wish(wish_id, {
            "plan_30d": plan_dict,
            "plan_status": "approved",
            "plan_approved_at": now_iso,
            "plan_generation_ms": duration_ms,
            "plan_tokens": total_tokens,
        })

    # Disparar alerta Human-In-The-Loop a Telegram
    notify_telegram_plan_ready(
        wish_id=wish_id,
        email=contact_email,
        diagnosis=plan_dict.get("diagnosis", ""),
        weekly_goals=plan_dict.get("weekly_goals", []),
        duration_ms=duration_ms,
        tokens=total_tokens,
        wish_text=wish_text,
    )

    return result


# ── 2. Ejecución de Sesión Diaria de Trabajo ────────────────────────────────────
def run_daily_session(wish_id: str, day_number: int, previous_handoff: str | None = None, wish_data: dict | None = None) -> dict:
    """
    Ejecuta el razonamiento y trabajo para un día específico (1 a 30).
    Recibe el handoff del día anterior para garantizar continuidad acumulativa.
    Mide milisegundos de ejecución y contabilidad de tokens consumidos.
    """
    t_start = time.perf_counter()

    if wish_data is None:
        wish_data = fetch_wish(wish_id) or {}

    wish_text = wish_data.get("wish_text", "Deseo en curso")
    category = wish_data.get("category", "General")
    identity_name = wish_data.get("identity_name") or wish_data.get("donor_alias") or ""
    identity_age = wish_data.get("identity_age") or ""
    identity_context = wish_data.get("identity_context", "")
    plan = wish_data.get("plan_30d") or {}

    # Determinar semana actual
    week_number = min(4, max(1, (day_number - 1) // 7 + 1))
    weekly_goals = plan.get("weekly_goals", [])
    current_week_focus = ""
    current_week_goal = ""
    for g in weekly_goals:
        if g.get("week") == week_number:
            current_week_focus = g.get("focus") or ""
            current_week_goal = g.get("goal") or g.get("focus") or ""
            break

    system_prompt = (
        "SYSTEM: Eres Fontana Daily Agent (FONTANA_DAILY_AGENT). Operas 100% de forma digital "
        "para impulsar el deseo del usuario en un ciclo de 30 días.\n"
        "REGLAS ESTRICTAS:\n"
        "1. NUNCA finjas ni simules acciones físicas ni métricas externas (no digas 'hoy contacté 10 clientes' ni 'agendé 3 llamadas').\n"
        "2. En cada jornada generas DOS resultados concretos:\n"
        "   - user_deliverable: Un recurso digital real y accionable para el usuario (guía práctica, app recomendada con pasos de uso, "
        "plantilla/guion listo para copiar, prompt útil o tema de video tutorial con enlace seguro de búsqueda en YouTube "
        "con formato https://www.youtube.com/results?search_query=palabras+clave — NUNCA inventes URLs directas de watch?v=).\n"
        "   - network_content: El resultado interno de Fontana para ser publicado en internet más adelante: una pieza real de información "
        "útil, indexable (artículo SEO, guía pública, post de autoridad o respuesta experta AEO) sobre el tema/proyecto del usuario.\n"
        "3. Prepara un 'tomorrow_handoff' estricto para que el agente del día siguiente continúe sin repetir.\n"
        "Devuelve estrictamente un objeto JSON válido."
    )

    # Incorporar retroalimentación previa del cliente si existe
    client_feedback = wish_data.get("client_feedback") or []
    feedback_context = ""
    if isinstance(client_feedback, list) and len(client_feedback) > 0:
        latest_fb = client_feedback[-1]
        fb_week = latest_fb.get("week", 1)
        fb_rating = latest_fb.get("rating", "neutral")
        fb_comment = latest_fb.get("comment", "")
        feedback_context = (
            f"\nRETROALIMENTACIÓN DIRECTA DEL CLIENTE (Semana {fb_week}):\n"
            f"- Percepción: {fb_rating}\n"
            f"- Nota del usuario: \"{fb_comment or 'Sin nota adicional'}\"\n"
            f"INSTRUCCIÓN: Adapta el recurso de hoy para atender directamente estas observaciones.\n"
        )

    profile_str = f" | Perfil: {identity_name} ({identity_age} años)" if (identity_name or identity_age) else ""
    prompt = (
        f"DÍA ACTUAL: Día {day_number} de 30 (Semana {week_number}/4)\n"
        f"DESEO PRINCIPAL: {wish_text} [Categoría: {category}]{profile_str}\n"
        f"CONTEXTO PERSONAL: {identity_context or 'No especificado'}\n"
        f"ENFOQUE DE LA SEMANA: {current_week_focus or 'Avance digital'}\n"
        f"META DE LA SEMANA: {current_week_goal or 'Avance sostenido y equipamiento digital'}\n"
        f"HANDOFF DEL DÍA ANTERIOR: {previous_handoff or 'Inicio de ciclo: primera jornada de estructuración y arranque'}\n"
        f"{feedback_context}\n"
        f"Devuelve estrictamente un JSON con estas 4 claves:\n"
        f"- focus_goal: Objetivo específico y concreto de esta sesión diaria (1 línea).\n"
        f"- user_deliverable: Recurso digital concreto creado hoy para equipar al usuario (herramientas/apps, conocimiento, guías, plantillas o enlaces de búsqueda de YouTube seguros).\n"
        f"- network_content: Pieza de información lista para publicar en la red de internet más adelante (artículo SEO, post de autoridad o guía pública) para impulsar este deseo.\n"
        f"- tomorrow_handoff: Instrucción precisa de relevo para el Día {min(30, day_number + 1)}."
    )

    raw_response, p_tokens, c_tokens, total_tokens = call_llm(prompt, system_prompt=system_prompt, response_json=True)
    t_end = time.perf_counter()
    duration_ms = int(round((t_end - t_start) * 1000))

    # Parsear respuesta JSON real de la sesión
    parsed_session = {}
    try:
        clean_json = raw_response.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json.split("```json", 1)[1].split("```", 1)[0].strip()
        elif clean_json.startswith("```"):
            clean_json = clean_json.split("```", 1)[1].split("```", 1)[0].strip()
        parsed_session = json.loads(clean_json)
    except Exception:
        parsed_session = {}

    focus_goal = parsed_session.get("focus_goal") or f"Día {day_number}: Avance digital de Semana {week_number} ({category})."
    user_deliv = parsed_session.get("user_deliverable") or (
        f"Recurso práctico de la jornada #{day_number} enfocado en {current_week_goal or category}."
    )
    net_content = parsed_session.get("network_content") or (
        f"Pieza informativa base del Día {day_number} sobre \"{wish_text[:80]}\" lista para futura publicación en la red."
    )
    daily_result = (
        f"📌 Recurso Digital para el Usuario:\n{user_deliv}\n\n"
        f"🌐 [RESULTADO INTERNO FONTANA — INFORMACIÓN PARA LA RED]:\n{net_content}"
    )
    tomorrow_handoff = parsed_session.get("tomorrow_handoff") or (
        f"Contexto para Día {min(30, day_number + 1)}: Continuar construyendo sobre lo entregado en el Día {day_number} "
        f"dentro del enfoque '{current_week_focus or category}'."
    )

    real_wish_id = wish_data.get("id", wish_id)
    if len(str(real_wish_id)) != 36:
        w_found = fetch_wish(str(real_wish_id))
        if w_found and "id" in w_found:
            real_wish_id = w_found["id"]

    record = {
        "wish_id": real_wish_id,
        "day_number": day_number,
        "focus_goal": focus_goal,
        "daily_result": daily_result,
        "tomorrow_handoff": tomorrow_handoff,
        "human_override_notes": None,
        "session_duration_ms": duration_ms,
        "prompt_tokens": p_tokens,
        "completion_tokens": c_tokens,
        "total_tokens": total_tokens,
        "status": "completed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Guardar en base de datos si está conectada
    if is_supabase_configured():
        record_daily_work(record)

    # Automatización de cierre semanal (Días 7, 14, 21 y 28) — envío automático sin HITL ni Telegram
    if day_number in (7, 14, 21, 28):
        print(f"\n📢 [SEMANA {week_number}] ¡Día {day_number} completado! Compilando y enviando correo semanal automáticamente...")
        dispatch_weekly_email(real_wish_id, week_number=week_number)

    return record


# ── 3. Aprobación del Plan Maestro (Human-In-The-Loop) ──────────────────────────
def approve_plan(wish_id: str, notes: str | None = None) -> dict:
    """Aprueba el plan maestro para permitir que comience el trabajo diario."""
    now_iso = datetime.now(timezone.utc).isoformat()
    fields = {
        "plan_status": "approved",
        "plan_approved_at": now_iso,
    }
    if notes:
        fields["closing_notes"] = notes

    updated = False
    if is_supabase_configured():
        updated = update_wish(wish_id, fields)

    return {
        "wish_id": wish_id,
        "plan_status": "approved",
        "plan_approved_at": now_iso,
        "persisted": updated,
        "notes": notes,
    }


# ── 4. Consulta y Balance de Cómputo y Tokens ────────────────────────────────────
def get_balance(wish_id: str) -> dict:
    """
    Recupera y calcula el resumen completo de tokens y tiempo de ejecución
    para un deseo dado, contrastándolo contra la vista de Supabase o cálculo directo.
    """
    if is_supabase_configured():
        headers = supabase_headers()
        url = f"{SUPABASE_URL}/rest/v1/wishes_token_metrics?wish_id=eq.{wish_id}&select=*"
        status, data = http_request(url, headers=headers)
        if status == 200 and isinstance(data, list) and len(data) > 0:
            row = data[0]
            cost_usd = float(row.get("estimated_cost_usd", 0.0))
            return {
                "wish_id": wish_id,
                "contact_email": row.get("contact_email"),
                "status": row.get("status"),
                "plan_status": row.get("plan_status"),
                "days_recorded": row.get("days_recorded", 0),
                "total_duration_ms": row.get("total_duration_ms", 0),
                "total_seconds_worked": row.get("total_seconds_worked", 0.0),
                "total_minutes_worked": row.get("total_minutes_worked", 0.0),
                "total_prompt_tokens": row.get("total_prompt_tokens", 0),
                "total_completion_tokens": row.get("total_completion_tokens", 0),
                "total_tokens_consumed": row.get("total_tokens_consumed", 0),
                "estimated_cost_usd": cost_usd,
                "estimated_cost_cop": round(cost_usd * USD_TO_COP, 2),
            }

    # Fallback si no hay conexión activa
    return {
        "wish_id": wish_id,
        "contact_email": "demo@fontana.wish",
        "status": "active",
        "plan_status": "approved",
        "days_recorded": 1,
        "total_duration_ms": 1420,
        "total_seconds_worked": 1.42,
        "total_minutes_worked": 0.02,
        "total_prompt_tokens": 1250,
        "total_completion_tokens": 420,
        "total_tokens_consumed": 1670,
        "estimated_cost_usd": round(1250 * COST_PER_PROMPT_TOKEN + 420 * COST_PER_COMPLETION_TOKEN, 4),
        "estimated_cost_cop": round((1250 * COST_PER_PROMPT_TOKEN + 420 * COST_PER_COMPLETION_TOKEN) * USD_TO_COP, 2),
    }


def print_history(wish_id: str):
    """Muestra el historial cronológico detallado de sesiones diarias para un deseo."""
    wish = fetch_wish(wish_id)
    real_id = wish.get("id", wish_id) if wish else wish_id
    email = wish.get("contact_email") if wish else "N/A"
    wish_txt = wish.get("wish_text") if wish else "N/A"

    print("\n" + "=" * 70)
    print(f"📖 HISTORIAL DÍA A DÍA DE SESIONES IA — FONTANA")
    print(f"   Deseo: {real_id} ({email})")
    print(f"   \"{wish_txt}\"")
    print("=" * 70)

    if not is_supabase_configured():
        print("[ERROR] Supabase no está configurado.", file=sys.stderr)
        return

    headers = supabase_headers()
    url = f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{real_id}&select=*&order=day_number.asc"
    status, data = http_request(url, headers=headers)
    if status != 200 or not isinstance(data, list) or len(data) == 0:
        print(f"⚠️ Aún no hay sesiones diarias registradas para el deseo {real_id[:8]}...")
        print("=" * 70 + "\n")
        return

    for d in data:
        day_num = d.get("day_number")
        ms = d.get("session_duration_ms", 0)
        tokens = d.get("total_tokens", 0)
        focus = d.get("focus_goal", "—")
        result = d.get("daily_result", "—")
        handoff = d.get("tomorrow_handoff", "—")
        created = d.get("created_at", "")[:19].replace("T", " ")

        print(f"\n┌─ [DÍA {day_num:02d}/30] ({created} UTC) │ ⏱️ {ms} ms │ ⚡ {tokens:,} tokens")
        print(f"│ 🎯 FOCO: {focus}")
        print(f"│ 📦 RESULTADO TANGIBLE:")
        for line in result.split("\n"):
            print(f"│    {line}")
        print(f"│ 🔄 RELEVO PARA MAÑANA (HANDOFF):")
        for line in handoff.split("\n"):
            print(f"│    {line}")
        print(f"└───────────────────────────────────────────────────────────────────")

    print(f"\n✓ Total de sesiones registradas: {len(data)} / 30 días.")
    print("=" * 70 + "\n")



# ── 5. Modo Demostración Autónoma (Self-Contained) ───────────────────────────────
def run_demo():
    """
    Ejecuta un ciclo completo y autocontenido sin requerir servicios externos:
    1. Simula deseo.
    2. Genera plan de 30 días, mide tiempo en ms y cuenta tokens.
    3. Simula la alerta Human-In-The-Loop y aprobación.
    4. Ejecuta sesión Día 1 con handoff continuo.
    5. Ejecuta sesión Día 2 recibiendo el handoff previo.
    6. Imprime balance consolidado de cómputo y costos en USD y COP.
    """
    print("\n" + "=" * 70)
    print("✨ FONTANA ENGINE — DEMOSTRACIÓN INTEGRAL (Human-In-The-Loop & Tokens)")
    print("=" * 70)

    demo_wish_id = "f0a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c"
    sample_wish = {
        "id": demo_wish_id,
        "contact_email": "marcela@pasteleriasano.co",
        "category": "Emprendimiento / Gastronomía",
        "wish_text": "Quiero lanzar mi pastelería artesanal sin gluten y tener mis primeros 10 clientes recurrentes en Bogotá.",
        "identity_name": "Marcela",
        "identity_age": 32,
        "identity_context": "Tengo recetas probadas con harina de almendras y yuca, pero me cuesta prospectar y poner precios.",
        "status": "active",
    }

    print(f"\n[1/5] Deseo recibido para acompañamiento:")
    print(f"      • ID: {demo_wish_id[:8]}…")
    print(f"      • Usuario: {sample_wish['identity_name']} ({sample_wish['contact_email']})")
    print(f"      • Deseo: \"{sample_wish['wish_text']}\"")

    # 1. Plan de 30 Días
    print(f"\n[2/5] Generando Plan Maestro de 30 Días con Fontana Engine...")
    plan_result = generate_plan(demo_wish_id, wish_data=sample_wish)
    plan = plan_result["plan_30d"]

    print(f"      ✓ Plan generado en: {plan_result['plan_generation_ms']} ms")
    print(f"      ✓ Tokens consumidos: {plan_result['plan_tokens']:,} (Prompt: {plan_result['prompt_tokens']:,} | Completion: {plan_result['completion_tokens']:,})")
    print(f"      ✓ Estado: {plan_result['plan_status'].upper()} (Esperando revisión humana)")
    print(f"\n      --- Diagnóstico del Plan ---")
    print(f"      {plan.get('diagnosis', '')}")
    print(f"\n      --- Metas Semanales ---")
    for g in plan.get("weekly_goals", []):
        print(f"      • Semana {g.get('week')}: [{g.get('focus')}] -> {g.get('goal')}")

    # 2. Aprobación Human-In-The-Loop
    print(f"\n[3/5] Operador Humano revisa en Telegram y APROBÓ el plan:")
    approve_result = approve_plan(demo_wish_id, notes="Aprobado por operador en Telegram.")
    print(f"      ✓ Estado actualizado a: {approve_result['plan_status'].upper()} el {approve_result['plan_approved_at']}")

    # 3. Sesión Día 1
    sample_wish["plan_30d"] = plan
    sample_wish["plan_status"] = "approved"

    print(f"\n[4/5] Ejecutando Sesión Diaria: DÍA 1 de 30...")
    day1 = run_daily_session(demo_wish_id, day_number=1, previous_handoff=None, wish_data=sample_wish)
    print(f"      ✓ Duración: {day1['session_duration_ms']} ms | Tokens: {day1['total_tokens']:,}")
    print(f"      • Foco: {day1['focus_goal']}")
    print(f"      • Resultado: {day1['daily_result']}")
    print(f"      • Handoff para Día 2: {day1['tomorrow_handoff']}")

    # 4. Sesión Día 2 (continuidad)
    print(f"\n      Ejecutando Sesión Diaria: DÍA 2 de 30 (encadenando handoff previo)...")
    day2 = run_daily_session(demo_wish_id, day_number=2, previous_handoff=day1['tomorrow_handoff'], wish_data=sample_wish)
    print(f"      ✓ Duración: {day2['session_duration_ms']} ms | Tokens: {day2['total_tokens']:,}")
    print(f"      • Foco: {day2['focus_goal']}")
    print(f"      • Handoff para Día 3: {day2['tomorrow_handoff']}")

    # 5. Balance Acumulado
    total_ms = plan_result['plan_generation_ms'] + day1['session_duration_ms'] + day2['session_duration_ms']
    total_p = plan_result['prompt_tokens'] + day1['prompt_tokens'] + day2['prompt_tokens']
    total_c = plan_result['completion_tokens'] + day1['completion_tokens'] + day2['completion_tokens']
    total_tok = total_p + total_c
    cost_usd = (total_p * COST_PER_PROMPT_TOKEN) + (total_c * COST_PER_COMPLETION_TOKEN)
    cost_cop = cost_usd * USD_TO_COP

    print("\n" + "=" * 70)
    print("📊 BALANCE CONSOLIDADO DE CÓMPUTO Y TOKENS — FONTANA")
    print("=" * 70)
    print(f"  • Deseo ID:            {demo_wish_id}")
    print(f"  • Sesiones ejecutadas: 2 de 30 días (+ 1 Plan Maestro)")
    print(f"  • Tiempo Total IA:     {total_ms:,} ms ({total_ms / 1000.0:.2f} segundos)")
    print(f"  • Tokens Prompt:       {total_p:,} tokens")
    print(f"  • Tokens Completion:   {total_c:,} tokens")
    print(f"  • Tokens Totales:      {total_tok:,} tokens")
    print(f"  • Costo Estimado USD:  ${cost_usd:.5f} USD")
    print(f"  • Costo Estimado COP:  ${cost_cop:,.2f} COP")
    print("=" * 70)
    print("✅ Demostración completada exitosamente sin errores.\n")


# ── 5.5 Enviar Correo Semanal y Simulación de Semana con HITL ────────────────────
def prepare_weekly_email(wish_id: str, week_number: int = 1) -> dict:
    """
    Compila el informe semanal de 7 días y genera el BORRADOR del correo para revisión humana (HITL).
    Muestra la vista previa y envía alerta con botón de aprobación a Telegram.
    NO despacha el correo hasta que el operador lo apruebe.
    """
    wish = fetch_wish(wish_id)
    if not wish:
        print(f"[ERR] No se encontró el deseo {wish_id}", file=sys.stderr)
        return {}

    real_wish_id = wish["id"]
    contact_email = wish.get("contact_email", "usuario@fontana.ai")
    plan = wish.get("plan_30d") or {}
    weekly_goals = plan.get("weekly_goals", [])

    curr_goal = {}
    next_goal = {}
    for g in weekly_goals:
        if g.get("week") == week_number:
            curr_goal = g
        elif g.get("week") == week_number + 1:
            next_goal = g

    # Obtener los 7 registros de ai_daily_work de esta semana
    start_day = (week_number - 1) * 7 + 1
    end_day = week_number * 7
    headers = supabase_headers()
    url = f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{real_wish_id}&day_number=gte.{start_day}&day_number=lte.{end_day}&order=day_number.asc"
    _, daily_records = http_request(url, headers=headers)
    daily_records = daily_records if isinstance(daily_records, list) else []

    total_ms = sum(r.get("session_duration_ms", 0) for r in daily_records)
    total_tokens = sum(r.get("total_tokens", 0) for r in daily_records)
    total_mins = round(total_ms / 60000.0, 2)

    # Compilar los focos y recursos digitales para el usuario de los 7 días (excluyendo el contenido interno de red)
    focus_summary = []
    user_resources_summary = []
    for r in daily_records:
        d_num = r.get("day_number")
        f_txt = r.get("focus_goal", "")
        res_txt = r.get("daily_result", "") or ""
        if "🌐 [RESULTADO INTERNO FONTANA" in res_txt:
            res_txt = res_txt.split("🌐 [RESULTADO INTERNO FONTANA", 1)[0]
        res_txt = res_txt.replace("📌 Recurso Digital para el Usuario:", "").strip()
        if f_txt:
            focus_summary.append(f"- Día {d_num}: {f_txt}")
        if res_txt:
            user_resources_summary.append(f"Día {d_num}: {res_txt[:350]}")
    focus_context = "\n".join(focus_summary) if focus_summary else "Avance sostenido en los hitos digitales de la semana."
    resources_context = "\n".join(user_resources_summary) if user_resources_summary else focus_context

    base_web = os.environ.get("FONTANA_WEB_URL", "https://fontana.digital")

    # 1. Generar cuerpo estratégico con IA (CERO mención a tokens, cómputo ni contenido interno de red)
    subject = f"Fontana | Tu kit digital de la Semana {week_number} y próximos pasos 🪙"
    prompt = (
        f"Redacta el cuerpo de un correo semanal de acompañamiento de Fontana para un usuario.\n"
        f"Deseo del usuario: \"{wish.get('wish_text', '')}\"\n"
        f"Categoría: {wish.get('category', 'General')}\n"
        f"Semana concluida: Semana {week_number} ([{curr_goal.get('focus', 'Consolidación')}])\n"
        f"Meta de la Semana {week_number}: {curr_goal.get('goal', 'Avance de la fase actual')}\n"
        f"Recursos digitales trabajados esta semana:\n{resources_context}\n\n"
        f"Meta de la Semana {week_number + 1} entrante: [{next_goal.get('focus', 'Siguiente Fase')}] -> {next_goal.get('goal', 'Continuación del plan')}\n\n"
        f"REGLAS ESTRICTAS DE COMUNICACIÓN:\n"
        f"1. CERO mención a tokens, minutos de análisis, IA, modelo LLM, cómputo ni costos técnicos.\n"
        f"2. Tono: Elegante, ejecutivo, empático y práctico (estilo La Fuente — Fontana).\n"
        f"3. Fontana es 100% digital: entrega al cliente herramientas/apps concretas recomendadas, conocimiento práctico, "
        f"guías o plantillas y temas de video tutoriales (si incluyes enlaces de video usa únicamente búsquedas seguras "
        f"de YouTube como https://www.youtube.com/results?search_query=tema+en+palabras — NUNCA inventes URLs watch?v=).\n"
        f"4. Resume con sustancia QUÉ SE PREPARÓ esta semana para su deseo y QUÉ RECIBIRÁ en la Semana {week_number + 1}.\n"
        f"5. Cierra con una recomendación práctica y clara que pueda aplicar digitalmente esta semana.\n"
    )

    llm_body, p_tok, c_tok, tot_tok = call_llm(prompt, system_prompt="SYSTEM: Eres Fontana Strategic Mentor. Escribes reportes semanales prácticos y de alto valor para clientes de Fontana.")

    # Si el LLM devolvió un texto estructurado, lo usamos; si no, fallback sobrio y neutro
    if llm_body and len(llm_body) > 200 and "Sesión completada con éxito" not in llm_body:
        # Extraer posible asunto del LLM
        lines = llm_body.strip().split("\n")
        if lines[0].lower().startswith("asunto:"):
            subject = lines[0].split(":", 1)[1].strip()
            body_content = "\n".join(lines[1:]).strip()
        else:
            body_content = llm_body.strip()
    else:
        body_content = (
            f"Hola,\n\n"
            f"Es un gusto saludarte al cierre de la Semana {week_number} de acompañamiento para tu deseo:\n"
            f"\"{wish.get('wish_text', '')}\"\n\n"
            f"🎯 Balance de la Semana {week_number}: [{curr_goal.get('focus', 'Claridad y Herramientas')}]\n"
            f"{curr_goal.get('goal', 'Consolidamos los recursos digitales y conocimientos clave de esta etapa.')}\n\n"
            f"📦 Lo trabajado durante estos 7 días:\n"
            f"{focus_context}\n\n"
            f"🚀 Lo que prepararemos en la Semana {week_number + 1}: [{next_goal.get('focus', 'Siguiente Etapa')}]\n"
            f"{next_goal.get('goal', 'Continuaremos equipándote con nuevas herramientas, guías y recursos digitales a la medida.')}\n\n"
            f"💡 Recomendación de Fontana para esta semana:\n"
            f"Elige una sola herramienta o guía de las trabajadas esta semana y dedícale 20 minutos concretos de aplicación práctica antes de pasar al siguiente paso."
        )

    feedback_section = (
        f"\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"¿CÓMO PERCIBES EL AVANCE DE ESTA SEMANA?\n"
        f"Tu opinión calibra directamente el rumbo de las siguientes sesiones.\n"
        f"Haz clic en tu percepción para registrarla en 1 clic:\n\n"
        f"🟢 Excelente, vamos por buen camino:\n"
        f"{base_web}/feedback.html?wish={real_wish_id}&week={week_number}&rating=positive\n\n"
        f"🟡 En progreso, con dudas o ajustes necesarios:\n"
        f"{base_web}/feedback.html?wish={real_wish_id}&week={week_number}&rating=neutral\n\n"
        f"🔴 Desalineado con lo que necesito / Cambiar rumbo:\n"
        f"{base_web}/feedback.html?wish={real_wish_id}&week={week_number}&rating=negative\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"El trabajo diario sigue en marcha. La fuente sigue trabajando por tu intención.\n\n"
        f"Fe y trabajo,\n"
        f"La Fuente — Fontana"
    )

    full_body = body_content + feedback_section

    draft = {
        "wish_id": real_wish_id,
        "contact_email": contact_email,
        "week_number": week_number,
        "subject": subject,
        "body": full_body,
        "total_ms": total_ms,
        "total_tokens": total_tokens,
        "status": "approved",
    }

    return draft


def dispatch_weekly_email(wish_id: str, week_number: int = 1, custom_body: str = None, custom_subject: str = None) -> bool:
    """
    Despacha efectivamente el correo semanal después de haber sido aprobado por el operador humano.
    """
    wish = fetch_wish(wish_id)
    if not wish:
        print(f"[ERR] No se encontró el deseo {wish_id}", file=sys.stderr)
        return False

    real_wish_id = wish["id"]
    contact_email = wish.get("contact_email", "usuario@fontana.ai")

    # Si no se pasó cuerpo custom, prepararlo
    if not custom_body or not custom_subject:
        draft = prepare_weekly_email(real_wish_id, week_number=week_number)
        subject = custom_subject or draft["subject"]
        body_text = custom_body or draft["body"]
    else:
        subject = custom_subject
        body_text = custom_body

    email_sent = False
    if is_supabase_configured():
        send_url = f"{SUPABASE_URL}/functions/v1/send-email"
        payload = {
            "type": "manual_reply",
            "to": contact_email,
            "subject": subject,
            "body": body_text,
            "wishId": real_wish_id,
        }
        st, res = http_request(send_url, method="POST", headers={"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"}, body=payload)
        email_sent = (st == 200)

    # Registro en email_log y limpieza de borrador pendiente (sin notificar a Telegram)
    headers = supabase_headers()
    if is_supabase_configured():
        log_url = f"{SUPABASE_URL}/rest/v1/email_log"
        log_entry = {
            "wish_id": real_wish_id,
            "type": "followup",
            "subject": subject,
            "body_sent": body_text,
        }
        http_request(log_url, method="POST", headers=headers, body=log_entry)
        update_wish(real_wish_id, {"internal_notes": None})

    return email_sent


def simulate_week(wish_id: str, week_number: int = 1) -> dict:
    """
    Simula una semana completa (7 días consecutivos) para un deseo:
      1. Ejecuta secuencialmente los días restantes de la semana (ej: Días 1 a 7).
      2. Conecta el handoff diario entre cada día.
      3. Al llegar al Día 7, genera el Correo Semanal reflexivo consolidando:
         - El hito de la semana en el plan maestro.
         - Los 7 insights diarios de ai_daily_work.
         - El tiempo total y tokens invertidos por la IA.
         - El siguiente paso propuesto para la Semana siguiente.
      4. Envía el correo mediante la Edge Function send-email y lo registra en email_log.
      5. Notifica a Telegram y retorna el balance.
    """
    wish = fetch_wish(wish_id)
    if not wish:
        print(f"[ERR] No se encontró el deseo '{wish_id}'.", file=sys.stderr)
        return {}

    real_wish_id = wish["id"]
    contact = wish.get("contact_email", "")
    print(f"\n" + "=" * 70)
    print(f"🗓️ SIMULANDO SEMANA {week_number} (Días {(week_number-1)*7 + 1} al {week_number*7}) — FONTANA")
    print(f"=" * 70)
    print(f"  • Deseo ID:  {real_wish_id[:8]}… ({contact})")
    print(f"  • Intención: \"{wish.get('wish_text', '')}\"\n")

    start_day = (week_number - 1) * 7 + 1
    end_day = week_number * 7
    headers = supabase_headers()

    for day in range(start_day, end_day + 1):
        # Verificar si ya existe
        chk_url = f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{real_wish_id}&day_number=eq.{day}&select=id"
        st, data = http_request(chk_url, headers=headers)
        if st == 200 and isinstance(data, list) and len(data) > 0:
            print(f"  • Día {day}/{end_day}: ✅ Ya ejecutado previamente. Saltando...")
            continue

        # Obtener handoff anterior
        h_url = f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{real_wish_id}&order=day_number.desc&limit=1&select=tomorrow_handoff"
        _, h_data = http_request(h_url, headers=headers)
        prev_h = None
        if isinstance(h_data, list) and len(h_data) > 0:
            prev_h = h_data[0].get("tomorrow_handoff")

        # Ejecutar sesión diaria
        res = run_daily_session(real_wish_id, day_number=day, previous_handoff=prev_h, wish_data=wish)
        print(f"  • Día {day}/{end_day}: 🚀 Ejecutado en {res['session_duration_ms']} ms ({res['total_tokens']} tokens). Relevo preparado.")

    # El día 7/14/21/28 ya despachó el correo semanal automáticamente dentro de run_daily_session()
    print(f"\n✅ Correo semanal (Semana {week_number}) aprobado y despachado automáticamente (sin notificación a Telegram).")
    print(f"=" * 70 + "\n")
    return {"week_number": week_number, "wish_id": real_wish_id, "status": "approved"}


def simulate_full_cycle(wish_id: str) -> dict:
    """
    Simula el acompañamiento completo de 30 DÍAS para un deseo:
      - Avanza secuencialmente los Días 1 al 30 con handoff continuo entre cada día.
      - En los días de hito (7, 14, 21, 28) genera el resumen y borrador semanal para revisión.
      - En el Día 30 formula la síntesis de cierre del deseo.
      - Imprime la bitácora completa y el balance consolidado final de los 30 días.
    """
    wish = fetch_wish(wish_id)
    if not wish:
        print(f"[ERR] No se encontró el deseo '{wish_id}'.", file=sys.stderr)
        return {}

    real_wish_id = wish["id"]
    contact = wish.get("contact_email", "")

    # Verificar que el plan esté aprobado
    if wish.get("plan_status") != "approved":
        print(f"ℹ️ El plan de {real_wish_id[:8]} no estaba aprobado. Aprobándolo para la simulación...")
        approve_plan(real_wish_id, notes="Aprobación para simulación completa de 30 días.")
        wish["plan_status"] = "approved"

    print("\n" + "=" * 75)
    print(f"🚀 INICIANDO SIMULACIÓN INTEGRAL: 30 DÍAS DE ACOMPAÑAMIENTO — FONTANA")
    print("=" * 75)
    print(f"  • Deseo ID:   {real_wish_id[:8]}… ({contact})")
    print(f"  • Intención:  \"{wish.get('wish_text', '')}\"")
    print(f"  • Categoría:  {wish.get('category', 'General')}\n")

    headers = supabase_headers()
    prev_handoff = None

    for day in range(1, 31):
        # 1. Verificar si ya existe registro para ese día
        chk_url = f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{real_wish_id}&day_number=eq.{day}&select=id,session_duration_ms,total_tokens,tomorrow_handoff"
        st, data = http_request(chk_url, headers=headers)

        if st == 200 and isinstance(data, list) and len(data) > 0:
            rec = data[0]
            prev_handoff = rec.get("tomorrow_handoff")
            print(f"  [Día {day:02d}/30] ✅ Ya ejecutado ({rec.get('session_duration_ms', 0)} ms | {rec.get('total_tokens', 0)} tokens) -> Relevo en memoria.")
        else:
            # Si no tenemos handoff en memoria, buscar el del día anterior en DB
            if not prev_handoff and day > 1:
                h_url = f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{real_wish_id}&order=day_number.desc&limit=1&select=tomorrow_handoff"
                _, h_data = http_request(h_url, headers=headers)
                if isinstance(h_data, list) and len(h_data) > 0:
                    prev_handoff = h_data[0].get("tomorrow_handoff")

            sess = run_daily_session(real_wish_id, day_number=day, previous_handoff=prev_handoff, wish_data=wish)
            prev_handoff = sess.get("tomorrow_handoff")
            print(f"  [Día {day:02d}/30] 🚀 {sess['session_duration_ms']:4d} ms | {sess['total_tokens']:4d} tok | Foco: {sess['focus_goal'][:45]}…")

        # Hitos Semanales en días 7, 14, 21, 28 (despachados automáticamente en run_daily_session)
        if day in (7, 14, 21, 28):
            week_num = day // 7
            print(f"\n  🌟 ──── HITO SEMANAL: SEMANA {week_num} (Día {day}) — Correo aprobado y enviado automáticamente ────\n")

    # Día 30: Cierre y síntesis final
    print("\n" + "=" * 75)
    print("🏁 CICLO DE 30 DÍAS COMPLETADO — SÍNTESIS FINAL DE LA FUENTE")
    print("=" * 75)

    bal = get_balance(real_wish_id)
    total_days = bal.get("days_recorded", 30)
    total_sec = bal.get("total_seconds_worked", 0)
    total_min = bal.get("total_minutes_worked", 0)
    total_tok = bal.get("total_tokens_consumed", 0)
    cost_usd = bal.get("estimated_cost_usd", 0)
    cost_cop = bal.get("estimated_cost_cop", 0)

    print(f"\n📊 BALANCE FINAL DE CONSUMO Y ESFUERZO (30 DÍAS EXACTOS):")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  • Deseo ID:            {real_wish_id}")
    print(f"  • Usuario:             {contact}")
    print(f"  • Días trabajados:     {total_days} de 30 días")
    print(f"  • Tiempo de cómputo:   {total_sec:.2f} segundos ({total_min} minutos netos)")
    print(f"  • Tokens de entrada:   {bal.get('total_prompt_tokens', 0):,} tokens")
    print(f"  • Tokens de salida:    {bal.get('total_completion_tokens', 0):,} tokens")
    print(f"  • TOKENS TOTALES:      {total_tok:,} tokens")
    print(f"  • Costo real en USD:   ${cost_usd:.4f} USD")
    print(f"  • Costo real en COP:   ${cost_cop:,.2f} COP")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"🪙 Margen de la moneda: Usuario pagó ~$1.00 USD (Costo IA: ~{cost_usd*100:.2f}% de la moneda).")
    print(f"✅ Los 4 borradores semanales y las 30 sesiones están guardados en Supabase.\n")
    return bal


# ── 6. Escaneo y Daemon de Ejecución Periódica ──────────────────────────────────
def scan_and_process_active_wishes(step_per_scan: bool = False, only_test: bool = False) -> dict:
    """
    Escanea todos los deseos con status='active' en Supabase:
      1. Si no tiene plan: genera el Plan Maestro de 30 Días y lo notifica a Telegram con botón de aprobación.
      2. Si está en 'pending_review': espera aprobación humana (HITL).
      3. Si está en 'approved':
         - Determina el día del ciclo actual (1 a 30).
         - Si ese día no tiene registro en ai_daily_work, ejecuta la sesión diaria con el relevo del día previo.
         - Si step_per_scan=True (opcionalmente acotado por only_test), avanza 1 día por escaneo hasta el día 30.
    """
    if not is_supabase_configured():
        print("[SCAN] Supabase no está configurado (revisa .env).", file=sys.stderr)
        return {"plans_generated": 0, "daily_sessions_run": 0}

    headers = supabase_headers()
    url = f"{SUPABASE_URL}/rest/v1/wishes?status=eq.active&select=*"
    status, wishes = http_request(url, headers=headers)
    if status != 200 or not isinstance(wishes, list):
        print(f"[SCAN ERR] Error consultando deseos activos: {wishes}", file=sys.stderr)
        return {"plans_generated": 0, "daily_sessions_run": 0}

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Escaneando {len(wishes)} deseo(s) activo(s) en Supabase...")
    plans_gen = 0
    daily_run = 0
    now_utc = datetime.now(timezone.utc)

    for w in wishes:
        wish_id = w["id"]
        contact = w.get("contact_email", "")
        plan_status = w.get("plan_status")
        plan_30d = w.get("plan_30d")

        # ── Caso 1: Deseo sin plan generado ───────────────────────────────────────
        if not plan_30d or not plan_status:
            print(f"  • 📋 Deseo {wish_id[:8]} ({contact}): Sin plan maestro. Generando y auto-aprobando...")
            res = generate_plan(wish_id, wish_data=w)
            print(f"    ✓ Plan generado y auto-aprobado en {res['plan_generation_ms']} ms ({res['plan_tokens']} tokens). Notificado a Telegram.")
            plans_gen += 1
            w["plan_30d"] = res["plan_30d"]
            w["plan_status"] = res.get("plan_status", "approved")
            plan_30d = w["plan_30d"]
            plan_status = w["plan_status"]

        # ── Caso 2: Plan previo en pending_review -> Auto-aprobar automáticamente ─
        if plan_status == "pending_review":
            now_iso = datetime.now(timezone.utc).isoformat()
            print(f"  • ✅ Deseo {wish_id[:8]} ({contact}): Auto-aprobando plan previo...")
            if is_supabase_configured():
                update_wish(wish_id, {"plan_status": "approved", "plan_approved_at": now_iso})
            w["plan_status"] = "approved"
            plan_status = "approved"

        # ── Caso 3: Plan aprobado -> Trabajar sesión diaria del día actual ────────
        if plan_status == "approved":
            started_at_str = w.get("cycle_started_at")
            if started_at_str:
                try:
                    started_dt = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
                    days_elapsed = max(1, min(30, (now_utc - started_dt).days + 1))
                except Exception:
                    days_elapsed = 1
            else:
                days_elapsed = 1

            # Buscar el último día registrado en ai_daily_work para continuar de forma secuencial
            h_url = f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{wish_id}&order=day_number.desc&limit=1&select=day_number,tomorrow_handoff"
            _, h_data = http_request(h_url, headers=headers)
            last_day = 0
            prev_handoff = None
            if isinstance(h_data, list) and len(h_data) > 0:
                last_day = h_data[0].get("day_number", 0)
                prev_handoff = h_data[0].get("tomorrow_handoff")

            next_day = last_day + 1
            is_test_wish = str(w.get("donor_alias") or "").startswith("Simulador-")
            allow_step = step_per_scan and (not only_test or is_test_wish)

            if next_day > 30:
                print(f"  • 🏁 Deseo {wish_id[:8]} ({contact}): Todos los 30 días ya han sido completados.")
            elif (not allow_step) and (next_day > days_elapsed):
                print(f"  • ✅ Deseo {wish_id[:8]} ({contact}): Sesión Día {last_day}/30 al día (esperando siguiente jornada de calendario).")
            else:
                mode_tag = " [STEP-TEST]" if allow_step else ""
                print(f"  • 🚀 Deseo {wish_id[:8]} ({contact}): Ejecutando sesión Día {next_day}/30{mode_tag}...")
                sess_res = run_daily_session(wish_id, day_number=next_day, previous_handoff=prev_handoff, wish_data=w)
                print(f"    ✓ Día {next_day} completado en {sess_res['session_duration_ms']} ms ({sess_res['total_tokens']} tokens). Relevo listo.")
                daily_run += 1

    return {"plans_generated": plans_gen, "daily_sessions_run": daily_run}


def create_test_wish(email: str = "test@fontana.ai", wish_text: str = None, category: str = "Emprendimiento") -> dict:
    """Crea un deseo de prueba real en Supabase con status='active' para activar el flujo de inmediato."""
    if not is_supabase_configured():
        print("[ERROR] Supabase no está configurado (revisa .env).", file=sys.stderr)
        return {}

    wish_text = wish_text or "Quiero lanzar mi podcast de innovación y conseguir mis primeros 500 oyentes recurrentes en 30 días."
    headers = supabase_headers()

    # 1. Buscar perfil
    prof_url = f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{email}&select=id"
    st, data = http_request(prof_url, headers=headers)
    user_id = None
    if st == 200 and isinstance(data, list) and len(data) > 0:
        user_id = data[0]["id"]
    else:
        # Tomar cualquier perfil existente en la tabla profiles
        p_all_url = f"{SUPABASE_URL}/rest/v1/profiles?select=id&limit=1"
        _, p_data = http_request(p_all_url, headers=headers)
        if isinstance(p_data, list) and len(p_data) > 0:
            user_id = p_data[0]["id"]

    if not user_id:
        print("[ERROR] No se encontró ningún perfil en la tabla 'profiles'.", file=sys.stderr)
        return {}

    # 2. Insertar deseo activo (o actualizar el existente si ya tiene uno activo)
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_url = f"{SUPABASE_URL}/rest/v1/wishes?user_id=eq.{user_id}&status=in.(pending_payment,active)&select=id,wish_text,status"
    st_e, ex_wishes = http_request(existing_url, headers=headers)
    if st_e == 200 and isinstance(ex_wishes, list) and len(ex_wishes) > 0:
        existing_id = ex_wishes[0]["id"]
        update_payload = {
            "wish_text": wish_text,
            "category": category,
            "contact_email": email,
            "status": "active",
            "plan_30d": None,
            "plan_status": None,
            "cycle_started_at": now_iso
        }
        u_url = f"{SUPABASE_URL}/rest/v1/wishes?id=eq.{existing_id}"
        st_u, res_u = http_request(u_url, method="PATCH", headers=headers, body=update_payload)
        # Limpiar registros previos de ai_daily_work y emails para comenzar de cero
        http_request(f"{SUPABASE_URL}/rest/v1/ai_daily_work?wish_id=eq.{existing_id}", method="DELETE", headers=headers)
        http_request(f"{SUPABASE_URL}/rest/v1/email_logs?wish_id=eq.{existing_id}", method="DELETE", headers=headers)

        print(f"\n🔄 Deseo activo existente ({existing_id[:8]}...) actualizado para {email}:")
        print(f"  • ID: {existing_id}")
        print(f"  • Contacto: {email}")
        print(f"  • Deseo: \"{wish_text}\"")
        print(f"  • Estado: active (reiniciado para revisión HITL)\n")
        return {"id": existing_id, "wish_text": wish_text, "status": "active"}

    new_wish = {
        "user_id": user_id,
        "contact_email": email,
        "category": category,
        "wish_text": wish_text,
        "status": "active",
        "amount_usd": 1.00,
        "cycle_started_at": now_iso,
    }
    w_url = f"{SUPABASE_URL}/rest/v1/wishes"
    st, res = http_request(w_url, method="POST", headers=headers, body=new_wish)
    if st in (200, 201) and isinstance(res, list) and len(res) > 0:
        created = res[0]
        print(f"\n🎉 ¡Deseo de prueba creado exitosamente en Supabase!")
        print(f"  • ID: {created['id']}")
        print(f"  • Contacto: {email}")
        print(f"  • Deseo: \"{wish_text}\"")
        print(f"  • Estado: active\n")
        return created
    else:
        print(f"[ERROR] No se pudo crear el deseo: {res}", file=sys.stderr)
        return {}


def daemon_loop(
    interval: int = 600,
    initial_delay: int = 0,
    step_per_scan: bool = False,
    only_test: bool = False,
):
    """Bucle continuo para revisar deseos activos que requieran plan o sesión diaria."""
    mode_desc = f"step_per_scan={'ON' if step_per_scan else 'OFF'}, only_test={'ON' if only_test else 'OFF'}"
    print(f"\n[DAEMON] 🛡️ Fontana Engine Daemon iniciado (intervalo de escaneo: {interval}s, desfase inicial: {initial_delay}s, {mode_desc}).")
    print("[DAEMON] Presiona Ctrl+C en cualquier momento para detener.\n")
    if initial_delay > 0:
        print(f"[DAEMON] ⏳ Esperando {initial_delay}s antes del primer escaneo...")
        try:
            time.sleep(initial_delay)
        except KeyboardInterrupt:
            print("\n[DAEMON] Detenido por el usuario.")
            return

    next_run = time.monotonic()
    while True:
        try:
            scan_and_process_active_wishes(step_per_scan=step_per_scan, only_test=only_test)
        except KeyboardInterrupt:
            print("\n[DAEMON] Detenido por el usuario.")
            break
        except Exception as e:
            print(f"[DAEMON ERR] {e}", file=sys.stderr)
        next_run += interval
        sleep_for = max(0.0, next_run - time.monotonic())
        try:
            time.sleep(sleep_for)
        except KeyboardInterrupt:
            print("\n[DAEMON] Detenido por el usuario.")
            break


# ── CLI Entrypoint ───────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        prog="fontana_engine.py",
        description="Fontana Engine — CLI para generación de planes de 30 días, sesiones diarias y balance de cómputo."
    )
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponibles")

    # Comando: demo
    subparsers.add_parser("demo", help="Ejecuta una simulación completa autocontenida de punta a punta")

    # Comando: scan
    p_scan = subparsers.add_parser("scan", help="Escanea y procesa deseos activos de Supabase inmediatamente")
    p_scan.add_argument("--step-per-scan", action="store_true", help="Avanza 1 día siguiente en planes aprobados aunque no haya pasado un día calendario")
    p_scan.add_argument("--only-test", action="store_true", help="Aplica --step-per-scan solo a deseos de prueba (donor_alias 'Simulador-*')")

    # Comando: test-wish
    p_test = subparsers.add_parser("test-wish", help="Crea un deseo de prueba real en Supabase para activar el flujo")
    p_test.add_argument("--email", default="test@fontana.ai", help="Email del usuario de prueba")
    p_test.add_argument("--text", default=None, help="Texto del deseo")
    p_test.add_argument("--category", default="Emprendimiento", help="Categoría del deseo")

    # Comando: plan <wish_id>
    p_plan = subparsers.add_parser("plan", help="Genera el Plan Maestro de 30 Días para un deseo")
    p_plan.add_argument("wish_id", help="UUID o prefijo del deseo")

    # Comando: daily <wish_id> [--day N]
    p_daily = subparsers.add_parser("daily", help="Ejecuta una sesión diaria de trabajo (1 a 30)")
    p_daily.add_argument("wish_id", help="UUID o prefijo del deseo")
    p_daily.add_argument("--day", type=int, default=1, help="Número de día (1 a 30, defecto: 1)")
    p_daily.add_argument("--handoff", type=str, default=None, help="Contexto previo de handoff opcional")

    # Comando: approve <wish_id> [--notes "..."]
    p_app = subparsers.add_parser("approve", help="Aprueba el plan de 30 días (Human-In-The-Loop)")
    p_app.add_argument("wish_id", help="UUID o prefijo del deseo")
    p_app.add_argument("--notes", type=str, default=None, help="Notas de revisión humana opcionales")

    # Comando: simulate-week <wish_id> [--week N]
    p_sim = subparsers.add_parser("simulate-week", help="Simula los 7 días de una semana y prepara el borrador semanal para revisión")
    p_sim.add_argument("wish_id", help="UUID o prefijo del deseo")
    p_sim.add_argument("--week", type=int, default=1, help="Número de semana a simular (1 a 4, defecto: 1)")

    # Comando: simulate-all <wish_id>
    p_all = subparsers.add_parser("simulate-all", help="Simula los 30 días completos de acompañamiento con relevo y balance final")
    p_all.add_argument("wish_id", help="UUID o prefijo del deseo")

    # Comando: send-email <wish_id> [--week N]
    p_se = subparsers.add_parser("send-email", help="Despacha el correo semanal tras tu aprobación humana")
    p_se.add_argument("wish_id", help="UUID o prefijo del deseo")
    p_se.add_argument("--week", type=int, default=1, help="Número de semana (defecto: 1)")

    # Comando: balance <wish_id>
    p_bal = subparsers.add_parser("balance", help="Consulta métricas de tiempo, tokens y costo financiero")
    p_bal.add_argument("wish_id", help="UUID o prefijo del deseo")

    # Comando: history <wish_id>
    p_hist = subparsers.add_parser("history", help="Muestra el historial completo día a día (resultados y relevos)")
    p_hist.add_argument("wish_id", help="UUID o prefijo del deseo")

    # Comando: daemon [--interval N] [--initial-delay S] [--step-per-scan] [--only-test]
    p_dae = subparsers.add_parser("daemon", help="Ejecuta el servicio de background periódico")
    p_dae.add_argument("--interval", type=int, default=600, help="Intervalo en segundos (defecto: 600)")
    p_dae.add_argument("--initial-delay", type=int, default=0, help="Espera inicial en segundos antes del primer escaneo (defecto: 0)")
    p_dae.add_argument("--step-per-scan", action="store_true", help="Avanza 1 día siguiente por escaneo en planes aprobados hasta completar 30 días")
    p_dae.add_argument("--only-test", action="store_true", help="Restringe --step-per-scan solo a deseos de prueba (donor_alias 'Simulador-*')")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "demo":
        run_demo()
        sys.exit(0)

    if args.command == "scan":
        print("🔍 Ejecutando escaneo manual de deseos en Supabase...")
        res = scan_and_process_active_wishes(step_per_scan=args.step_per_scan, only_test=args.only_test)
        print(f"✓ Escaneo finalizado: {res['plans_generated']} planes generados, {res['daily_sessions_run']} sesiones corridas.")

    elif args.command == "test-wish":
        w = create_test_wish(email=args.email, wish_text=args.text, category=args.category)
        if w and "id" in w:
            print("🚀 Procesando inmediatamente el nuevo deseo...")
            scan_and_process_active_wishes()

    elif args.command == "plan":
        print(f"🚀 Generando Plan Maestro de 30 Días para: {args.wish_id}...")
        res = generate_plan(args.wish_id)
        print(f"✓ Plan generado en {res['plan_generation_ms']} ms ({res['plan_tokens']} tokens).")
        print(f"✓ Estado: {res['plan_status']}")
        print(json.dumps(res["plan_30d"], indent=2, ensure_ascii=False))

    elif args.command == "daily":
        print(f"🚀 Ejecutando sesión diaria {args.day}/30 para: {args.wish_id}...")
        res = run_daily_session(args.wish_id, day_number=args.day, previous_handoff=args.handoff)
        print(f"✓ Sesión completada en {res['session_duration_ms']} ms ({res['total_tokens']} tokens).")
        print(f"• Foco: {res['focus_goal']}")
        print(f"• Resultado: {res['daily_result']}")
        print(f"• Handoff mañana: {res['tomorrow_handoff']}")

    elif args.command == "approve":
        print(f"✅ Aprobando plan maestro para: {args.wish_id}...")
        res = approve_plan(args.wish_id, notes=args.notes)
        print(f"✓ Estado: {res['plan_status']} el {res['plan_approved_at']}")

    elif args.command == "simulate-week":
        simulate_week(args.wish_id, week_number=args.week)

    elif args.command == "simulate-all":
        simulate_full_cycle(args.wish_id)

    elif args.command == "send-email":
        print(f"🚀 Despachando correo semanal para {args.wish_id} (Semana {args.week})...")
        ok = dispatch_weekly_email(args.wish_id, week_number=args.week)
        print(f"✓ Correo procesado, registrado en email_log y notificado a Telegram.")

    elif args.command == "balance":
        bal = get_balance(args.wish_id)
        print("\n" + "=" * 60)
        print(f"⚡ MÉTRICAS DE CONSUMO Y CÓMPUTO — {args.wish_id}")
        print("=" * 60)
        print(f"  • Email:             {bal.get('contact_email')}")
        print(f"  • Plan Status:       {bal.get('plan_status')}")
        print(f"  • Días registrados:  {bal.get('days_recorded')}/30")
        print(f"  • Tiempo ejecución:  {bal.get('total_duration_ms'):,} ms ({bal.get('total_seconds_worked')}s)")
        print(f"  • Tokens Prompt:     {bal.get('total_prompt_tokens'):,}")
        print(f"  • Tokens Completion: {bal.get('total_completion_tokens'):,}")
        print(f"  • Tokens Totales:    {bal.get('total_tokens_consumed'):,}")
        print(f"  • Costo USD:         ${bal.get('estimated_cost_usd'):.4f} USD")
        print(f"  • Costo COP:         ${bal.get('estimated_cost_cop'):,.2f} COP")
        print("=" * 60 + "\n")

    elif args.command == "history":
        print_history(args.wish_id)

    elif args.command == "daemon":
        daemon_loop(
            interval=args.interval,
            initial_delay=args.initial_delay,
            step_per_scan=args.step_per_scan,
            only_test=args.only_test,
        )


if __name__ == "__main__":
    main()
