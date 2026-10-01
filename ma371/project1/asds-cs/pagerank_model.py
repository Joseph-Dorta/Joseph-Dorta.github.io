"""Auditable five-page PageRank calculations for the MA371 ASDS/CS inquiry."""

import json
import numpy as np


def checked_adjacency(values):
    A = np.asarray(values)
    if A.ndim != 2 or A.shape[0] != A.shape[1] or not 3 <= len(A) <= 8:
        raise ValueError("Use a square adjacency matrix with 3 to 8 pages.")
    if not np.all((A == 0) | (A == 1)) or np.any(np.diag(A) != 0):
        raise ValueError("Use binary directed links and a zero diagonal.")
    return A.astype(int)


def checked_alpha(value):
    alpha = float(value)
    if not 0 < alpha < 1:
        raise ValueError("Choose a continuation probability strictly between 0 and 1.")
    return alpha


# WEB_CODE_BEGIN transition
def link_transition(A):
    n = len(A)
    outgoing = A.sum(axis=0)
    T = np.zeros((n, n), dtype=float)
    for j, count in enumerate(outgoing):
        T[:, j] = A[:, j] / count if count else np.ones(n) / n
    return T, outgoing
# WEB_CODE_END transition


# WEB_CODE_BEGIN google
def google_matrix(T, alpha):
    n = len(T)
    uniform = np.ones(n) / n
    return alpha * T + (1 - alpha) * np.outer(uniform, np.ones(n))
# WEB_CODE_END google


# WEB_CODE_BEGIN step
def one_step(T, alpha, p):
    follow = alpha * (T @ p)
    restart = (1 - alpha) * np.ones(len(p)) / len(p)
    return follow, restart, follow + restart
# WEB_CODE_END step


# WEB_CODE_BEGIN stationary
def stationary(G, tolerance=1e-13, max_steps=10000):
    p = np.ones(len(G)) / len(G)
    for k in range(1, max_steps + 1):
        next_p = G @ p
        if np.linalg.norm(next_p - p, ord=1) < tolerance:
            residual = float(np.linalg.norm(G @ next_p - next_p, ord=1))
            return next_p, k, residual
        p = next_p
    raise ValueError("The iteration did not meet its stopping tolerance.")
# WEB_CODE_END stationary


def checked_probability(values, n):
    p = np.asarray(values, dtype=float)
    if p.shape != (n,) or not np.all(np.isfinite(p)) or np.any(p < 0):
        raise ValueError("The state must have one nonnegative probability per page.")
    if abs(float(p.sum()) - 1) > 1e-9:
        raise ValueError("The state probabilities must sum to 1.")
    return p


def report(A, alpha):
    T, outgoing = link_transition(A)
    G = google_matrix(T, alpha)
    p, steps, residual = stationary(G)
    return {
        "p": p.tolist(),
        "iterations": steps,
        "residual_l1": residual,
        "sum": float(p.sum()),
        "outgoing": outgoing.tolist(),
        "dangling": [int(j) for j, count in enumerate(outgoing) if count == 0],
    }


def checked_counts(values):
    """Counts are destination-ordered columns for H, P, E, respectively."""
    counts = {}
    allowed = {0: {1, 2, 3}, 1: {0, 3}, 3: {1, 4}}
    for origin in (0, 1, 3):
        raw = values.get(str(origin), values.get(origin))
        col = np.asarray(raw, dtype=float)
        if col.shape != (5,) or not np.all(np.isfinite(col)) or np.any(col < 0):
            raise ValueError("Supply five nonnegative click counts for each observed origin.")
        if any(col[i] != 0 for i in range(5) if i not in allowed[origin]):
            raise ValueError("Observed clicks may only use links in the baseline graph.")
        if col.sum() <= 0:
            raise ValueError("Each observed origin needs at least one click event.")
        counts[origin] = col
    return counts


# WEB_CODE_BEGIN hybrid
def hybrid_transition(A, click_counts):
    T, _ = link_transition(A)
    for origin, counts in click_counts.items():
        T[:, origin] = counts / counts.sum()
    return T


def add_hypothetical_link(T, origin, new_share):
    if not 0 <= new_share <= 1:
        raise ValueError("A new-link click share must lie between 0 and 1.")
    changed = T.copy()
    changed[:, origin] *= 1 - new_share
    changed[4, origin] = new_share  # destination R
    return changed
# WEB_CODE_END hybrid


def dispatch(action, payload):
    alpha = checked_alpha(payload.get("alpha", 0.85))
    if action in {"transition", "google", "step", "iterate", "stationary"}:
        A = checked_adjacency(payload["adjacency"])
        T, outgoing = link_transition(A)
        G = google_matrix(T, alpha)
        if action == "transition":
            return {"T": T.tolist(), "outgoing": outgoing.tolist(),
                    "column_sums": T.sum(axis=0).tolist(),
                    "dangling": [int(j) for j, count in enumerate(outgoing) if count == 0]}
        if action == "google":
            return {"G": G.tolist(), "column_sums": G.sum(axis=0).tolist(),
                    "restart_each": (1 - alpha) / len(A)}
        if action in {"step", "iterate"}:
            p = checked_probability(payload["p"], len(A))
            steps = int(payload.get("steps", 1))
            if not 1 <= steps <= 10:
                raise ValueError("Advance between one and ten steps at a time.")
            history = []
            for _ in range(steps):
                follow, restart, p = one_step(T, alpha, p)
                history.append({"p": p.tolist(), "follow": follow.tolist(),
                                "restart": restart.tolist(), "sum": float(p.sum())})
            return {"history": history, "p": p.tolist()}
        return report(A, alpha)

    if action in {"validate", "hybrid_baseline", "hybrid_options"}:
        baseline_A = checked_adjacency(payload["baseline_adjacency"])
        if len(baseline_A) != 5:
            raise ValueError("The held-out records use the five-page case.")
        counts = checked_counts(payload["click_counts"])
        uniform_T, _ = link_transition(baseline_A)
        if action == "validate":
            origin = int(payload["origin"])
            if origin not in counts:
                raise ValueError("Held-out clicks exist only for H, P, and E.")
            observed = counts[origin] / counts[origin].sum()
            model = uniform_T[:, origin]
            return {"observed": observed.tolist(), "model": model.tolist(),
                    "absolute_gaps": np.abs(observed - model).tolist(),
                    "max_gap": float(np.max(np.abs(observed - model))),
                    "events": int(counts[origin].sum())}
        hybrid_T = hybrid_transition(baseline_A, counts)
        if action == "hybrid_baseline":
            return {"T": hybrid_T.tolist(), "p": stationary(google_matrix(hybrid_T, alpha))[0].tolist(),
                    "observed_origins": [0, 1, 3], "structural_origins": [2, 4]}
        q1, q2 = float(payload["q1"]), float(payload["q2"])
        option1_T = add_hypothetical_link(hybrid_T, 0, q1)
        option2_T = add_hypothetical_link(hybrid_T, 1, q2)
        outputs = {}
        for name, matrix in (("baseline", hybrid_T), ("option1", option1_T), ("option2", option2_T)):
            p, steps, residual = stationary(google_matrix(matrix, alpha))
            outputs[name] = {"p": p.tolist(), "iterations": steps, "residual_l1": residual,
                             "T": matrix.tolist()}
        return {"scenarios": outputs, "q1": q1, "q2": q2}
    raise ValueError("Unknown calculation step.")
