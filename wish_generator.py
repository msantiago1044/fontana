#!/usr/bin/env python3
"""
Fontana Test Wish Generator — Generador periódico de deseos de prueba en Supabase.

Crea usuarios sintéticos (@fontana.test) y un deseo activo nuevo en cada ciclo
para respetar la restricción única one_active_wish_per_user sin sobrescribir
deseos reales existentes. Pensado para correr desfasado 60s antes del daemon.
"""

import argparse
import os
import random
import sys
import time
import uuid
from datetime import datetime, timezone

from fontana_engine import (
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
    http_request,
    is_supabase_configured,
    supabase_headers,
)

SAMPLE_WISHES = [
    ("Emprendimiento", "Quiero conseguir mis primeros 10 clientes recurrentes para mi servicio de diseño web en 30 días."),
    ("Finanzas", "Quiero organizar mis finanzas personales, eliminar gastos hormiga y ahorrar mis primeros $500 USD este mes."),
    ("Carrera", "Quiero preparar mi portafolio y conseguir al menos 5 entrevistas técnicas en empresas remotas."),
    ("Salud", "Quiero establecer una rutina constante de ejercicio 4 veces por semana y mejorar mi calidad de sueño."),
    ("Creatividad", "Quiero estructurar, grabar y publicar los primeros 4 episodios de mi newsletter y canal educativo."),
    ("Aprendizaje", "Quiero dominar los fundamentos de automatización con Python e IA construyendo un proyecto funcional."),
    ("Emprendimiento", "Quiero validar una oferta digital B2B enviando 30 propuestas personalizadas y cerrando 2 pilotos."),
    ("Productividad", "Quiero recuperar 2 horas diarias de foco profundo eliminando distracciones y cerrando pendientes clave."),
]


def _auth_admin_headers() -> dict:
    """Return headers required for Supabase Auth Admin endpoints."""
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _create_synthetic_user(email: str, full_name: str) -> str:
    """Create a synthetic auth user and ensure its corresponding profile row exists."""
    auth_url = f"{SUPABASE_URL}/auth/v1/admin/users"
    auth_body = {
        "email": email,
        "password": f"FontanaTest!{uuid.uuid4().hex[:12]}",
        "email_confirm": True,
        "user_metadata": {"full_name": full_name, "synthetic": True},
    }
    st, resp = http_request(auth_url, method="POST", headers=_auth_admin_headers(), body=auth_body)
    if st not in (200, 201) or not isinstance(resp, dict) or not resp.get("id"):
        raise RuntimeError(f"Error creando usuario sintético ({st}): {resp}")

    user_id = resp["id"]
    prof_check_url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}&select=id"
    st_p, prof_rows = http_request(prof_check_url, headers=supabase_headers())
    if st_p == 200 and isinstance(prof_rows, list) and len(prof_rows) == 0:
        ins_url = f"{SUPABASE_URL}/rest/v1/profiles"
        st_ins, res_ins = http_request(
            ins_url,
            method="POST",
            headers=supabase_headers(),
            body={
                "id": user_id,
                "email": email,
                "full_name": full_name,
                "auth_provider": "test_generator",
            },
        )
        if st_ins not in (200, 201):
            raise RuntimeError(f"Error creando perfil sintético ({st_ins}): {res_ins}")

    return user_id


def create_generated_wish(auto_approve: bool = False) -> dict:
    """Create a fresh synthetic user and insert a brand-new active wish in Supabase."""
    if not is_supabase_configured():
        raise RuntimeError("Supabase no está configurado en .env.")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    suffix = uuid.uuid4().hex[:6]
    email = f"sim.{stamp}.{suffix}@fontana.test"
    full_name = f"Tester Fontana {suffix.upper()}"
    category, base_wish = random.choice(SAMPLE_WISHES)
    wish_text = f"{base_wish} [Lote prueba {stamp}-{suffix}]"

    user_id = _create_synthetic_user(email=email, full_name=full_name)
    now_iso = datetime.now(timezone.utc).isoformat()

    payload = {
        "user_id": user_id,
        "contact_email": email,
        "category": category,
        "wish_text": wish_text,
        "status": "active",
        "amount_usd": 1.00,
        "donor_alias": f"Simulador-{suffix}",
        "cycle_started_at": now_iso,
        "plan_30d": None,
        "plan_status": "approved" if auto_approve else None,
    }

    wishes_url = f"{SUPABASE_URL}/rest/v1/wishes"
    st, res = http_request(wishes_url, method="POST", headers=supabase_headers(), body=payload)
    if st not in (200, 201) or not isinstance(res, list) or not res:
        raise RuntimeError(f"Error insertando deseo ({st}): {res}")

    created = res[0]
    now_local = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_local}] 🌱 Nuevo deseo generado: {created['id'][:8]} ({email}) [{category}]")
    print(f"    \"{_truncate(wish_text, 90)}\"")
    return created


