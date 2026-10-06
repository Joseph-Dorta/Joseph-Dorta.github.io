import {showFlow, clearFlow} from './flow-rail.mjs';

const form = document.querySelector('#fleet-form');
const loadButton = document.querySelector('#load-calculator');
const exportButton = document.querySelector('#export-evidence');
const resetButton = document.querySelector('#reset-inputs');
const status = document.querySelector('#calculator-status');
const evidence = document.querySelector('#evidence');
const report = document.querySelector('#full-report');
const resultNote = document.querySelector('#result-note');
const steps = ['matrix', 'advance', 'proposals', 'modes', 'holdout', 'sensitivity'];
const pending = new Map();
const completed = new Map();
let worker, counter = 0, timer, latest, defaults, busy = false, dirty = false;

function message(value, error = false) {
  status.textContent = value;
  status.classList.toggle('error', error);
}
function controls() {
  for (const [index, step] of steps.entries()) {
    document.querySelector(`#${step}-button`).disabled = !worker || !defaults || busy || (index > 0 && !completed.has(steps[index - 1]));
  }
  exportButton.disabled = !latest || busy;
  resetButton.disabled = !defaults || busy;
  for (const input of form.querySelectorAll('input')) input.disabled = busy;
}
function request(action, inputs) {
  return new Promise((resolve, reject) => {
    const id = ++counter;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The calculation is taking too long. Reload it or use the Colab fallback.'));
      failWorker();
    }, action === 'initialize' ? 180000 : 40000);
    pending.set(id, {resolve, reject, timeout});
    worker.postMessage({id, action, inputs});
  });
}
function failWorker() {
  worker?.terminate();
  worker = null;
  defaults = null;
  latest = null;
  completed.clear();
  clearFlow();
  busy = false;
  loadButton.disabled = false;
  loadButton.textContent = 'Reload calculator';
  for (const entry of pending.values()) {
    clearTimeout(entry.timeout);
    entry.reject(new Error('Browser Python stopped. Reload the calculator or use Colab.'));
  }
  pending.clear();
  controls();
}
function setDefaults() {
  defaults.training_counts.forEach((row, i) => row.forEach((value, j) => {
    form.elements.namedItem(`count-${i}-${j}`).value = value;
  }));
  defaults.initial_fleet.forEach((value, i) => {
    form.elements.namedItem(`initial-${i}`).value = value;
  });
  form.elements.deadline.value = defaults.deadline_weeks;
  form.elements.target.value = defaults.expected_ready_target;
  form.elements.prevention.value = 100;
  form.elements.repair.value = 100;
  updateEffects();
}
function updateEffects() {
  for (const name of ['prevention', 'repair']) {
    document.querySelector(`#${name}-value`).textContent = `${form.elements[name].value}%`;
  }
}
function note() {
  resultNote.textContent = latest
    ? `Last completed six-step run: ${latest.run_id}. ${dirty ? 'Inputs changed; earlier results are marked out of date. Export still saves that completed run.' : 'Results match the current inputs.'}`
    : 'Work through the six calculations in order. Make a prediction before each one.';
}
function number(name) {
  const input = form.elements.namedItem(name);
  if (input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) {
    throw new Error('Complete every numeric input with a finite number.');
  }
  return input.valueAsNumber;
}
function inputs() {
  if (!form.checkValidity()) {
    form.reportValidity();
    throw new Error('Correct the highlighted inputs before calculating.');
  }
  return {
    counts: Array.from({length: 3}, (_, i) => Array.from({length: 3}, (_, j) => number(`count-${i}-${j}`))),
    initial: Array.from({length: 3}, (_, i) => number(`initial-${i}`)),
    deadline: number('deadline'), target: number('target'),
    prevention_effect: number('prevention'), repair_effect: number('repair')
  };
}
const fmt = (value, places = 3) => Number(value).toFixed(places);
const vec = values => `(${values.map(value => fmt(value)).join(', ')})ᵀ`;
const matrix = rows => rows.map(row => `[ ${row.map(value => fmt(value, 4)).join('   ')} ]`).join('\n');
function stageText(step, out, values) {
  if (step === 'matrix') return `Origin totals: ${out.origin_totals.map(value => fmt(value)).join(', ')} historical vehicle-weeks.\nA₀ (destination rows, origin columns):\n${matrix(out.matrix)}\nColumn sums: ${out.column_sums.map(value => fmt(value, 6)).join(', ')}. Each column is a probability distribution.`;
  if (step === 'advance') return `Initial state vector: ${vec(out.initial)} vehicles\nWeek-1 state vector = A₀ × initial state = ${vec(out.week_1)} expected vehicles\nWeek-2 state vector = A₀ × week-1 state = ${vec(out.week_2)} expected vehicles\nTotal expected fleet: ${fmt(out.fleet_total)} vehicles at each week.`;
  if (step === 'proposals') return Object.entries(out.scenarios).map(([name, item]) => `${name}: A =\n${matrix(item.matrix)}\nWeek-${out.deadline} state vector = ${vec(item.deadline_state)}; expected-ready target ${out.target}: ${item.meets_target ? 'met' : 'not met'}.`).join('\n\n') + '\n\nUse the flow diagram below to trace one origin column at a time.';
  if (step === 'modes') return Object.entries(out.scenarios).map(([name, item]) => `${name}: eigenvalues ${item.eigenvalues.join(', ')}.\nEigenvectors (matching order): ${item.eigenvectors.map(vec => `(${vec.join(', ')})ᵀ`).join('; ')}.\nStationary proportions: ${item.stationary ? vec(item.stationary) : 'not established'}; convergence from arbitrary initial states: ${item.converges ? 'established for this matrix' : 'not established'}.\nEigenpair residual: ${Number(item.eigen_residual).toExponential(2)}.`).join('\n\n') + '\n\nCompare a long-run distribution with the finite-deadline decision above.';
  if (step === 'holdout') return `Held-out origin counts: ${vec(out.origin_counts)} observed vehicle-weeks.\nPredicted destinations A₀h: ${vec(out.predicted)}.\nObserved destinations: ${vec(out.observed)}.\nObserved minus predicted: ${vec(out.residual)}.\nLargest entrywise difference between training and held-out conditional rates: ${(100*out.max_probability_difference).toFixed(2)} percentage points. This check concerns the baseline rates only.`;
  if (step === 'sensitivity') return Object.entries(out.scenarios).map(([name, item]) => `${name}: selected ${item.selected_effect_percent}% effect gives ${fmt(item.selected_expected_ready)} expected ready at week ${out.deadline}.\nSweep (effect → expected ready): ${item.curve.map(point => `${point.effect_percent}% → ${fmt(point.expected_ready, 2)}`).join('; ')}.`).join('\n\n') + `\n\nTarget: ${out.target} expected ready. This is a hypothetical effect sweep, not a probability statement.`;
  return '';
}
function invalidate() {
  completed.clear();
  for (const step of steps) {
    const node = document.querySelector(`#${step}-result`);
    node.className = 'stage-result stale';
    node.textContent = 'Inputs changed. Recalculate from step 01 to keep every result on the same exact inputs.';
  }
  dirty = Boolean(latest);
  clearFlow();
  note();
  controls();
}
async function runStep(step) {
  if (busy || !worker) return;
  let values;
  try { values = inputs(); } catch (error) { message(error.message, true); return; }
  busy = true;
  controls();
  message(`Running step ${steps.indexOf(step) + 1} of 6 in browser Python…`);
  try {
    const output = await request('stage', {step, values});
    let final;
    if (step === 'sensitivity') final = await request('analyze', values);
    const index = steps.indexOf(step);
    for (const later of steps.slice(index + 1)) {
      completed.delete(later);
      const node = document.querySelector(`#${later}-result`);
      node.className = 'stage-result stale';
      node.textContent = 'An earlier calculation changed. Run this step again.';
    }
    completed.set(step, {inputs: structuredClone(values), output: output.data});
    const node = document.querySelector(`#${step}-result`);
    node.className = 'stage-result current';
    node.textContent = stageText(step, output.data, values);
    if (step === 'proposals') showFlow({results: output.data.scenarios});
    if (final) {
      latest = final.record;
      dirty = false;
      const parsed = new DOMParser().parseFromString(final.html, 'text/html');
      const full = parsed.querySelector('.or-evidence');
      evidence.replaceChildren(document.importNode(full, true));
      report.hidden = false;
      document.querySelector('#evidence-download').hidden = true;
      note();
      message(`Six-step analysis complete. Run ID ${latest.run_id}. Save your evidence before closing.`);
    } else {
      note();
      message(`Step ${index + 1} complete. Interpret its output, then continue to step ${index + 2}.`);
    }
  } catch (error) {
    message(error.message, true);
    document.querySelector(`#${step}-result`).textContent = 'No new result. Correct the inputs and try again.';
  } finally {
    busy = false;
    controls();
  }
}

