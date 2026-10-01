"""Small, auditable graph calculations for the MA371 Math Sci inquiry."""

import json
import numpy as np


def adjacency_matrix(values):
    A = np.asarray(values)
    if A.ndim != 2 or A.shape[0] != A.shape[1]:
        raise ValueError("The adjacency matrix must be square.")
    if not 3 <= A.shape[0] <= 8:
        raise ValueError("Choose between 3 and 8 vertices.")
    if not np.all((A == 0) | (A == 1)):
        raise ValueError("Entries must be 0 or 1.")
    if not np.array_equal(A, A.T) or np.any(np.diag(A) != 0):
        raise ValueError("Use a symmetric matrix with a zero diagonal.")
    return A.astype(int)


def edge_list(A):
    return [[int(i + 1), int(j + 1)] for i, j in zip(*np.where(np.triu(A, 1) == 1))]


# WEB_CODE_BEGIN degrees
def degrees(A):
    # Each row sum counts the neighbors of one vertex.
    return A.sum(axis=1)


def degree_matrix(A):
    return np.diag(degrees(A))
# WEB_CODE_END degrees


# WEB_CODE_BEGIN laplacian
def laplacian(A):
    D = degree_matrix(A)
    return D - A
# WEB_CODE_END laplacian


# WEB_CODE_BEGIN spectrum
def spectrum(A):
    L = laplacian(A).astype(float)
    values, vectors = np.linalg.eigh(L)  # symmetric-matrix eigenpairs
    return values, vectors
# WEB_CODE_END spectrum


# WEB_CODE_BEGIN cut
def cut_edges(A, cohort_a):
    crossing = []
    for i, j in edge_list(A):
        if (i in cohort_a) != (j in cohort_a):
            crossing.append([i, j])
    return crossing
# WEB_CODE_END cut


def spectral_report(A):
    L = laplacian(A)
    values, vectors = spectrum(A)
    scale = max(1.0, float(np.max(np.abs(values))))
    tolerance = 1e-8 * scale
    zero_count = int(np.count_nonzero(np.abs(values) <= tolerance))
    report = {
        "eigenvalues": [float(x) for x in values],
        "zero_count": zero_count,
        "connected": zero_count == 1,
        "trace": int(np.trace(L)),
        "sum_eigenvalues": float(np.sum(values)),
    }
    if zero_count != 1:
        report["warning"] = "The graph is disconnected. The zero eigenspace has more than one dimension, so the usual connected-graph sign split is not shown."
        return report
    if len(values) < 2:
        return report
    lam = float(values[1])
    v = vectors[:, 1].copy()
    first = next((x for x in v if abs(x) > tolerance), None)
    if first is not None and first < 0:
        v *= -1
    residual = float(np.max(np.abs(L @ v - lam * v)))
    repeated = len(values) > 2 and abs(values[2] - values[1]) <= tolerance
    near_zero = [int(i + 1) for i, x in enumerate(v) if abs(x) <= 1e-6]
    report.update({
        "lambda2": lam,
        "vector": [float(x) for x in v],
        "residual": residual,
        "repeated_lambda2": bool(repeated),
        "near_zero_vertices": near_zero,
        "suggested_cohort_a": [int(i + 1) for i, x in enumerate(v) if x > 1e-6],
        "suggested_cohort_b": [int(i + 1) for i, x in enumerate(v) if x < -1e-6],
    })
    if repeated:
        report["warning"] = "The smallest positive eigenvalue is repeated. Its eigenvector is not unique, so a sign split is not a stable automatic choice."
    elif near_zero:
        report["warning"] = "Some coordinates are near zero. Their cohort assignment is ambiguous; inspect the actual edges."
    else:
        report["warning"] = "The sign split is a candidate, not a proof of the best balanced partition."
    return report


def dispatch(action, payload):
    A = adjacency_matrix(payload["adjacency"])
    if action == "degrees":
        d = degrees(A)
        return {"degrees": d.tolist(), "D": degree_matrix(A).tolist(), "edge_count": len(edge_list(A)), "degree_sum": int(np.sum(d))}
    if action == "laplacian":
        L = laplacian(A)
        return {"L": L.tolist(), "row_sums": L.sum(axis=1).tolist(), "ones_check": (L @ np.ones(len(A), dtype=int)).tolist()}
    if action == "spectrum":
        return spectral_report(A)
    if action == "cut":
        cohort_a = {int(i) for i in payload["cohort_a"]}
        n = len(A)
        if not cohort_a or len(cohort_a) == n or any(i < 1 or i > n for i in cohort_a):
            raise ValueError("Assign every vertex to one of two nonempty cohorts.")
        if abs(len(cohort_a) - (n - len(cohort_a))) > 1:
            raise ValueError("Use cohorts as balanced as possible for this exercise.")
        crossing = cut_edges(A, cohort_a)
        total = len(edge_list(A))
        return {
            "cohort_a": sorted(cohort_a),
            "cohort_b": [i for i in range(1, n + 1) if i not in cohort_a],
            "crossing_edges": crossing,
            "cut_count": len(crossing),
            "within_count": total - len(crossing),
            "edge_count": total,
            "within_fraction": (total - len(crossing)) / total if total else None,
        }
    raise ValueError("Unknown calculation step.")
