"""MA371 OR pilot calculation engine. Synthetic data; no report-writing or AI API."""
import numpy as np
import json, html, hashlib
from datetime import datetime, timezone

DATA = {
  "schema_version": 1,
  "case_id": "MA371_OR_PILOT_V1",
  "data_status": "Entirely synthetic teaching data; not operational evidence.",
  "states": [
    "Ready",
    "Routine maintenance",
    "Major repair"
  ],
  "matrix_convention": "Rows are next-week destinations; columns are current-week origins; x is a column vector.",
  "training_counts": [
    [
      80,
      50,
      20
    ],
    [
      15,
      40,
      30
    ],
    [
      5,
      10,
      50
    ]
  ],
  "holdout_counts": [
    [
      76,
      48,
      18
    ],
    [
      18,
      42,
      29
    ],
    [
      6,
      10,
      53
    ]
  ],
  "initial_fleet": [
    30,
    40,
    30
  ],
  "deadline_weeks": 2,
  "expected_ready_target": 70,
  "option_cost_dollars": 20000,
  "proposed_prevention": [
    [
      0.95,
      0.5,
      0.2
    ],
    [
      0.04,
      0.4,
      0.3
    ],
    [
      0.01,
      0.1,
      0.5
    ]
  ],
  "proposed_repair": [
    [
      0.8,
      0.65,
      0.4
    ],
    [
      0.15,
      0.3,
      0.35
    ],
    [
      0.05,
      0.05,
      0.25
    ]
  ],
  "proposal_status": "Hypothetical planning estimates; no intervention observations supplied.",
  "assumptions": [
    "Closed fleet with 100 vehicles in the default case",
    "Mutually exclusive exhaustive states assessed at weekly boundaries",
    "Transitions depend on current state, not earlier history",
    "Rates constant over the modeled period",
    "Immediate policy effects; one option only; identical one-time budget",
    "Fractional outputs are expected counts, not promises of actual readiness"
  ]
}

def counts_to_matrix(counts):
    c = np.asarray(counts, dtype=float)
    if c.shape != (3, 3) or not np.all(np.isfinite(c)) or np.any(c < 0):
        raise ValueError("Enter a finite, nonnegative 3 by 3 table of transition counts.")
    if np.any(c != np.floor(c)):
        raise ValueError("Transition counts must be whole observations.")
    totals = c.sum(axis=0)
    if np.any(totals <= 0):
        raise ValueError("Each origin column needs at least one observation.")
    return c / totals

def check_matrix(a):
    a = np.asarray(a, dtype=float)
    if a.shape != (3, 3) or not np.all(np.isfinite(a)) or np.any(a < -1e-12):
        raise ValueError("Transition matrices must be finite, nonnegative, and 3 by 3.")
    if not np.allclose(a.sum(axis=0), 1, atol=1e-12):
        raise ValueError("Each ORIGIN column must sum to 1.")
    return a

def trajectory(a, x0, weeks):
    x = np.asarray(x0, dtype=float)
    rows = [x.copy()]
    for _ in range(weeks):
        x = a @ x
        rows.append(x.copy())
    return np.array(rows)

def matrix_summary(a):
    vals, vecs = np.linalg.eig(a)
    order = np.argsort(-np.abs(vals))
    vals, vecs = vals[order], vecs[:, order]
    residual = max(float(np.linalg.norm(a @ vecs[:, j] - vals[j]*vecs[:, j], ord=np.inf))
                   for j in range(3))
    one = np.where(np.abs(vals - 1) < 1e-8)[0]
    stationary = None
    convergence = False
    if len(one) == 1:
        v = np.real_if_close(vecs[:, one[0]], tol=1000)
        if not np.iscomplexobj(v) and abs(v.sum()) > 1e-10:
            p = np.real(v / v.sum())
            if p.min() >= -1e-9:
                stationary = np.maximum(p, 0)
                stationary /= stationary.sum()
                others = np.delete(vals, one[0])
                convergence = bool(np.all(np.abs(others) < 1 - 1e-8))
    vectors = []
    for j in range(3):
        v = vecs[:, j].copy()
        if abs(vals[j]-1) < 1e-8 and abs(v.sum()) > 1e-10:
            v = v / v.sum()
        else:
            v = v / np.max(np.abs(v))
            first = next((z for z in v if abs(z)>1e-9), 1)
            if abs(first.imag) < 1e-9 and first.real < 0:
                v = -v
        vectors.append([format_complex(z) for z in v])
    return {"eigenvalues":[format_complex(z) for z in vals],
            "eigenvectors":vectors, "eigen_residual":residual,
            "stationary":None if stationary is None else stationary.tolist(),
            "converges":convergence,
            "stationary_residual":None if stationary is None else
                float(np.linalg.norm(a @ stationary - stationary, ord=np.inf))}

