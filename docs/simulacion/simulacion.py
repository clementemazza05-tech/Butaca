"""
BUTACA · simulación de impacto (Monte Carlo)

NO son datos de clientes. Es un modelo con supuestos explícitos para estimar
qué podría medir un piloto. Cada supuesto es un rango (distribución triangular
o uniforme); se simulan N escenarios y se reporta la mediana y el rango p10-p90.

Correr:  python3 docs/simulacion/simulacion.py
"""
import json
import numpy as np

N = 100_000
rng = np.random.default_rng(2026)

def tri(lo, mode, hi):
    return rng.triangular(lo, mode, hi, N)

# Supuesto común: qué parte de los compradores abre la vista 3D antes de pagar
adopcion = tri(0.30, 0.50, 0.70)

# 1) Conversión de reserva online (desde el mapa de butacas hasta el pago)
conv_base = rng.uniform(0.45, 0.65, N)          # conversión actual mapa -> pago
abandono_incertidumbre = tri(0.10, 0.20, 0.35)  # parte del abandono causado por no saber qué se ve
reduccion_incertidumbre = tri(0.20, 0.40, 0.60) # cuánto de ese abandono evita la vista 3D
conv_nueva = conv_base + (1 - conv_base) * abandono_incertidumbre * reduccion_incertidumbre * adopcion
uplift_conversion = conv_nueva / conv_base - 1

# 2) Reclamos por ubicación en boletería
parte_por_expectativa = tri(0.40, 0.60, 0.80)   # reclamos de ubicación por "no era lo que esperaba"
reduccion_expectativa = tri(0.40, 0.60, 0.80)   # cuánto de eso evita ver la vista antes
baja_reclamos = parte_por_expectativa * reduccion_expectativa * adopcion

# 3) Venta de butacas premium (attach rate)
lift_consideracion = tri(0.10, 0.25, 0.45)      # aumento relativo de upgrade entre quienes ven la diferencia
uplift_premium = lift_consideracion * adopcion

def resumen(x):
    p10, p50, p90 = np.percentile(x, [10, 50, 90])
    return {"mediana": round(float(p50) * 100, 1), "p10": round(float(p10) * 100, 1), "p90": round(float(p90) * 100, 1)}

out = {
    "escenarios": N,
    "semilla": 2026,
    "conversion_online_pct": resumen(uplift_conversion),
    "reclamos_ubicacion_pct": resumen(-baja_reclamos),
    "venta_premium_pct": resumen(uplift_premium),
}
print(json.dumps(out, indent=2, ensure_ascii=False))
