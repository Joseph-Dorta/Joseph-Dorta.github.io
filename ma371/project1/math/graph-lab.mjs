const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const state = {
  n: 6, A: zeros(6), cohort: Array(6).fill(null), mode: 'edge', selected: null,
  version: 0, degrees: null, laplacian: null, spectrum: null, cut: null,
  signCohort: null, signVersion: null, comparisons: [], completed: [], caseData: null,
};
let worker;
let nextId = 0;
const pending = new Map();

function zeros(n) { return Array.from({length: n}, () => Array(n).fill(0)); }
function snapshot() { return state.A.map(row => row.slice()); }
function edges(A = state.A) {
  const found = [];
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (A[i][j]) found.push([i + 1, j + 1]);
  return found;
}
function edgeText(list) { return list.length ? list.map(([a, b]) => `{${a},${b}}`).join(', ') : 'none'; }
function status(message, error = false) { $('lab-status').textContent = message; $('lab-status').classList.toggle('error', error); }
function clearElement(element) { element.replaceChildren(); }
function el(tag, text, className) { const out = document.createElement(tag); if (text !== undefined) out.textContent = text; if (className) out.className = className; return out; }
function svgEl(tag, attributes = {}) { const out = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attributes)) out.setAttribute(k, String(v)); return out; }
function compactGraph() { return window.matchMedia('(max-width: 650px)').matches; }
function point(index) { const a = -Math.PI / 2 + index * 2 * Math.PI / state.n; return compactGraph() ? {x: 250 + 175 * Math.cos(a), y: 250 + 175 * Math.sin(a)} : {x: 360 + 235 * Math.cos(a), y: 250 + 175 * Math.sin(a)}; }
function fixed(value, digits = 4) { if (Math.abs(value) < 5 * 10 ** (-(digits + 1))) return '0'; return Number(value).toFixed(digits).replace(/\.?0+$/, ''); }
function matrixText(matrix) { const width = Math.max(2, ...matrix.flat().map(value => String(value).length)); return matrix.map(row => '[ ' + row.map(value => String(value).padStart(width)).join('  ') + ' ]').join('\n'); }
function addParagraph(host, text, className) { host.append(el('p', text, className)); }
function addPre(host, text) { host.append(el('pre', text, 'math-output')); }

function setupWorker() {
  if (worker) return;
  worker = new Worker(new URL('./graph-worker.mjs', import.meta.url), {type: 'module'});
  worker.onmessage = ({data}) => {
    if (data.type === 'progress') { status(data.message); return; }
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    if (data.error) item.reject(new Error(data.error)); else item.resolve(data.result);
  };
  worker.onerror = () => {
    for (const item of pending.values()) item.reject(new Error('Browser Python did not load. Check your connection and reload the page.'));
    pending.clear();
    worker.terminate(); worker = null;
  };
}
function calculate(action, adjacency, extra = {}) {
  setupWorker();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject});
    worker.postMessage({id, action, payload: {adjacency, ...extra}});
  });
}

function renderMatrixEditor() {
  const host = $('matrix-editor'); clearElement(host);
  const table = el('table', undefined, 'matrix-editor-table');
  table.setAttribute('aria-label', 'Editable symmetric adjacency matrix');
  const header = el('tr'); header.append(el('th', 'A'));
  for (let j = 0; j < state.n; j++) { const th = el('th', String(j + 1)); th.scope = 'col'; header.append(th); }
  const head = el('thead'); head.append(header); table.append(head);
  const body = el('tbody');
  for (let i = 0; i < state.n; i++) {
    const row = el('tr'); const th = el('th', String(i + 1)); th.scope = 'row'; row.append(th);
    for (let j = 0; j < state.n; j++) {
      const td = el('td');
      if (i === j) td.append(el('span', '0', 'diagonal'));
      else {
        const button = el('button', String(state.A[i][j]), state.A[i][j] ? 'edge-on' : '');
        button.type = 'button'; button.setAttribute('aria-label', `Edge between vertices ${i + 1} and ${j + 1}: ${state.A[i][j] ? 'present' : 'absent'}. Toggle edge.`);
        button.addEventListener('click', () => toggleEdge(i, j)); td.append(button);
      }
      row.append(td);
    }
    body.append(row);
  }
  table.append(body); host.append(table);
  $('edge-list').textContent = `Edges (${edges().length}): ${edgeText(edges())}.`;
}

