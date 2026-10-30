"""Prepara la hoja Indicadores desde el contrato validado de Perfil de Tienda.

No modifica regiones, DM, ubicaciones ni el Excel. Exporta CSV para pegar sus
columnas en Indicadores, o JSON para una integración controlada del CMS.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ACTUALIZAR_MAPA import read_locations
from schema import METRIC_HEADERS


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def average(values):
    values = [v for v in values if numeric(v)]
    return sum(values) / len(values) if values else None


def month_end(year, month):
    return f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"


def duration(seconds):
    if not numeric(seconds):
        return None
    seconds = round(seconds)
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def build_rows(payload, stores, commit="", source_sha256=""):
    if payload.get("schemaVersion") != 2:
        raise ValueError("Se requiere dashboard.json de Perfil de Tienda, contrato 2.")
    headers = payload["metricHeaders"]
    if len(headers) != len(set(headers)):
        raise ValueError("Perfil contiene encabezados duplicados.")
    year = int(payload["engineInfo"]["business"]["year"])
    periods = {int(m["id"]): str(m["period"]) for m in payload["months"]}
    if any(not 1 <= m <= 12 or period != f"{year}{m:02d}" for m, period in periods.items()):
        raise ValueError("Los periodos no corresponden al año seleccionado.")
    index = {h: i for i, h in enumerate(headers)}
    required = {"Rolling RY", "TPLH", "IPLH", "Labor", "Labor PPTO", "Conexion", "Bebida", "Costo %", "Costo % PPTO", "EBITDA", "EBITDA PPTO", "DT Time", "Tiempo DT AA"}
    if not required <= set(index):
        raise ValueError("Faltan métricas de Perfil: " + ", ".join(sorted(required-set(index))))
    results = []
    for store in stores:
        cc = str(store["CC"])
        profile = payload.get("profile", {}).get(cc, {})
        business = payload.get("business", {}).get(cc, {})
        pm = sorted(int(m) for m in profile if int(m) in periods)
        bm = sorted(int(m) for m in business if int(m) in periods)
        for m in pm:
            if len(profile[str(m)]) != len(headers):
                raise ValueError(f"Perfil {cc} mes {m}: número de valores incorrecto.")
        def values(name):
            return [profile[str(m)][index[name]] for m in pm]
        def mean(name):
            return average(values(name))
        def latest(name):
            return next((v for v in reversed(values(name)) if numeric(v)), None)
        def variance(actual, reference):
            return average([a-b for a, b in zip(values(actual), values(reference)) if numeric(a) and numeric(b)])
        sales = [business[str(m)].get("sales") for m in bm]
        pairs = [(business[str(m)].get("sales"), business[str(m)].get("salesBudget")) for m in bm]
        pairs = [(a,b) for a,b in pairs if numeric(a) and numeric(b)]
        budget = sum(b for _,b in pairs)
        profile_cutoff = month_end(year, max(pm)) if pm else None
        business_cutoff = month_end(year, max(bm)) if bm else None
        row = {h: None for h in METRIC_HEADERS}
        row.update({"CC": cc, "Corte YTD": max(filter(None, [profile_cutoff, business_cutoff]), default=None),
            "Rolling": latest("Rolling RY"), "TPLH": mean("TPLH"), "IPLH": mean("IPLH"),
            "Labor": mean("Labor"), "Dif Labor": variance("Labor", "Labor PPTO"),
            "Ventas MXN": sum(v for v in sales if numeric(v)) if any(numeric(v) for v in sales) else None,
            "Dif Ppto": sum(a for a,_ in pairs)/budget-1 if pairs and budget else None,
            "OMT": average([business[str(m)].get("omtDiff") for m in bm]),
            "Conexión": mean("Conexion"), "Bebida": mean("Bebida"),
            "Costo": mean("Costo %"), "Dif Costo": variance("Costo %", "Costo % PPTO"),
            "EBITDA": mean("EBITDA"), "Dif EBITDA": variance("EBITDA", "EBITDA PPTO"),
            "DT Time": duration(mean("DT Time")), "Tiempo DT AA": duration(mean("Tiempo DT AA")),
            "Corte Perfil": profile_cutoff, "Corte Negocio": business_cutoff,
            "Meses Perfil": len(pm), "Meses Negocio": len(bm),
            "Fuente Indicadores": "sbx-mex/Perfil_Tienda_DM" if pm or bm else None,
            "Fuente Commit": commit if pm or bm else None,
            "Fuente SHA256": source_sha256 if pm or bm else None,
        })
        results.append(row)
    return results


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--perfil", type=Path, required=True, help="dashboard.json validado de Perfil de Tienda")
    p.add_argument("--cms", type=Path, default=ROOT/"cms/Mapa_CentroNorte_CMS.xlsx")
    p.add_argument("--commit", default="", help="Commit de la fuente para trazabilidad")
    p.add_argument("--output", type=Path, required=True, help="Indicadores.csv o archivo .json")
    args = p.parse_args(argv)
    raw = args.perfil.read_bytes()
    rows, _ = read_locations(args.cms)
    result = build_rows(json.loads(raw), [r for _, r in rows if r.get("CC")], args.commit, hashlib.sha256(raw).hexdigest())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix == ".json":
        args.output.write_text(json.dumps({"headers": METRIC_HEADERS, "rows": result}, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        with args.output.open("w", encoding="utf-8-sig", newline="") as f:
            writer=csv.DictWriter(f, fieldnames=METRIC_HEADERS);writer.writeheader();writer.writerows(result)
    print(f"Preparados {len(result)} CeCo. Se respetan ubicación, región y DM del CMS. Valores ausentes en blanco.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