loadButton.addEventListener('click', async () => {
  loadButton.disabled = true;
  busy = true;
  message('Loading browser Python. The first load may take a minute…');
  controls();
  timer = setTimeout(() => message('Still loading Python and NumPy. Keep this page open; if the network blocks the download, use Colab.'), 15000);
  try {
    worker = new Worker(new URL('./lab-worker.mjs', import.meta.url), {type: 'module'});
    worker.onmessage = event => {
      if (event.data.type === 'progress') { message(event.data.message); return; }
      const entry = pending.get(event.data.id);
      if (!entry) return;
      clearTimeout(entry.timeout);
      pending.delete(event.data.id);
      event.data.error ? entry.reject(new Error(event.data.error)) : entry.resolve(event.data);
    };
    worker.onerror = () => { failWorker(); message('Browser Python could not load. Retry or open the Colab fallback.', true); };
    defaults = (await request('initialize')).data;
    setDefaults();
    loadButton.textContent = 'Calculator loaded';
    message('Ready. Predict the Ready-origin column, then construct A₀.');
  } catch (error) {
    failWorker();
    message(error.message, true);
  } finally {
    clearTimeout(timer);
    busy = false;
    controls();
  }
});
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', () => { updateEffects(); invalidate(); });
for (const step of steps) document.querySelector(`#${step}-button`).addEventListener('click', () => runStep(step));
resetButton.addEventListener('click', () => {
  setDefaults();
  invalidate();
  message('Default inputs restored. Begin again with step 01. The last completed export remains available.');
});
exportButton.addEventListener('click', async () => {
  if (busy || !latest) return;
  busy = true;
  controls();
  try {
    const output = await request('export');
    const link = document.querySelector('#evidence-download');
    link.href = `data:application/zip;base64,${output.base64}`;
    link.download = `OR_evidence_${output.runId}.zip`;
    link.hidden = false;
    link.click();
    message(`Evidence ZIP prepared for completed run ${output.runId}. If needed, use the download link below.`);
  } catch (error) { message(error.message, true); }
  finally { busy = false; controls(); }
});
for (const detail of document.querySelectorAll('.code-view[data-step]')) {
  detail.addEventListener('toggle', async () => {
    const code = detail.querySelector('pre');
    if (!detail.open || code.dataset.loaded) return;
    try {
      const response = await fetch('./fleet_model.py');
      if (!response.ok) throw new Error('Python source unavailable.');
      const source = await response.text();
      const step = detail.dataset.step;
      const match = source.match(new RegExp(`# WEB_CODE_BEGIN ${step}\\r?\\n([\\s\\S]*?)# WEB_CODE_END ${step}`));
      code.textContent = match ? match[1].trim() : 'Download the full model source below.';
      code.dataset.loaded = 'true';
    } catch (error) { code.textContent = error.message; }
  });
}
document.querySelector('#code-view').addEventListener('toggle', async event => {
  const code = document.querySelector('#model-code');
  if (!event.target.open || code.dataset.loaded) return;
  try {
    const response = await fetch('./fleet_model.py');
    if (!response.ok) throw new Error('Code view unavailable; use the source download.');
    code.textContent = await response.text();
    code.dataset.loaded = 'true';
  } catch (error) { code.textContent = error.message; }
});
if (!window.Worker || !window.WebAssembly) {
  loadButton.disabled = true;
  message('This browser does not support the calculator. Use the Colab fallback.', true);
}