function renderGraph() {
  const svg = $('graph-svg'); clearElement(svg);
  svg.setAttribute('viewBox', compactGraph() ? '0 0 500 500' : '0 0 720 500');
  for (const [a, b] of edges()) {
    const start = point(a - 1), end = point(b - 1);
    const ca = state.cohort[a - 1], cb = state.cohort[b - 1];
    const kind = ca && cb ? (ca === cb ? 'within' : 'crossing') : '';
    const line = svgEl('line', {x1: start.x, y1: start.y, x2: end.x, y2: end.y, class: `graph-edge ${kind}`});
    svg.append(line);
  }
  for (let i = 0; i < state.n; i++) {
    const p = point(i);
    const group = svgEl('g', {class: `graph-node ${state.cohort[i] ? 'cohort-' + state.cohort[i].toLowerCase() : ''} ${state.selected === i ? 'selected' : ''}`, tabindex: '0', role: 'button'});
    group.setAttribute('aria-label', `Vertex ${i + 1}${state.cohort[i] ? `, cohort ${state.cohort[i]}` : ', unassigned'}. ${state.mode === 'edge' ? 'Select to toggle an edge.' : 'Select to change cohort.'}`);
    group.append(svgEl('circle', {cx: p.x, cy: p.y, r: compactGraph() ? 38 : 30}));
    const label = svgEl('text', {x: p.x, y: p.y - (state.cohort[i] ? 7 : 0)}); label.textContent = String(i + 1); group.append(label);
    if (state.cohort[i]) { const tag = svgEl('text', {x: p.x, y: p.y + 17, class: 'cohort-tag'}); tag.textContent = state.cohort[i]; group.append(tag); }
    group.addEventListener('click', () => selectVertex(i));
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectVertex(i); } });
    svg.append(group);
  }
  const count = edges().length;
  $('graph-summary').textContent = `${state.n} vertices · ${count} ${count === 1 ? 'edge' : 'edges'}`;
  svg.setAttribute('aria-label', `Graph with ${state.n} labeled vertices and ${count} edges. ${state.cohort.filter(Boolean).length} vertices have cohort assignments.`);
  const a = state.cohort.filter(x => x === 'A').length, b = state.cohort.filter(x => x === 'B').length;
  $('cohort-counts').textContent = `Cohort A: ${a} · Cohort B: ${b} · Unassigned: ${state.n - a - b}`;
}

