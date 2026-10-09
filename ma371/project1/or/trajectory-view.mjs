import {setFlowSelection} from './flow-rail.mjs?v=20261009-visuals';

const panel = document.querySelector('#forecast-view');
const scenario = document.querySelector('#forecast-scenario');
const week = document.querySelector('#forecast-week');
const modePanel = document.querySelector('#mode-view');
const charts = {ready: document.querySelector('#ready-chart'), composition: document.querySelector('#composition-chart'), modes: document.querySelector('#mode-chart')};
const states = ['Ready', 'Routine maintenance', 'Major repair'];
const ns = 'http://www.w3.org/2000/svg';
const fmt = (x, digits = 2) => Number(x).toFixed(digits);
let forecast = null, eigen = null, inputs = null, snapshot = null;

function node(tag, attrs = {}, parent, text) {
  const element = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  if (parent) parent.append(element);
  return element;
}
function textLine(parent, content) { const p = document.createElement('p'); p.textContent = content; parent.append(p); return p; }
function color(selector) { return getComputedStyle(document.querySelector(selector) || document.documentElement).color; }
function palette() {
  const root = getComputedStyle(document.documentElement);
  return {ink: root.getPropertyValue('--ink').trim(), muted: root.getPropertyValue('--muted').trim(), paper: root.getPropertyValue('--paper').trim(), line: root.getPropertyValue('--line').trim(), accent: root.getPropertyValue('--accent').trim(), target: root.getPropertyValue('--gold').trim(),
    policies: [color('.policy-baseline'), color('.policy-prevention'), color('.policy-repair')], states: [color('.state-ready'), color('.state-routine'), color('.state-major')], modes: [color('.mode-1'), color('.mode-2'), color('.mode-3')]};
}
function scaffold(kind, title, ymin, ymax, label) {
  const p = palette(), host = charts[kind], width = Math.max(200, Math.round(host.clientWidth || charts.ready.clientWidth || 600)), height = kind === 'ready' ? 315 : 285;
  const left = width < 350 ? 42 : 55, right = 16, top = 40, bottom = kind === 'ready' ? 64 : 44;
  const maxWeek = forecast.scenarios.Baseline.path.length - 1;
  const sx = k => left + k / maxWeek * (width - left - right);
  const sy = value => top + (ymax - value) / (ymax - ymin) * (height - top - bottom);
  const svg = node('svg', {xmlns: ns, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title, 'font-family': 'system-ui, sans-serif', 'font-size': 12});
  node('title', {}, svg, title);
  node('desc', {}, svg, `Completed forecast; integer weeks 0 to ${maxWeek}. Shared selection: ${scenario.value}, week ${week.value}. ${label}.`);
  node('rect', {width, height, fill: p.paper}, svg);
  const shortLabel = {ready: 'Expected-ready vehicles', composition: 'Expected vehicles', modes: 'Ready contribution (vehicles)'};
  node('text', {x: left, y: 20, fill: p.ink, 'font-size': 12}, svg, width < 350 ? shortLabel[kind] : label);
  for (let i = 0; i <= 4; i++) {
    const value = ymin + (ymax - ymin) * i / 4, y = sy(value);
    node('line', {x1: left, x2: width - right, y1: y, y2: y, stroke: p.line}, svg);
    node('text', {x: left - 7, y: y + 4, 'text-anchor': 'end', fill: p.muted}, svg, fmt(value, Number.isInteger(value) ? 0 : 1));
  }
  const ticks = new Set([0, maxWeek]);
  const stride = Math.max(1, Math.ceil(maxWeek / (width < 350 ? 3 : 6)));
  for (let k = 0; k <= maxWeek; k += stride) ticks.add(k);
  for (const k of [...ticks].sort((a, b) => a - b)) node('text', {x: sx(k), y: height - bottom + 19, 'text-anchor': 'middle', fill: p.muted}, svg, k);
  node('text', {x: (left + width - right) / 2, y: height - 8, 'text-anchor': 'middle', fill: p.ink}, svg, 'Weeks from implementation');
  host.replaceChildren(svg);
  return {svg, p, width, height, left, right, top, bottom, sx, sy, maxWeek};
}
function line(c, values, color, dash = '') {
  node('polyline', {points: values.map((value, k) => `${c.sx(k)},${c.sy(value)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, ...(dash ? {'stroke-dasharray': dash} : {})}, c.svg);
  values.forEach((value, k) => {
    const point = node('circle', {cx: c.sx(k), cy: c.sy(value), r: k === Number(week.value) ? 4.5 : 2.5, fill: color, stroke: c.p.paper, 'stroke-width': 1}, c.svg);
    node('title', {}, point, `Week ${k}: ${fmt(value)} expected vehicles`);
    point.addEventListener('click', () => selectWeek(k));
  });
}
function marker(c, k, dash, caption, offset = -7) {
  const x = c.sx(k);
  node('line', {x1: x, x2: x, y1: c.top, y2: c.height - c.bottom, stroke: c.p.accent, 'stroke-width': 1.5, 'stroke-dasharray': dash}, c.svg);
  const nearRight = x > c.width - 90;
  node('text', {x: nearRight ? x - 4 : x + 4, y: c.top + offset, 'text-anchor': nearRight ? 'end' : 'start', fill: c.p.ink, 'font-size': 11}, c.svg, caption);
}
function readyPlot() {
  const total = inputs.initial.reduce((a, b) => a + b, 0), ymax = Math.max(total, forecast.target, 1);
  const c = scaffold('ready', 'Expected-ready trajectories for all three scenarios', 0, ymax, 'Expected-ready vehicles');
  const y = c.sy(forecast.target);
  node('line', {x1: c.left, x2: c.width - c.right, y1: y, y2: y, stroke: c.p.target, 'stroke-width': 2, 'stroke-dasharray': '6 4'}, c.svg);
  node('text', {x: c.left, y: c.height - 28, fill: c.p.target, 'font-size': 11}, c.svg, `Target ${forecast.target} · deadline week ${forecast.deadline}`);
  Object.entries(forecast.scenarios).forEach(([name, result], i) => line(c, result.path.map(x => x[0]), c.p.policies[i], ['6 4', '', '2 4'][i]));
  marker(c, forecast.deadline, '3 5', `Deadline ${forecast.deadline}`);
  if (Number(week.value) !== forecast.deadline) marker(c, Number(week.value), '', `Week ${week.value}`, 13);
  const reading = document.querySelector('#ready-reading'); reading.replaceChildren();
  textLine(reading, `Week ${week.value} expected-ready counts:`);
  textLine(reading, Object.entries(forecast.scenarios).map(([name, result]) => `${name}: ${fmt(result.path[Number(week.value)][0])}`).join(' · '));
}
function compositionPlot() {
  const result = forecast.scenarios[scenario.value], total = inputs.initial.reduce((a, b) => a + b, 0);
  const c = scaffold('composition', `${scenario.value}: expected fleet composition by week`, 0, Math.max(total, 1), 'Expected vehicles across all three states');
  const spacing = (c.width - c.left - c.right) / (c.maxWeek + 1), bar = Math.max(1, spacing * .72);
  // Center each bar in its own bin so the first and last bars stay inside the plot.
  const bx = k => c.left + (k + .5) * spacing;
  // Axis week labels use the same bin centers as the bars.
  for (const label of [...c.svg.querySelectorAll('text')]) {
    if (label.getAttribute('y') === String(c.height - c.bottom + 19)) label.setAttribute('x', bx(Number(label.textContent)));
  }
  result.path.forEach((state, k) => {
    const group = node('g', {}, c.svg);
    node('title', {}, group, `${scenario.value}, week ${k}: ${states.map((name, i) => `${name} ${fmt(state[i])}`).join(', ')}; total ${fmt(state.reduce((a, b) => a + b, 0))}`);
    let base = 0;
    state.forEach((amount, i) => {
      node('rect', {x: bx(k) - bar / 2, y: c.sy(base + amount), width: bar, height: Math.max(0, c.sy(base) - c.sy(base + amount)), fill: c.p.states[i]}, group);
      base += amount;
    });
    if (k === Number(week.value)) node('rect', {x: bx(k) - bar / 2 - 2, y: c.sy(total) - 2, width: bar + 4, height: c.sy(0) - c.sy(total) + 4, fill: 'none', stroke: c.p.ink, 'stroke-width': 2}, group);
    group.addEventListener('click', () => selectWeek(k));
  });
  const reading = document.querySelector('#state-reading'), state = result.path[Number(week.value)]; reading.replaceChildren();
  const p = textLine(reading, `${scenario.value} · week ${week.value} state vector `);
  const math = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math');
  math.innerHTML = `<msub><mover accent="true"><mi>x</mi><mo stretchy="true">&#x2192;</mo></mover><mn>${week.value}</mn></msub><mo>=</mo>`;
  p.append(math);
  const vector = document.createElement('span'); vector.className = 'column-vector'; vector.setAttribute('role', 'img'); vector.setAttribute('aria-label', `Column vector: ${state.map(x => fmt(x)).join(', ')} expected vehicles, ordered Ready, Routine maintenance, Major repair`);
  state.forEach(x => { const value = document.createElement('span'); value.textContent = fmt(x); vector.append(value); }); p.append(vector);
  textLine(reading, `${states.map((name, i) => `${name}: ${fmt(state[i])}`).join(' · ')}. Total: ${fmt(state.reduce((a, b) => a + b, 0))} expected vehicles.`);
}
function modesPlot() {
  if (!eigen || !forecast) return;
  const result = eigen.scenarios[scenario.value], data = result.modal_history;
  const explanation = document.querySelector('#mode-explanation'), reading = document.querySelector('#mode-reading'), legend = document.querySelector('#mode-legend');
  explanation.replaceChildren(); reading.replaceChildren(); legend.replaceChildren();
  const download = modePanel.querySelector('[data-figure=modes]');
  if (!data?.available) {
    charts.modes.replaceChildren(); download.disabled = true;
    textLine(explanation, data?.reason || 'Recalculate step 04 to obtain the mode history for these inputs.');
    return;
  }
  download.disabled = false;
  data.modes.forEach((mode, i) => { const item = document.createElement('span'); item.className = `mode-${i + 1}`; item.textContent = `Mode ${i + 1}: λ = ${Number(mode.eigenvalue).toPrecision(5)} · ${['solid', 'dashed', 'dotted'][i]}`; legend.append(item); });
  textLine(explanation, `${scenario.value}. ${result.converges ? 'The eigenvalue-1 contribution stays constant; the other mode contributions approach zero for these rates.' : 'Use the displayed eigenvalues to identify constant, oscillating, and shrinking contributions for these edited rates.'}`);
  const values = data.modes.flatMap(mode => mode.ready_contribution), low = Math.min(0, ...values), high = Math.max(0, ...values), pad = Math.max(1, (high - low) * .08);
  const c = scaffold('modes', `${scenario.value}: ready-coordinate eigenmode contributions by week`, low - pad, high + pad, 'Ready-coordinate contribution (expected vehicles)');
  node('line', {x1: c.left, x2: c.width - c.right, y1: c.sy(0), y2: c.sy(0), stroke: c.p.muted, 'stroke-width': 1.5}, c.svg);
  data.modes.forEach((mode, i) => line(c, mode.ready_contribution, c.p.modes[i], ['', '6 4', '2 4'][i]));
  marker(c, Number(week.value), '', `Week ${week.value}`);
  const k = Number(week.value), contributions = data.modes.map(mode => mode.ready_contribution[k]);
  const sumText = contributions.map((x, i) => i === 0 ? fmt(x, 3) : `${x < 0 ? '−' : '+'} ${fmt(Math.abs(x), 3)}`).join(' ');
  textLine(reading, `Week ${k}: ${sumText} = ${fmt(contributions.reduce((a, b) => a + b, 0), 3)} expected ready. Direct forecast: ${fmt(forecast.scenarios[scenario.value].path[k][0], 3)}.`);
  textLine(reading, `Largest entrywise eigenmode reconstruction discrepancy over the displayed weeks: ${Number(data.reconstruction_error).toExponential(2)} expected vehicles.`);
  const detail = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Inspect the eigenvector coordinates'; detail.append(summary);
  data.modes.forEach((mode, i) => textLine(detail, `Mode ${i + 1}: c${i + 1} = ${fmt(mode.coefficient, 5)}; eigenvector column = (${mode.eigenvector.map(x => fmt(x, 5)).join(', ')})ᵀ. Ready contribution at week k is c${i + 1} × λ${i + 1}^k × its first coordinate.`)); reading.append(detail);
}
function redraw() {
  if (!forecast) return;
  document.querySelector('#forecast-week-value').value = week.value;
  document.querySelector('#forecast-previous').disabled = Number(week.value) === 0;
  document.querySelector('#forecast-next').disabled = Number(week.value) === Number(week.max);
  readyPlot(); compositionPlot(); modesPlot();
  setFlowSelection(scenario.value, Number(week.value));
}
function selectWeek(k) { week.value = String(Math.max(0, Math.min(Number(week.max), k))); redraw(); }
scenario.addEventListener('change', redraw);
week.addEventListener('input', redraw);
document.querySelector('#forecast-previous').addEventListener('click', () => selectWeek(Number(week.value) - 1));
document.querySelector('#forecast-next').addEventListener('click', () => selectWeek(Number(week.value) + 1));
modePanel.addEventListener('toggle', () => { if (modePanel.open) modesPlot(); });
let resizeFrame;
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (forecast) redraw(); }); }).observe(panel);
new MutationObserver(redraw).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);