def format_complex(z):
    z = complex(z)
    if abs(z.imag)<1e-10:
        return f"{z.real:.8g}"
    return f"{z.real:.6g}{z.imag:+.6g}i"

def analyze(counts, initial, deadline=2, prevention_effect=100, repair_effect=100, target=70):
    initial = np.asarray(initial, dtype=float)
    if initial.shape != (3,) or not np.all(np.isfinite(initial)) or np.any(initial<0):
        raise ValueError("Enter three nonnegative initial fleet counts.")
    if np.any(initial != np.floor(initial)) or initial.sum() <= 0:
        raise ValueError("Initial counts must be whole vehicles, with a positive total.")
    if not isinstance(deadline, (int, np.integer)) or not 1<=deadline<=52:
        raise ValueError("Deadline must be a whole number from 1 to 52 weeks.")
    if not all(np.isfinite(z) and 0<=z<=100 for z in [prevention_effect,repair_effect]):
        raise ValueError("Effectiveness must lie between 0 and 100 percent.")
    if not np.isfinite(target) or target<0:
        raise ValueError("The expected-ready target must be nonnegative.")
    base = counts_to_matrix(counts)
    p = base + prevention_effect/100*(np.array(DATA["proposed_prevention"])-base)
    q = base + repair_effect/100*(np.array(DATA["proposed_repair"])-base)
    matrices = {"Baseline":base,"Prevention":check_matrix(p),"Faster repairs":check_matrix(q)}
    total = float(initial.sum())
    results = {}
    weeks = max(12, deadline)
    for name, a in matrices.items():
        path = trajectory(a, initial, weeks)
        final = np.linalg.matrix_power(a, deadline) @ initial
        summary = matrix_summary(a)
        summary.update({"matrix":a.tolist(), "path":path.tolist(),
            "deadline_state":final.tolist(), "meets_expected_target":bool(final[0]>=target),
            "conservation_error":float(np.max(np.abs(path.sum(axis=1)-total))),
            "power_iteration_error":float(np.max(np.abs(final-path[deadline]))),
            "limiting_state":None if not summary["converges"] else
                (total*np.array(summary["stationary"])).tolist()})
        results[name] = summary
    heldout = np.array(DATA["holdout_counts"],dtype=float)
    test_sources = heldout.sum(axis=0)
    predicted = base @ test_sources
    observed = heldout.sum(axis=1)
    difference = observed-predicted
    validation = {"test_origin_counts":test_sources.tolist(),
        "predicted_destination_counts":predicted.tolist(),
        "observed_destination_counts":observed.tolist(),
        "observed_minus_predicted":difference.tolist(),
        "mean_absolute_count_error":float(np.abs(difference).mean()),
        "max_conditional_probability_difference":float(np.max(np.abs(
            counts_to_matrix(heldout)-base)))}
    inputs = {"case_id":DATA["case_id"],"counts":np.asarray(counts).tolist(),
        "initial_fleet":initial.tolist(),"deadline":int(deadline),
        "prevention_effect_percent":float(prevention_effect),
        "repair_effect_percent":float(repair_effect),"expected_ready_target":float(target),
        "edited_training_counts":not np.array_equal(counts,DATA["training_counts"])}
    return {"run_id":datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"),
        "dataset_sha256":hashlib.sha256(json.dumps(DATA,sort_keys=True).encode()).hexdigest(),
        "inputs":inputs,"results":results,"baseline_holdout_check":validation}

def table(headers, rows, raw_columns=()):
    head = "".join("<th>"+html.escape(str(h))+"</th>" for h in headers)
    body = "".join("<tr>"+"".join("<td>"+(str(v) if i in raw_columns else html.escape(str(v)))+"</td>" for i,v in enumerate(row))+"</tr>"
                   for row in rows)
    return "<table><thead><tr>"+head+"</tr></thead><tbody>"+body+"</tbody></table>"