function renderAll() { renderMatrixEditor(); renderGraph(); renderOutputs(); $('vertex-count').value = String(state.n); $('office-split').disabled = state.n !== 6; $('add-stress-one').disabled = state.n !== 6; $('add-stress-two').disabled = state.n !== 6; }
function markResult(hostId, hasResult, staleText, render) {
  const host = $(hostId); clearElement(host); host.className = `step-result ${hasResult ? 'current' : staleText ? 'stale' : ''}`;
  if (hasResult) render(host); else addParagraph(host, staleText || 'No calculation yet.');
}
function renderOutputs() {
  markResult('degree-result', state.degrees, state.completed.some(x => x.action === 'degrees') ? 'Out of date after a graph edit. Recalculate degrees.' : null, host => {
    addParagraph(host, `Degree vector: [${state.degrees.degrees.join(', ')}]ᵀ. The sum of degrees is ${state.degrees.degree_sum} = 2 × ${state.degrees.edge_count} recorded edges.`);
    addPre(host, 'D =\n' + matrixText(state.degrees.D));
    addParagraph(host, 'Interpretation: a large degree means more recorded neighbors, not a more valuable team.');
  });
  markResult('laplacian-result', state.laplacian, state.completed.some(x => x.action === 'laplacian') ? 'Out of date after a graph edit. Recalculate L.' : null, host => {
    addPre(host, 'L = D − A =\n' + matrixText(state.laplacian.L));
    addParagraph(host, `Row sums: [${state.laplacian.row_sums.join(', ')}]. Thus L times the all-ones vector is zero.`, 'check');
  });
  markResult('spectrum-result', state.spectrum, state.completed.some(x => x.action === 'spectrum') ? 'Out of date after a graph edit. Recalculate eigen-information.' : null, host => {
    const r = state.spectrum;
    addParagraph(host, `Laplacian eigenvalues: ${r.eigenvalues.map(x => fixed(x)).join(', ')}. Zero eigenvalues: ${r.zero_count}; the graph has ${r.zero_count} connected ${r.zero_count === 1 ? 'component' : 'components'}.`);
    addParagraph(host, `Trace check: tr(L) = ${r.trace}; eigenvalue sum ≈ ${fixed(r.sum_eigenvalues, 7)}. This checks arithmetic, not the accuracy of the underlying collaboration record.`, 'check');
    if (r.vector) {
      addParagraph(host, `Smallest positive eigenvalue: ${fixed(r.lambda2)}. Unit-length eigenvector coordinates by vertex: [${r.vector.map(x => fixed(x, 3)).join(', ')}]ᵀ. Its scale and overall sign are arbitrary.`);
      addParagraph(host, `Sign groups: positive {${r.suggested_cohort_a.join(', ') || 'none'}}; negative {${r.suggested_cohort_b.join(', ') || 'none'}}. Maximum |L v − λ v| ≈ ${r.residual.toExponential(2)}.`, 'check');
    }
    addParagraph(host, r.warning);
  });
  markResult('cut-result', state.cut, state.completed.some(x => x.action === 'cut') ? 'Out of date after a graph or cohort edit. Recount crossing edges.' : null, host => {
    const r = state.cut;
    addParagraph(host, `Cohort A {${r.cohort_a.join(', ')}} | Cohort B {${r.cohort_b.join(', ')}}. Crossing edges: ${edgeText(r.crossing_edges)}.`);
    addParagraph(host, `Cut count ${r.cut_count}; within-cohort ties ${r.within_count} of ${r.edge_count}${r.within_fraction === null ? '' : ` (${fixed(100 * r.within_fraction, 1)}% of recorded edges)`}.`, 'check');
    addParagraph(host, 'This fraction describes recorded ties retained inside cohorts; it is not a chance of successful collaboration.');
  });
  const canSuggest = !!state.signCohort && state.signCohort.length >= Math.floor(state.n / 2) && state.signCohort.length <= Math.ceil(state.n / 2);
  $('spectral-split').disabled = !canSuggest;
  $('spectral-split').textContent = state.signVersion === state.version ? 'Use sign suggestion' : 'Use prior sign suggestion';
  $('export-evidence').disabled = state.completed.length === 0;
}

