"""Auditable, synthetic thermal model for the MA371 Physics inquiry.

All quantities follow the guided packet: minutes, degrees Celsius, kJ, and
kJ/min. This pure-Python module runs unchanged in browser Python and CPython.
"""

import json
import math


CASES = {
    "baseline": {"h": 1.0, "g": 0.5},
    "ventilation": {"h": 1.35, "g": 0.5},
    "bridge": {"h": 1.0, "g": 1.0},
}
OBSERVATIONS = {10: (31.2, 24.1), 20: (34.6, 26.5), 30: (35.8, 27.5)}
LIMITS = (34.5, 29.0)


def number(values, key, positive=False):
    try:
        value = float(values[key])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Enter a numerical value for {key}.") from exc
    if not math.isfinite(value) or (positive and value <= 0):
        raise ValueError(f"{key} must be a finite{' positive' if positive else ''} number.")
    return value


def one_inputs(values):
    p = {key: number(values, key, key in ("C", "h")) for key in ("C", "P", "h", "Ta", "T0")}
    if p["P"] < 0:
        raise ValueError("Heat production P must be nonnegative.")
    return p


# WEB_CODE_BEGIN one_balance
def one_balance(p):
    theta0 = p["T0"] - p["Ta"]
    production = p["P"]
    ambient_loss = p["h"] * theta0
    slope = (production - ambient_loss) / p["C"]
    equilibrium = p["Ta"] + production / p["h"]
    return {"production": production, "ambient_loss": ambient_loss,
            "initial_slope": slope, "equilibrium": equilibrium,
            "time_constant": p["C"] / p["h"]}
# WEB_CODE_END one_balance


# WEB_CODE_BEGIN one_curve
def one_temperature(t, p):
    equilibrium = p["Ta"] + p["P"] / p["h"]
    return equilibrium + (p["T0"] - equilibrium) * math.exp(-p["h"] * t / p["C"])


def one_curve(p, duration=60):
    points = [[t, one_temperature(t, p)] for t in range(duration + 1)]
    check_t = 10
    temp = one_temperature(check_t, p)
    derivative = -p["h"] / p["C"] * (temp - p["Ta"] - p["P"] / p["h"])
    residual = p["C"] * derivative - (p["P"] - p["h"] * (temp - p["Ta"]))
    return {"points": points, "ode_residual_at_10": residual,
            "temperature_at_10": temp}
# WEB_CODE_END one_curve


def two_inputs(values):
    p = {key: number(values, key, key in ("C", "h")) for key in
         ("C", "P1", "P2", "h", "g", "Ta", "T10", "T20")}
    if p["g"] < 0 or p["P1"] < 0 or p["P2"] < 0:
        raise ValueError("Conductance and heat-production rates must be nonnegative.")
    return p


# WEB_CODE_BEGIN two_model
def two_model(p):
    C, h, g = p["C"], p["h"], p["g"]
    A = [[-(h + g) / C, g / C], [g / C, -(h + g) / C]]
    b = [p["P1"] / C, p["P2"] / C]
    theta0 = [p["T10"] - p["Ta"], p["T20"] - p["Ta"]]
    slope0 = [sum(A[i][j] * theta0[j] for j in range(2)) + b[i] for i in range(2)]
    contact0 = g * (p["T10"] - p["T20"])
    return {"A": A, "b": b, "theta0": theta0,
            "initial_slopes": slope0, "initial_contact": contact0}
# WEB_CODE_END two_model


# WEB_CODE_BEGIN modes
def modes(p):
    C, h, g = p["C"], p["h"], p["g"]
    s_star = (p["P1"] + p["P2"]) / h
    d_star = (p["P1"] - p["P2"]) / (h + 2 * g)
    theta_star = [(s_star + d_star) / 2, (s_star - d_star) / 2]
    return {"lambda_plus": -h / C, "lambda_minus": -(h + 2 * g) / C,
            "v_plus": [1, 1], "v_minus": [1, -1],
            "s_star": s_star, "d_star": d_star, "theta_star": theta_star,
            "temperature_star": [p["Ta"] + x for x in theta_star]}
# WEB_CODE_END modes


# WEB_CODE_BEGIN forecast
def temperature_at(t, p):
    h, g, C = p["h"], p["g"], p["C"]
    s0 = p["T10"] + p["T20"] - 2 * p["Ta"]
    d0 = p["T10"] - p["T20"]
    s_star = (p["P1"] + p["P2"]) / h
    d_star = (p["P1"] - p["P2"]) / (h + 2 * g)
    s = s_star + (s0 - s_star) * math.exp(-h * t / C)
    d = d_star + (d0 - d_star) * math.exp(-(h + 2 * g) * t / C)
    return [p["Ta"] + (s + d) / 2, p["Ta"] + (s - d) / 2]


def forecast(p, duration=60):
    curve = [[t, *temperature_at(t, p)] for t in range(duration + 1)]
    at30 = temperature_at(30, p)
    t1, t2 = at30
    contact = p["g"] * (t1 - t2)
    losses = [p["h"] * (t1 - p["Ta"]), p["h"] * (t2 - p["Ta"])]
    return {"points": curve, "at30": at30,
            "equilibrium": modes(p)["temperature_star"],
            "at30_within_limits": all(at30[i] <= LIMITS[i] for i in range(2)),
            "heat_flow_at30": {"power": p["P1"], "control": p["P2"],
                                "ambient_loss": losses, "bridge_1_to_2": contact}}
# WEB_CODE_END forecast


# WEB_CODE_BEGIN validation
def validation(p):
    rows = []
    for t, measured in OBSERVATIONS.items():
        predicted = temperature_at(t, p)
        rows.append({"time": t, "predicted": predicted, "measured": list(measured),
                     "residual": [measured[i] - predicted[i] for i in range(2)]})
    return {"rows": rows}
# WEB_CODE_END validation


# WEB_CODE_BEGIN sensitivity
def hotter_day(p, ambient=22):
    changed = dict(p)
    changed["Ta"] = ambient
    # The equipment begins equilibrated to the new ambient temperature.
    changed["T10"] = ambient
    changed["T20"] = ambient
    return {"ambient": ambient, "at30": temperature_at(30, changed),
            "curves": forecast(changed)["points"]}
# WEB_CODE_END sensitivity


def dispatch(action, payload):
    if action in ("one_balance", "one_curve"):
        p = one_inputs(payload)
        return one_balance(p) if action == "one_balance" else one_curve(p)
    if action in ("two_model", "modes", "forecast", "validation", "sensitivity"):
        p = two_inputs(payload)
        if action == "two_model":
            return two_model(p)
        if action == "modes":
            return modes(p)
        if action == "forecast":
            return forecast(p)
        if action == "validation":
            return validation(p)
        return hotter_day(p)
    raise ValueError("Unknown calculation step.")