def _truncate(text: str, limit: int) -> str:
    """Truncate text cleanly for single-line log output."""
    return text if len(text) <= limit else text[: limit - 3] + "..."


def cleanup_synthetic_wishes() -> int:
    """Delete all synthetic @fontana.test auth users (cascades profiles, wishes, daily work)."""
    if not is_supabase_configured():
        raise RuntimeError("Supabase no está configurado en .env.")

    url = f"{SUPABASE_URL}/rest/v1/profiles?email=like.*@fontana.test&select=id,email"
    st, rows = http_request(url, headers=supabase_headers())
    if st != 200 or not isinstance(rows, list):
        raise RuntimeError(f"Error listando perfiles sintéticos ({st}): {rows}")

    deleted = 0
    for row in rows:
        uid = row["id"]
        del_url = f"{SUPABASE_URL}/auth/v1/admin/users/{uid}"
        st_del, res_del = http_request(del_url, method="DELETE", headers=_auth_admin_headers())
        if st_del in (200, 204):
            deleted += 1
        else:
            print(f"[CLEANUP WARN] No se pudo borrar {row.get('email')}: {st_del} {res_del}", file=sys.stderr)

    print(f"[CLEANUP] 🧹 Eliminados {deleted} usuario(s)/deseo(s) sintéticos (@fontana.test).")
    return deleted


def generator_loop(interval: int = 600, initial_delay: int = 0, auto_approve: bool = False):
    """Run periodic wish generation using monotonic timing to stay synced ahead of the daemon."""
    print(f"\n[GENERATOR] 🪙 Generador automático iniciado (intervalo: {interval}s, desfase inicial: {initial_delay}s).")
    print("[GENERATOR] Presiona Ctrl+C en cualquier momento para detener.\n")

    if initial_delay > 0:
        print(f"[GENERATOR] ⏳ Esperando {initial_delay}s antes del primer deseo...")
        try:
            time.sleep(initial_delay)
        except KeyboardInterrupt:
            print("\n[GENERATOR] Detenido por el usuario.")
            return

    next_run = time.monotonic()
    while True:
        try:
            create_generated_wish(auto_approve=auto_approve)
        except KeyboardInterrupt:
            print("\n[GENERATOR] Detenido por el usuario.")
            break
        except Exception as e:
            print(f"[GENERATOR ERR] {e}", file=sys.stderr)

        next_run += interval
        sleep_for = max(0.0, next_run - time.monotonic())
        try:
            time.sleep(sleep_for)
        except KeyboardInterrupt:
            print("\n[GENERATOR] Detenido por el usuario.")
            break


def main():
    """CLI entrypoint for the synthetic test wish generator."""
    if sys.stdout and hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser(
        prog="wish_generator.py",
        description="Generador automático de deseos de prueba para Fontana Engine.",
    )
    sub = parser.add_subparsers(dest="command")

    p_once = sub.add_parser("once", help="Genera un único deseo de prueba inmediatamente")
    p_once.add_argument("--auto-approve", action="store_true", help="Marca el plan como aprobado al crear el deseo")

    p_run = sub.add_parser("run", help="Genera deseos periódicamente en bucle")
    p_run.add_argument("--interval", type=int, default=600, help="Intervalo en segundos (defecto: 600 = 10 min)")
    p_run.add_argument("--initial-delay", type=int, default=0, help="Espera inicial en segundos (defecto: 0)")
    p_run.add_argument("--auto-approve", action="store_true", help="Marca el plan como aprobado al crear el deseo")

    sub.add_parser("cleanup", help="Elimina todos los usuarios y deseos sintéticos (@fontana.test)")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "once":
        create_generated_wish(auto_approve=args.auto_approve)
    elif args.command == "run":
        generator_loop(
            interval=args.interval,
            initial_delay=args.initial_delay,
            auto_approve=args.auto_approve,
        )
    elif args.command == "cleanup":
        cleanup_synthetic_wishes()


if __name__ == "__main__":
    main()