function invalidateGraph(message) {
  state.version++;
  state.degrees = state.laplacian = state.spectrum = state.cut = null;
  state.selected = null;
  renderAll(); status(message);
}
function toggleEdge(i, j) {
  if (i === j) return;
  state.A[i][j] = state.A[j][i] = state.A[i][j] ? 0 : 1;
  invalidateGraph(`Edge {${i + 1},${j + 1}} ${state.A[i][j] ? 'added' : 'removed'}. Recalculate any results you need.`);
}
function setMode(next) {
  state.mode = next; state.selected = null;
  $('edge-mode').setAttribute('aria-pressed', String(next === 'edge'));
  $('cohort-mode').setAttribute('aria-pressed', String(next === 'cohort'));
  $('graph-instruction').textContent = next === 'edge' ? 'Select two vertices to toggle their edge. The matrix does the same thing.' : 'Select a vertex to cycle through unassigned, Cohort A, and Cohort B.';
  renderGraph();
}
function selectVertex(i) {
  if (state.mode === 'cohort') {
    const old = state.cohort[i]; state.cohort[i] = old === null ? 'A' : old === 'A' ? 'B' : null;
    state.cut = null; renderGraph(); renderOutputs(); status(`Vertex ${i + 1} is ${state.cohort[i] ? `in Cohort ${state.cohort[i]}` : 'unassigned'}. Recount the cut when ready.`);
    return;
  }
  if (state.selected === null) { state.selected = i; renderGraph(); status(`Vertex ${i + 1} selected. Select a second vertex to toggle an edge.`); }
  else if (state.selected === i) { state.selected = null; renderGraph(); status('Vertex selection canceled.'); }
  else toggleEdge(state.selected, i);
}
function setCohortA(members, label) {
  const set = new Set(members);
  state.cohort = Array.from({length: state.n}, (_, i) => set.has(i + 1) ? 'A' : 'B');
  state.cut = null; setMode('cohort'); renderOutputs(); $('split-label').value = label; status(`${label} loaded. Predict the crossing edges, then calculate the cut.`);
}
async function caseData() {
  if (state.caseData) return state.caseData;
  const response = await fetch(new URL('./graph_data.json', import.meta.url));
  if (!response.ok) throw new Error('The six-team case data could not be loaded.');
  state.caseData = await response.json(); return state.caseData;
}
async function loadCase(preserveCohorts = false) {
  try {
    const data = await caseData();
    state.n = data.vertex_count; state.A = zeros(state.n);
    for (const [a, b] of data.edges) state.A[a - 1][b - 1] = state.A[b - 1][a - 1] = 1;
    if (!preserveCohorts) {
      state.cohort = Array(state.n).fill(null);
      state.signCohort = null;
      state.signVersion = null;
    }
    invalidateGraph('Original eight-edge case loaded. Predict the vertex degrees before calculating.');
  } catch (error) { status(error.message, true); }
}
function resetSize(n) {
  state.n = n; state.A = zeros(n); state.cohort = Array(n).fill(null); state.signCohort = null; state.signVersion = null;
  state.comparisons = []; state.completed = []; state.version = 0;
  renderComparisonTable(); invalidateGraph(`${n} unconnected labeled vertices are ready. Add edges in the matrix or by selecting two vertices.`);
}

async function runStep(action) {
  const version = state.version, adjacency = snapshot(), button = $(`calculate-${action === 'cut' ? 'cut' : action === 'degrees' ? 'degrees' : action === 'laplacian' ? 'laplacian' : 'spectrum'}`);
  let cohortA = [];
  if (action === 'cut') {
    if (state.cohort.some(x => x === null)) { status('Assign every vertex to a cohort before counting the cut.', true); return; }
    cohortA = state.cohort.flatMap((c, i) => c === 'A' ? [i + 1] : []);
    if (Math.abs(2 * cohortA.length - state.n) > 1) { status('Use cohorts as balanced as possible.', true); return; }
  }
  button.disabled = true; status(`Calculating ${action} with browser Python…`);
  try {
    const result = await calculate(action, adjacency, action === 'cut' ? {cohort_a: cohortA} : {});
    if (state.version !== version || action === 'cut' && cohortA.join(',') !== state.cohort.flatMap((c, i) => c === 'A' ? [i + 1] : []).join(',')) {
      status('The graph or cohorts changed while Python was working. Run this step again.'); return;
    }
    state[action] = result;
    if (action === 'spectrum') {
      if (result.vector && !result.repeated_lambda2 && !result.near_zero_vertices.length) { state.signCohort = result.suggested_cohort_a; state.signVersion = version; }
      else { state.signCohort = null; state.signVersion = null; }
    }
    const record = {action, calculated_at: new Date().toISOString(), graph_version: version, vertex_count: state.n, adjacency, edges: edges(adjacency), result};
    if (action === 'cut') {
      record.label = $('split-label').value.trim() || 'My split';
      state.comparisons.push(record); renderComparisonTable();
    }
    state.completed.push(record);
    renderOutputs(); renderGraph(); status(`${action === 'cut' ? 'Cohort cut' : action[0].toUpperCase() + action.slice(1)} calculated. Interpret the result before moving on.`);
  } catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
}

