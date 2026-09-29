import {showFlow, setFlowDirty, clearFlow} from './flow-rail.mjs';

const form = document.querySelector('#fleet-form');
const loadButton = document.querySelector('#load-calculator');
const runButton = document.querySelector('#run-analysis');
const exportButton = document.querySelector('#export-evidence');
const resetButton = document.querySelector('#reset-inputs');
const status = document.querySelector('#calculator-status');
const evidence = document.querySelector('#evidence');
const resultNote = document.querySelector('#result-note');
const pending = new Map();
let worker, counter = 0, timer, latest, defaults, dirty = false, busy = false;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}
function controls() {
  runButton.disabled = !worker || !defaults || busy;
  exportButton.disabled = !latest || busy;
  resetButton.disabled = !defaults || busy;
  for (const input of form.querySelectorAll('input')) input.disabled = busy;
}
function request(action, inputs) {
  return new Promise((resolve, reject) => {
    const id = ++counter;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The calculator is taking too long. Reload it or use the Colab fallback.'));
      failWorker();
    }, action === 'initialize' ? 180000 : 30000);
    pending.set(id, {resolve, reject, timeout});
    worker.postMessage({id, action, inputs});
  });
}
function failWorker() {
  worker?.terminate();
  worker = null;
  defaults = null;
  latest = null;
  evidence.replaceChildren();
  clearFlow();
  document.querySelector('#evidence-download').hidden = true;
  resultNote.textContent = 'No active result. Reload the calculator and run again.';
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
    ? `Displayed run: ${latest.run_id}. ${dirty ? 'Inputs changed since this run; run again to update. Export still saves this completed run.' : 'Results match the current inputs.'}`
    : 'No result yet. Make your prediction, then select Run analysis.';
}
function number(name) {
  const input = form.elements.namedItem(name);
  if (input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) {
    throw new Error('Complete every numeric input with a finite number.');
  }
  return input.valueAsNumber;
}
function inputs() {
  return {counts: Array.from({length: 3}, (_, i) => Array.from({length: 3}, (_, j) => number(`count-${i}-${j}`))),
    initial: Array.from({length: 3}, (_, i) => number(`initial-${i}`)),
    deadline: number('deadline'), target: number('target'),
    prevention_effect: number('prevention'), repair_effect: number('repair')};
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
    worker.onerror = () => {
      message('Browser Python could not load. Retry or open the Colab fallback below.', true);
      failWorker();
    };
    defaults = (await request('initialize')).data;
    setDefaults();
    loadButton.textContent = 'Calculator loaded';
    message('Ready. Predict first; select Run analysis when you are ready to calculate.');
  } catch (error) {
    failWorker();
    message(error.message, true);
  } finally {
    clearTimeout(timer);
    busy = false;
    controls();
  }
});

form.addEventListener('input', () => { updateEffects(); dirty = true; note(); setFlowDirty(true); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !defaults) return;
  busy = true;
  latest = null;
  evidence.replaceChildren();
  clearFlow();
  document.querySelector('#evidence-download').hidden = true;
  resultNote.textContent = 'Calculating…';
  controls();
  message('Running the fleet model in your browser…');
  try {
    const output = await request('analyze', inputs());
    latest = output.record;
    dirty = false;
    // Model HTML is produced by trusted local Python with escaped, numeric-only input.
    const parsed = new DOMParser().parseFromString(output.html, 'text/html');
    const report = parsed.querySelector('.or-evidence');
    evidence.replaceChildren(document.importNode(report, true));
    showFlow(latest);
    note();
    message(`Analysis complete. ${output.historyCount} successful run${output.historyCount === 1 ? '' : 's'} in this session. Save your evidence before closing.`);
  } catch (error) {
    message(error.message, true);
    resultNote.textContent = 'The inputs did not produce a result. Correct them and run again; export is disabled.';
  } finally {
    busy = false;
    controls();
  }
});
resetButton.addEventListener('click', () => {
  setDefaults();
  dirty = Boolean(latest);
  note();
  setFlowDirty(dirty);
  message('Default inputs restored. Select Run analysis to calculate them. Session history is retained.');
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
    message(`Evidence ZIP prepared for run ${output.runId}. If the download did not start, select Download prepared evidence ZIP below. Refreshing this page clears session history.`);
  } catch (error) { message(error.message, true); }
  finally { busy = false; controls(); }
});
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

