// Animated vehicle icons visualize proportional expected flow, never literal vehicles.
const rail = document.querySelector('#fleet-flow');
const scenario = document.querySelector('#flow-scenario');
const origin = document.querySelector('#flow-origin');
const week = document.querySelector('#flow-week');
const svg = document.querySelector('#flow-svg');
const values = document.querySelector('#flow-values');
const context = document.querySelector('#flow-context');
const play = document.querySelector('#flow-play');
const ns = 'http://www.w3.org/2000/svg';
const states = ['Ready', 'Routine maintenance', 'Major repair'];
const shortStates = ['Ready', 'Routine', 'Major'];
const colors = ['#006678', '#956200', '#693091'];
const destinations = [40, 130, 220];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let record = null, particles = [], frame = 0, playing = !reducedMotion, start = 0, dirty = false;

function el(name, attributes = {}, parent = svg) {
  const node = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  parent.append(node);
  return node;
}
function allocate(flow) {
  const positive = flow.map((amount, i) => amount > 1e-9 ? i : -1).filter(i => i >= 0);
  if (!positive.length) return [0, 0, 0];
  const counts = [0, 0, 0];
  positive.forEach(i => { counts[i] = 1; });
  const remaining = 12 - positive.length;
  const total = flow.reduce((sum, amount) => sum + amount, 0);
  const shares = flow.map(amount => amount / total * remaining);
  shares.forEach((share, i) => { counts[i] += Math.floor(share); });
  let extra = 12 - counts.reduce((sum, count) => sum + count, 0);
  const ranked = positive.toSorted((a, b) => (shares[b] % 1) - (shares[a] % 1));
  for (let j = 0; j < extra; j++) counts[ranked[j % ranked.length]]++;
  return counts;
}
function position(particle, progress) {
  const t = progress % 1;
  const y = destinations[particle.destination];
  const x = 39 * (1-t)**3 + 3*91*(1-t)**2*t + 3*126*(1-t)*t*t + 180*t**3;
  const yy = 130*(1-t)**3 + 3*130*(1-t)**2*t + 3*y*(1-t)*t*t + y*t**3;
  particle.node.setAttribute('transform', `translate(${x.toFixed(1)} ${yy.toFixed(1)})`);
}
function animate(timestamp) {
  if (!playing || !record || document.hidden) { frame = 0; return; }
  if (!start) start = timestamp;
  const progress = (timestamp - start) / 4200;
  particles.forEach(particle => position(particle, progress + particle.phase));
  frame = requestAnimationFrame(animate);
}
function schedule() {
  cancelAnimationFrame(frame);
  frame = 0;
  start = 0;
  play.textContent = playing ? 'Pause animation' : 'Play animation';
  if (playing && !document.hidden && particles.length) frame = requestAnimationFrame(animate);
}
function drawValues(flow, sourceCount) {
  values.replaceChildren();
  const intro = document.createElement('p');
  intro.textContent = `From ${states[Number(origin.value)]}: ${sourceCount.toFixed(2)} expected at the start of this week.`;
  values.append(intro);
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const heading = document.createElement('tr');
  for (const label of ['Next state', 'Expected']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    heading.append(th);
  }
  head.append(heading);
  table.append(head);
  const body = document.createElement('tbody');
  flow.forEach((amount, i) => {
    const row = document.createElement('tr');
    for (const value of [shortStates[i], amount.toFixed(2)]) {
      const td = document.createElement('td');
      td.textContent = value;
      if (value === shortStates[i]) td.setAttribute('aria-label',states[i]);
      row.append(td);
    }
    body.append(row);
  });
  table.append(body);
  values.append(table);
}
function draw() {
  if (!record) return;
  const result = record.results[scenario.value];
  const k = Number(week.value);
  const j = Number(origin.value);
  if (!result || !result.path[k] || !Number.isInteger(j) || j < 0 || j > 2) return;
  const sourceCount = result.path[k][j];
  const flow = result.matrix.map(row => row[j] * sourceCount);
  context.textContent = `Completed forecast · week ${k} to ${k+1}. ${dirty ? 'Inputs changed; run again to update.' : ''}`;
  svg.setAttribute('aria-label', `${scenario.value}, week ${k} to ${k+1}, from ${states[j]}: ${flow.map((amount,i)=>`${amount.toFixed(2)} expected to ${states[i]}`).join('; ')}`);
  svg.replaceChildren();
  particles = [];
  destinations.forEach((y, i) => {
    el('path', {d:`M 39 130 C 91 130 126 ${y} 180 ${y}`, fill:'none',
      stroke:colors[i], 'stroke-width':2.4, opacity:'.55'});
    el('circle', {cx:180, cy:y, r:13, fill:colors[i]});
    const label = el('text', {x:180,y:y+4,'text-anchor':'middle',fill:'#fff','font-size':11,'font-weight':700});
    label.textContent = ['R','U','M'][i];
  });
  el('circle', {cx:39,cy:130,r:16,fill:'#172b3d'});
  const originLabel = el('text', {x:39,y:134,'text-anchor':'middle',fill:'#fff','font-size':11,'font-weight':700});
  originLabel.textContent = ['R','U','M'][j];
  const counts = allocate(flow);
  counts.forEach((count, i) => {
    for (let n = 0; n < count; n++) {
      const car = el('g', {});
      el('rect', {x:-6,y:-3,width:12,height:6,rx:1.5,fill:colors[i],stroke:'#fff','stroke-width':.8},car);
      el('circle', {cx:-3.5,cy:3.4,r:1.5,fill:'#172b3d'},car);
      el('circle', {cx:3.5,cy:3.4,r:1.5,fill:'#172b3d'},car);
      particles.push({node:car,destination:i,phase:(n+.5)/count});
    }
  });
  particles.forEach(particle => position(particle,particle.phase));
  drawValues(flow,sourceCount);
  schedule();
}
for (const control of [scenario,origin,week]) control.addEventListener('change',draw);
play.addEventListener('click', () => { playing = !playing; schedule(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });

export function showFlow(nextRecord) {
  record = nextRecord;
  dirty = false;
  week.replaceChildren();
  const maxWeek = record.results.Baseline.path.length - 1;
  for (let k=0;k<maxWeek;k++) {
    const option = document.createElement('option');
    option.value = String(k);
    option.textContent = `${k} to ${k+1}`;
    week.append(option);
  }
  scenario.value = 'Baseline';
  origin.value = '0';
  week.value = '0';
  rail.hidden = false;
  draw();
}
export function setFlowDirty(value) {
  dirty = value;
  if (record) draw();
}
export function clearFlow() {
  cancelAnimationFrame(frame);
  frame = 0;
  record = null;
  particles = [];
  svg.replaceChildren();
  values.replaceChildren();
  rail.hidden = true;
}