function renderComparisonTable() {
  const body = $('comparison-table').tBodies[0]; clearElement(body);
  if (!state.comparisons.length) { const row = el('tr'), cell = el('td', 'No comparison yet.'); cell.colSpan = 5; row.append(cell); body.append(row); return; }
  for (const run of state.comparisons) {
    const row = el('tr'), r = run.result;
    for (const value of [run.label, String(r.edge_count), `A {${r.cohort_a.join(', ')}} | B {${r.cohort_b.join(', ')}}`, `${r.cut_count}: ${edgeText(r.crossing_edges)}`, String(r.within_count)]) row.append(el('td', value));
    body.append(row);
  }
}

async function loadCodeSnippets() {
  try {
    const response = await fetch(new URL('./graph_model.py', import.meta.url));
    if (!response.ok) throw new Error();
    const source = await response.text();
    for (const name of ['degrees', 'laplacian', 'spectrum', 'cut']) {
      const start = source.indexOf(`# WEB_CODE_BEGIN ${name}`), end = source.indexOf(`# WEB_CODE_END ${name}`);
      if (start >= 0 && end > start) $(`code-${name}`).textContent = source.slice(source.indexOf('\n', start) + 1, end).trim();
    }
  } catch (_) { for (const name of ['degrees', 'laplacian', 'spectrum', 'cut']) $(`code-${name}`).textContent = 'The source could not be loaded. Download graph_model.py from Student materials.'; }
}
function exportEvidence() {
  const payload = {title: 'MA371 Math Sci graph inquiry evidence', note: 'Only completed calculations are included. Eigenvectors display rounded but cut counts use exact edges.', exported_at: new Date().toISOString(), completed_calculations: state.completed, comparison_count: state.comparisons.length};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'math_sci_graph_evidence.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  status('Completed evidence exported. Keep the file with your inquiry notes.');
}
function stressEdge(i, j) {
  if (state.n !== 6) { status('Load the six-team case to use this stress-test edge.', true); return; }
  if (state.A[i - 1][j - 1]) { status(`Edge {${i},${j}} is already present.`); return; }
  state.A[i - 1][j - 1] = state.A[j - 1][i - 1] = 1;
  invalidateGraph(`Added possible missing edge {${i},${j}}. Earlier comparisons remain saved with their original graph snapshots.`);
}

$('vertex-count').addEventListener('change', event => resetSize(Number(event.target.value)));
$('load-case').addEventListener('click', () => loadCase(false));
$('restore-case').addEventListener('click', () => loadCase(true));
$('clear-edges').addEventListener('click', () => { state.A = zeros(state.n); invalidateGraph('Edges cleared; labeled vertices remain.'); });
$('edge-mode').addEventListener('click', () => setMode('edge'));
$('cohort-mode').addEventListener('click', () => setMode('cohort'));
$('calculate-degrees').addEventListener('click', () => runStep('degrees'));
$('calculate-laplacian').addEventListener('click', () => runStep('laplacian'));
$('calculate-spectrum').addEventListener('click', () => runStep('spectrum'));
$('calculate-cut').addEventListener('click', () => runStep('cut'));
$('office-split').addEventListener('click', async () => { try { const data = await caseData(); if (state.n === 6) setCohortA(data.office_cohort_a, 'Office draft'); } catch (error) { status(error.message, true); } });
$('spectral-split').addEventListener('click', () => { if (state.signCohort) setCohortA(state.signCohort, state.signVersion === state.version ? 'Sign suggestion' : 'Prior sign suggestion'); });
$('clear-cohorts').addEventListener('click', () => { state.cohort = Array(state.n).fill(null); state.cut = null; renderGraph(); renderOutputs(); status('Cohort assignments cleared.'); });
$('add-stress-one').addEventListener('click', () => stressEdge(1, 5));
$('add-stress-two').addEventListener('click', () => stressEdge(3, 6));
$('export-evidence').addEventListener('click', exportEvidence);
renderAll(); loadCodeSnippets();
window.addEventListener('resize', renderGraph);