def column_vector(values):
    """Display a genuine 3-by-1 column, not a Python row/list representation."""
    return '<span class="column-vector" role="img" aria-label="column vector '+html.escape(', '.join(map(str,values)))+'">'+''.join('<span>'+html.escape(str(value))+'</span>' for value in values)+'</span>'

def vector_symbol(symbol, index=None):
    accent = '<mover accent="true"><mi>'+html.escape(symbol)+'</mi><mo stretchy="true">&#x2192;</mo></mover>'
    if index is not None:
        tag = 'mn' if str(index).isdigit() else 'mi'
        accent = '<msub>'+accent+'<'+tag+'>'+html.escape(str(index))+'</'+tag+'></msub>'
    return '<math xmlns="http://www.w3.org/1998/Math/MathML">'+accent+'</math>'

def ready_svg(record):
    width,height = 820,330
    left,right,top,bottom=65,25,20,65
    plotw,ploth=width-left-right,height-top-bottom
    total=sum(record["inputs"]["initial_fleet"])
    target=record["inputs"]["expected_ready_target"]
    ymax=max(total,target,1)
    weeks=len(record["results"]["Baseline"]["path"])-1
    sx=lambda k:left+k/weeks*plotw
    sy=lambda y:top+ploth*(1-y/ymax)
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="Expected ready vehicles by week">']
    svg.append('<rect width="100%" height="100%" fill="white"/>')
    for y in np.linspace(0,ymax,5):
        yy=sy(y)
        svg.append(f'<line x1="{left}" x2="{left+plotw}" y1="{yy}" y2="{yy}" stroke="#ddd"/>')
        svg.append(f'<text x="{left-8}" y="{yy+4}" text-anchor="end" font-size="12">{y:.0f}</text>')
    tickstep=max(1,int(np.ceil(weeks/12)))
    for k in range(0,weeks+1,tickstep):
        svg.append(f'<text x="{sx(k)}" y="{top+ploth+20}" text-anchor="middle" font-size="12">{k}</text>')
    svg.append(f'<text x="{left+plotw/2}" y="{height-8}" text-anchor="middle" font-size="13">Weeks from implementation</text>')
    svg.append(f'<text x="17" y="{top+ploth/2}" transform="rotate(-90 17 {top+ploth/2})" text-anchor="middle" font-size="13">Expected ready vehicles</text>')
    svg.append(f'<line x1="{left}" x2="{left+plotw}" y1="{sy(target)}" y2="{sy(target)}" stroke="#a33" stroke-dasharray="4,4"/>')
    for j,(name,res) in enumerate(record["results"].items()):
        color=["#54616d","#693091","#006678"][j]
        points=" ".join(f"{sx(k):.2f},{sy(x[0]):.2f}" for k,x in enumerate(res["path"]))
        svg.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="3"/>')
        svg.append(f'<text x="{left+j*245}" y="{height-28}" fill="{color}" font-size="13">{html.escape(name)}</text>')
    k=record["inputs"]["deadline"]
    svg.append(f'<line x1="{sx(k)}" x2="{sx(k)}" y1="{top}" y2="{top+ploth}" stroke="#444" stroke-dasharray="2,4"/>')
    svg.append("</svg>")
    return "".join(svg)