for (const button of document.querySelectorAll('[data-figure]')) button.addEventListener('click', () => {
  const kind = button.dataset.figure, svg = charts[kind].querySelector('svg');
  if (!forecast || !svg) return;
  const copy = svg.cloneNode(true);
  // Include the HTML legend and selected view in the standalone exported figure.
  const p = palette(), box = svg.viewBox.baseVal, footerHeight = 112;
  copy.setAttribute('viewBox', `0 0 ${box.width} ${box.height + footerHeight}`);
  node('rect', {x: 0, y: box.height, width: box.width, height: footerHeight, fill: p.paper}, copy);
  node('text', {x: 12, y: box.height + 17, fill: p.ink, 'font-size': 11}, copy, kind === 'ready' ? 'Readiness · all scenarios' : `${kind === 'modes' ? 'Eigenmodes' : 'Composition'} · ${scenario.value}`);
  node('text', {x: 12, y: box.height + 34, fill: p.ink, 'font-size': 11}, copy, `Selected week ${week.value} · deadline ${forecast.deadline}`);
  const labels = kind === 'ready' ? Object.keys(forecast.scenarios) : kind === 'composition' ? states : eigen.scenarios[scenario.value].modal_history.modes.map((m, i) => `Mode ${i + 1}: λ = ${Number(m.eigenvalue).toPrecision(5)}`);
  const colors = kind === 'ready' ? p.policies : kind === 'composition' ? p.states : p.modes;
  const dashes = kind === 'ready' ? ['6 4', '', '2 4'] : ['', '6 4', '2 4'];
  labels.forEach((label, i) => {
    const y = box.height + 54 + 17 * i;
    if (kind === 'composition') node('rect', {x: 12, y: y - 8, width: 16, height: 9, fill: colors[i]}, copy);
    else node('line', {x1: 12, x2: 28, y1: y - 4, y2: y - 4, stroke: colors[i], 'stroke-width': 2.5, ...(dashes[i] ? {'stroke-dasharray': dashes[i]} : {})}, copy);
    node('text', {x: 36, y, fill: p.ink, 'font-size': 11}, copy, label);
  });
  node('metadata', {}, copy, JSON.stringify({snapshot_id: snapshot, calculation: 'completed proposals stage', inputs, selected_scenario: scenario.value, selected_week: Number(week.value), figure: kind, forecasts: forecast, ...(kind === 'modes' ? {eigenstructure: eigen} : {})}));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], {type: 'image/svg+xml'}));
  const link = document.createElement('a'); link.href = url; link.download = `OR_${kind}_${scenario.value.replaceAll(' ', '_')}_week_${week.value}.svg`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
export function showForecast(data, values) {
  forecast = structuredClone(data); inputs = structuredClone(values); eigen = null; snapshot = new Date().toISOString();
  panel.hidden = false; modePanel.hidden = true;
  scenario.value = 'Baseline'; week.max = String(data.scenarios.Baseline.path.length - 1); week.value = String(data.deadline);
  const total = values.initial.reduce((a, b) => a + b, 0);
  document.querySelector('#forecast-context').textContent = `Completed forecast · ${total} vehicles · deadline week ${data.deadline} · target ${data.target} expected ready · prevention effect ${values.prevention_effect}% · faster-repair effect ${values.repair_effect}%.`;
  redraw();
}
export function showModes(data) { eigen = structuredClone(data); modePanel.hidden = false; modesPlot(); }
export function clearModes() { eigen = null; modePanel.hidden = true; charts.modes.replaceChildren(); }
export function clearForecast() { forecast = null; inputs = null; snapshot = null; panel.hidden = true; for (const chart of Object.values(charts)) chart.replaceChildren(); clearModes(); }