def report_html(record):
    r,inp=record["results"],record["inputs"]
    parts=['<h1>MA371 OR Pilot: Evidence Record</h1>',
        '<p><strong>Entirely synthetic case. This output is evidence, not a recommendation.</strong></p>',
        '<p>Run '+html.escape(record["run_id"])+' | Dataset hash '+record["dataset_sha256"]+'</p>',
        table(["Input","Value"],[(k,vector_symbol('x',0)+' = '+column_vector([f'{z:g}' for z in v])
              if k=='initial_fleet' else html.escape(str(v))) for k,v in inp.items()],raw_columns=(1,))]
    if inp["edited_training_counts"]:
        parts.append('<p><strong>Training counts were edited: disclose this hypothetical change; do not claim these are the supplied observations.</strong></p>')
    parts.append('<p>State vectors contain expected vehicle counts in the order Ready, Routine maintenance, Major repair. Stationary vectors contain proportions in that same order.</p>')
    parts.append('<div class="vector-card">Initial state '+vector_symbol('x',0)+' = '+column_vector([f'{z:g}' for z in inp['initial_fleet']])+'</div>')
    parts.append('<h2>Deadline comparison</h2>')
    parts.append(table(["Policy","Ready","Routine","Major","Expected target met?","Limiting ready*"],
        [[name,*[f"{z:.3f}" for z in res["deadline_state"]],
          res["meets_expected_target"],
          "No convergence established" if res["limiting_state"] is None else f'{res["limiting_state"][0]:.3f}']
         for name,res in r.items()]))
    parts.append('<p>*Long-term limits assume unchanged rates. Meeting an expected-count target is not a probability guarantee.</p>')
    parts.append(ready_svg(record))
    parts.append('<p>Red dashed line: expected-ready target. Vertical dotted line: selected deadline.</p>')
    for name,res in r.items():
        parts.append('<h2>'+html.escape(name)+'</h2>')
        parts.append('<div class="vector-card">Deadline state '+vector_symbol('x',inp['deadline'])+' = '+column_vector([f'{z:.3f}' for z in res['deadline_state']])+'</div>')
        if res['stationary'] is not None:
            parts.append('<div class="vector-card">Stationary proportions '+vector_symbol('p')+' = '+column_vector([f'{z:.6f}' for z in res['stationary']])+'</div>')
        parts.append('<p>Transition matrix A (3 × 3); rows are destinations and columns are origins.</p>')
        parts.append(table(["Next state / current state",*DATA["states"]],
            [[DATA["states"][i],*[f"{x:.4f}" for x in res["matrix"][i]]] for i in range(3)]))
        parts.append(table(["Eigenvalue λᵢ","Eigenvector (3 × 1)"],
            [[value,vector_symbol('v',i+1)+' = '+column_vector(vector)]
             for i,(value,vector) in enumerate(zip(res['eigenvalues'],res['eigenvectors']))],raw_columns=(1,)))
        parts.append('<p>Each pair satisfies A '+vector_symbol('v','i')+' = λ<sub>i</sub> '+vector_symbol('v','i')+'. Eigenvectors may be rescaled; '+vector_symbol('p')+' is normalized so its coordinates sum to 1. A stationary vector is not a deadline forecast, and does not alone establish convergence.</p>')
        parts.append(table(["Numerical check","Maximum absolute error"],
            [["Fleet conservation",f'{res["conservation_error"]:.3e}'],
             ["Repeated multiplication vs matrix power",f'{res["power_iteration_error"]:.3e}'],
             ["Eigenpair residual",f'{res["eigen_residual"]:.3e}'],
             ["Stationary-vector residual","N/A" if res["stationary_residual"] is None else f'{res["stationary_residual"]:.3e}']]))
    val=record["baseline_holdout_check"]
    parts.append('<h2>Held-out baseline records: a separate 300-transition test cohort</h2>')
    parts.append(table(["Destination","Predicted","Observed","Observed minus predicted"],
        [[state,*[f'{val[key][i]:.3f}' for key in
            ["predicted_destination_counts","observed_destination_counts","observed_minus_predicted"]]]
         for i,state in enumerate(DATA["states"])]))
    parts.append(f'<p>Mean absolute destination-count error: {val["mean_absolute_count_error"]:.3f}. '
                 f'Largest conditional probability difference: {100*val["max_conditional_probability_difference"]:.2f} percentage points.</p>')
    parts.append('<p>These records check the baseline prediction only. They do not validate the proposed intervention rates. No confidence intervals, policy-success probabilities, or causal effects are estimated.</p>')
    style=".or-evidence{font:16px/1.65 Arial,sans-serif;max-width:1050px;margin:25px auto;padding:12px;color:#172534;overflow-wrap:anywhere}.or-evidence table{border-collapse:collapse;width:100%;margin:12px 0;display:block;overflow-x:auto}.or-evidence td,.or-evidence th{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}.or-evidence th{background:#e8eef3}.or-evidence svg{width:100%;max-width:900px}.or-evidence h1,.or-evidence h2{color:#243f5c}.or-evidence .column-vector{display:inline-flex;flex-direction:column;align-items:center;border-left:2px solid currentColor;border-right:2px solid currentColor;padding:.25rem .75rem;margin:.2rem;vertical-align:middle;white-space:nowrap}.or-evidence .vector-card{display:inline-block;margin:.5rem 1rem .5rem 0}.or-evidence .notation{padding:.75rem;background:#f2f6f9}"
    return '<!doctype html><html><head><meta charset="utf-8"><title>OR evidence record</title><style>'+style+'</style></head><body><div class="or-evidence">'+"".join(parts)+'</div></body></html>'

