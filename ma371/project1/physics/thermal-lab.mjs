const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const CASES = {baseline: {h: 1, g: .5, label: 'Baseline'}, ventilation: {h: 1.35, g: .5, label: 'Ventilation'}, bridge: {h: 1, g: 1, label: 'Bridge'}};
const state = {oneVersion: 0, twoVersion: 0, oneBalance: null, oneCurve: null, twoModel: null, modes: null, forecast: null, selectedCase: 'baseline', lens: 'temperature', runs: [], evidence: [], play: null};
let worker, nextId = 0;
const pending = new Map();

function status(message, error = false) { $('lab-status').textContent = message; $('lab-status').classList.toggle('error', error); }
function result(id, message, kind = 'current') { const node = $(id); node.textContent = message; node.className = `step-result ${kind}`; }
function format(x, digits = 3) { return Number(x).toFixed(digits).replace(/\.?0+$/, '') || '0'; }
function signed(x, digits = 3) { return `${x >= 0 ? '+' : '−'}${format(Math.abs(x), digits)}`; }
function inputValues(id) { return Object.fromEntries([...$(id).querySelectorAll('input[data-key]')].map(input => [input.dataset.key, input.value])); }
function snapshot(values) { return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])); }
function stopAnimation() { if (state.play) cancelAnimationFrame(state.play.frame); state.play = null; $('one-play').textContent = 'Play'; $('two-play').textContent = 'Play'; }

function setupWorker() {
  if (worker) return;
  worker = new Worker(new URL('./thermal-worker.mjs?v=2', import.meta.url), {type: 'module'});
  worker.onmessage = ({data}) => {
    if (data.type === 'progress') { status(data.message); return; }
    const item = pending.get(data.id); if (!item) return; pending.delete(data.id);
    data.error ? item.reject(new Error(data.error)) : item.resolve(data.result);
  };
  worker.onerror = () => {
    for (const item of pending.values()) item.reject(new Error('Browser Python did not load. Check your connection and reload.'));
    pending.clear(); worker.terminate(); worker = null;
  };
}
function calculate(action, payload) {
  setupWorker(); const id = ++nextId;
  return new Promise((resolve, reject) => { pending.set(id, {resolve, reject}); worker.postMessage({id, action, payload}); });
}
async function run(action, payload, apply) {
  status(`Calculating ${action.replace('_', ' ')}…`);
  try { const output = await calculate(action, payload); apply(output); state.evidence.push({step: action, exact_inputs: snapshot(payload), exact_result: output, recorded_at: new Date().toISOString()}); $('export-button').disabled = false; status(`${action.replace('_', ' ')} calculation complete. Read and interpret the result before proceeding.`); }
  catch (error) { status(error.message, true); }
}
function invalidateOne() {
  stopAnimation(); state.oneVersion++; state.oneBalance = null; state.oneCurve = null;
  $('one-curve-button').disabled = true; $('one-play').disabled = true; $('one-time').disabled = true;
  document.querySelector('#one-curve-step .visual-grid').classList.add('stale-visual');
  for (const id of ['one-balance-result','one-curve-result']) if ($(id).classList.contains('current')) $(id).className = 'step-result stale';
  status('One-module inputs changed. Recalculate the heat balance and curve.');
}
function invalidateTwo() {
  stopAnimation(); state.twoVersion++; state.twoModel = null; state.modes = null; state.forecast = null;
  for (const id of ['modes-button','forecast-button','two-play','sensitivity-button']) $(id).disabled = true;
  $('validation-button').disabled = !state.runs.some(run => run.caseName === 'Baseline' && canonicalBaseline(run.inputs));
  $('two-time').disabled = true;
  document.querySelector('#forecast-step .visual-grid').classList.add('stale-visual');
  $('unit-reading').textContent = 'Inputs changed. The dimmed diagram and graph show the last completed run until you calculate again.';
  for (const id of ['two-model-result','modes-result','forecast-result','sensitivity-result']) if ($(id).classList.contains('current')) $(id).className = 'step-result stale';
  status('Two-module inputs changed. Rebuild the model, then its modes and forecast. Saved completed runs remain in the table.');
}

function thermalColor(temp) {
  const stops = [[15,[37,108,145]],[28,[67,157,161]],[34,[218,158,91]],[45,[191,67,53]]];
  if (temp <= 15) return 'rgb(37,108,145)'; if (temp >= 45) return 'rgb(191,67,53)';
  for (let i = 0; i < stops.length - 1; i++) if (temp <= stops[i+1][0]) {
    const f = (temp - stops[i][0]) / (stops[i+1][0] - stops[i][0]);
    return `rgb(${stops[i][1].map((v,j) => Math.round(v + f*(stops[i+1][1][j]-v))).join(',')})`;
  }
}
function at(points, t) {
  const low = Math.min(Math.floor(t), points.length - 1), high = Math.min(low + 1, points.length - 1), f = t - low;
  return points[low].map((v, i) => i === 0 ? t : v + f * (points[high][i] - v));
}
function setOneTime(t) {
  if (!state.oneCurve) return;
  const p = state.oneCurve.inputs, value = at(state.oneCurve.output.points, t)[1];
  $('one-time-value').textContent = `${format(t,1)} min`; $('one-temp').textContent = `${format(value,2)}°C`;
  $('one-component').style.setProperty('--thermal-color', thermalColor(value));
  $('one-power-label').textContent = `P = ${format(p.P)} kJ/min`;
  $('one-loss-label').textContent = `h(T − Tₐ) = ${signed(p.h*(value-p.Ta))} kJ/min`;
  drawChart('one-chart', state.oneCurve.output.points, t, {one:true, equilibrium:state.oneBalance.output.equilibrium});
}
function setTwoTime(t) {
  if (!state.forecast) return;
  const p = state.forecast.inputs, [_, t1, t2] = at(state.forecast.output.points, t);
  $('two-time-value').textContent = `${format(t,1)} min`;
  $('power-temp').textContent = `${format(t1,2)}°C`; $('control-temp').textContent = `${format(t2,2)}°C`;
  $('power-component').style.setProperty('--thermal-color', thermalColor(t1)); $('control-component').style.setProperty('--thermal-color', thermalColor(t2));
  $('power-component').querySelector('small').textContent = `P₁ = ${format(p.P1)} kJ/min`;
  $('control-component').querySelector('small').textContent = `P₂ = ${format(p.P2)} kJ/min`;
  const contact = p.g*(t1-t2), loss1=p.h*(t1-p.Ta), loss2=p.h*(t2-p.Ta);
  $('bridge-direction').textContent = Math.abs(contact) < 1e-10 ? '↔' : contact > 0 ? '→' : '←';
  $('bridge-flow').textContent = `${signed(contact)} kJ/min`;
  $('ambient-flows').textContent = `power ${signed(loss1)}, control ${signed(loss2)} kJ/min`;
  $('vent-indicator').classList.toggle('fan-on', state.forecast.caseName === 'ventilation');
  $('unit-reading').textContent = `At ${format(t,1)} min, the ${contact >= 0 ? 'power' : 'control'} module sends ${format(Math.abs(contact))} kJ/min across the bridge. Each ambient-flow term is signed; negative means the air warms that module.`;
  updateLens(t1,t2,p);
  drawChart('two-chart', state.forecast.output.points, t, {one:false, lens:state.lens, ambient:p.Ta});
}
function updateLens(t1,t2,p) {
  const s = t1+t2-2*p.Ta, d=t1-t2;
  const message = {
    temperature:`At this moment T₁ = ${format(t1,2)}°C and T₂ = ${format(t2,2)}°C. Compare each with its own limit.`,
    sum:`s = (T₁ − Tₐ) + (T₂ − Tₐ) = ${format(s,2)}°C. Contact exchange cancels in s′; ambient cooling removes energy from the pair.`,
    contrast:`d = T₁ − T₂ = ${format(d,2)}°C. The bridge flow is g·d = ${signed(p.g*d)} kJ/min and acts to reduce the contrast.`
  };
  $('mode-explanation').textContent = message[state.lens];
}

function svg(tag, attrs) { const node = document.createElementNS(NS, tag); for (const [key,val] of Object.entries(attrs)) node.setAttribute(key,String(val)); return node; }
function drawChart(id, points, time, options) {
  const plot = $(id); plot.replaceChildren();
  const one = options.one, width=680, height=one?360:380, L=63,R=25,T=22,B=48;
  const lens=options.lens||'temperature';
  const chartPoints=!one&&lens==='sum'?points.map(([t,a,b])=>[t,a+b-2*options.ambient]):!one&&lens==='contrast'?points.map(([t,a,b])=>[t,a-b]):points;
  const all=chartPoints.flatMap(row => row.slice(1)); if (one) all.push(options.equilibrium); else if(lens==='temperature')all.push(29,34.5);else all.push(0);
  let ymin=Math.floor((Math.min(...all)-2)/5)*5, ymax=Math.ceil((Math.max(...all)+2)/5)*5;
  if (ymax-ymin<10) ymax=ymin+10;
  const x=t => L+(width-L-R)*t/60, y=v => height-B-(height-T-B)*(v-ymin)/(ymax-ymin);
  for (let i=0;i<=4;i++) { const value=ymin+(ymax-ymin)*i/4; const yy=y(value); plot.append(svg('line',{x1:L,y1:yy,x2:width-R,y2:yy,class:'grid'})); const label=svg('text',{x:8,y:yy+5,class:'tick'}); label.textContent=format(value,1); plot.append(label); }
  for (const minute of [0,15,30,45,60]) { const xx=x(minute); plot.append(svg('line',{x1:xx,y1:T,x2:xx,y2:height-B,class:'grid'})); const label=svg('text',{x:xx-8,y:height-17,class:'tick'}); label.textContent=minute; plot.append(label); }
  plot.append(svg('line',{x1:L,y1:height-B,x2:width-R,y2:height-B,class:'axis'}));
  const unit=svg('text',{x:7,y:18,class:'axis-label'});unit.textContent='°C';plot.append(unit);const mins=svg('text',{x:width-80,y:height-9,class:'axis-label'});mins.textContent='minutes';plot.append(mins);
  const series=(index,klass)=>{const path=svg('path',{d:points.map((row,i)=>`${i?'L':'M'}${x(row[0]).toFixed(2)} ${y(row[index]).toFixed(2)}`).join(' '),class:klass});plot.append(path);const value=at(points,time)[index];plot.append(svg('circle',{cx:x(time),cy:y(value),r:7,class:'marker',fill:klass==='series-power'?'#c45138':'#2b8fa3'}));};
  if(one){plot.append(svg('line',{x1:L,y1:y(options.equilibrium),x2:width-R,y2:y(options.equilibrium),class:'limit'}));series(1,'series-power');}
  else if(lens==='temperature'){for(const limit of [34.5,29])plot.append(svg('line',{x1:L,y1:y(limit),x2:width-R,y2:y(limit),class:'limit'}));series(1,'series-power');series(2,'series-control');}
  else {const path=svg('path',{d:chartPoints.map((row,i)=>`${i?'L':'M'}${x(row[0]).toFixed(2)} ${y(row[1]).toFixed(2)}`).join(' '),class:lens==='sum'?'series-control':'series-power'});plot.append(path);plot.append(svg('circle',{cx:x(time),cy:y(at(chartPoints,time)[1]),r:7,class:'marker',fill:lens==='sum'?'#2b8fa3':'#c45138'}));}
  plot.append(svg('line',{x1:x(time),y1:T,x2:x(time),y2:height-B,stroke:'#69828d','stroke-width':1.5,'stroke-dasharray':'4 4'}));
  if(!one){plot.previousElementSibling.textContent={temperature:'Temperature, time, and limits',sum:'Overall elevation s = θ₁ + θ₂',contrast:'Temperature contrast d = T₁ − T₂'}[lens];plot.nextElementSibling.hidden=lens!=='temperature';}
  plot.setAttribute('aria-label',one?`One-module temperature at ${format(time,1)} minutes: ${format(at(points,time)[1],2)} degrees Celsius.`:lens==='temperature'?`Power ${format(at(points,time)[1],2)} and control ${format(at(points,time)[2],2)} degrees Celsius at ${format(time,1)} minutes.`:`${lens==='sum'?'Overall elevation':'Temperature contrast'} ${format(at(chartPoints,time)[1],2)} degrees Celsius at ${format(time,1)} minutes.`);
}
function play(which) {
  const current=which==='one'?'one-time':'two-time', button=which==='one'?'one-play':'two-play', setter=which==='one'?setOneTime:setTwoTime;
  if(state.play?.which===which){stopAnimation();return;} stopAnimation();
  let start=Number($(current).value); if(start>=60)start=0;
  const begun=performance.now();$(button).textContent='Pause';
  function frame(now){const t=Math.min(60,start+(now-begun)/220);$(current).value=t;setter(t);if(t<60)state.play.frame=requestAnimationFrame(frame);else stopAnimation();}
  state.play={which,frame:requestAnimationFrame(frame)};
}

function canonicalBaseline(p) {
  return p.C===10&&p.P1===20&&p.P2===4&&p.h===1&&p.g===.5&&p.Ta===20&&p.T10===20&&p.T20===20;
}
function addRun(entry) {
  state.runs.push(entry); const body=$('comparison-table').tBodies[0]; if(state.runs.length===1)body.replaceChildren();
  const row=document.createElement('tr'), out=entry.output;
  const cells=[entry.caseName,`${format(out.at30[0],2)}°C`,`${format(out.at30[1],2)}°C`,out.at30_within_limits?'Yes':'No',`${format(out.equilibrium[0],2)}°C, ${format(out.equilibrium[1],2)}°C`];
  for(const value of cells){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);
}
async function loadCode() {
  try {const source=await (await fetch('thermal_model.py')).text();for(const [step,id] of Object.entries({one_balance:'one-balance-code',one_curve:'one-curve-code',two_model:'two-model-code',modes:'modes-code',forecast:'forecast-code',validation:'validation-code',sensitivity:'sensitivity-code'})){const match=source.match(new RegExp(`# WEB_CODE_BEGIN ${step}\\n([\\s\\S]*?)# WEB_CODE_END ${step}`));$(id).textContent=match?match[1].trim():'Source is unavailable; download the model above.';}}catch{$$('.code-view pre').forEach(node=>node.textContent='Source unavailable offline.');}
}
function $$(selector){return [...document.querySelectorAll(selector)];}

$$('#one-inputs input').forEach(input=>input.addEventListener('input',invalidateOne));
$$('#two-inputs input').forEach(input=>input.addEventListener('input',()=>{state.selectedCase='custom';$$('[data-case]').forEach(button=>button.setAttribute('aria-pressed','false'));invalidateTwo();}));
$$('[data-case]').forEach(button=>button.addEventListener('click',()=>{state.selectedCase=button.dataset.case;const configuration=CASES[state.selectedCase];for(const key of ['h','g'])document.querySelector(`#two-inputs [data-key="${key}"]`).value=configuration[key];$$('[data-case]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));invalidateTwo();}));
$$('[data-lens]').forEach(button=>button.addEventListener('click',()=>{state.lens=button.dataset.lens;$$('[data-lens]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));if(state.forecast)setTwoTime(Number($('two-time').value));else $('mode-explanation').textContent={temperature:'Component temperatures show what each operating limit measures.',sum:'The sum mode follows overall thermal elevation. Bridge transfer cancels from its rate equation.',contrast:'The contrast mode follows the temperature difference. Greater bridge conductance speeds its decay.'}[state.lens];}));
$('one-time').addEventListener('input',event=>setOneTime(Number(event.target.value)));$('two-time').addEventListener('input',event=>setTwoTime(Number(event.target.value)));$('one-play').addEventListener('click',()=>play('one'));$('two-play').addEventListener('click',()=>play('two'));

$('one-balance-button').addEventListener('click',()=>{const version=state.oneVersion,p=inputValues('one-inputs');run('one_balance',p,out=>{if(version!==state.oneVersion)return;state.oneBalance={inputs:snapshot(p),output:out};state.oneCurve=null;$('one-curve-button').disabled=false;result('one-balance-result',`At t = 0: production ${format(out.production)} kJ/min, ambient loss ${signed(out.ambient_loss)} kJ/min.\nT′(0) = ${signed(out.initial_slope)} °C/min. Equilibrium T* = ${format(out.equilibrium)}°C; C/h = ${format(out.time_constant)} min.`);});});
$('one-curve-button').addEventListener('click',()=>{if(!state.oneBalance)return;const version=state.oneVersion,p=state.oneBalance.inputs;run('one_curve',p,out=>{if(version!==state.oneVersion)return;state.oneCurve={inputs:p,output:out};document.querySelector('#one-curve-step .visual-grid').classList.remove('stale-visual');$('one-time').disabled=false;$('one-play').disabled=false;$('one-time').value=0;setOneTime(0);result('one-curve-result',`T(10) = ${format(out.temperature_at_10,3)}°C. The heat-balance residual C·T′ − [P − h(T−Tₐ)] at 10 min is ${format(out.ode_residual_at_10,9)} kJ/min. This numerical check confirms the formula satisfies the modeled ODE at that time.`);});});
$('two-model-button').addEventListener('click',()=>{const version=state.twoVersion,p=inputValues('two-inputs');run('two_model',p,out=>{if(version!==state.twoVersion)return;state.twoModel={inputs:snapshot(p),output:out};state.modes=null;state.forecast=null;$('modes-button').disabled=false;result('two-model-result',`θ′ = Aθ + b, with θ = (T₁−Tₐ, T₂−Tₐ)ᵀ.\nA = [${out.A[0].map(x=>format(x,4)).join('   ')}]\n    [${out.A[1].map(x=>format(x,4)).join('   ')}] min⁻¹\nb = (${out.b.map(x=>format(x,4)).join(', ')})ᵀ °C/min\nAt power-on, T′ = (${out.initial_slopes.map(x=>signed(x)).join(', ')})ᵀ °C/min; contact flow = ${signed(out.initial_contact)} kJ/min.`, 'current');});});
$('modes-button').addEventListener('click',()=>{if(!state.twoModel)return;const version=state.twoVersion,p=state.twoModel.inputs;run('modes',p,out=>{if(version!==state.twoVersion)return;state.modes={inputs:p,output:out};$('forecast-button').disabled=false;result('modes-result',`v₊ = (1, 1)ᵀ, λ₊ = ${format(out.lambda_plus,4)} min⁻¹: overall elevation.\nv₋ = (1, −1)ᵀ, λ₋ = ${format(out.lambda_minus,4)} min⁻¹: temperature contrast.\ns* = ${format(out.s_star,3)}°C, d* = ${format(out.d_star,3)}°C.\nEquilibrium: T₁* = ${format(out.temperature_star[0],3)}°C; T₂* = ${format(out.temperature_star[1],3)}°C.`);});});
$('forecast-button').addEventListener('click',()=>{if(!state.modes)return;const version=state.twoVersion,p=state.modes.inputs,caseName=CASES[state.selectedCase]?.label||'Custom';run('forecast',p,out=>{if(version!==state.twoVersion)return;state.forecast={inputs:p,output:out,caseName};document.querySelector('#forecast-step .visual-grid').classList.remove('stale-visual');addRun(state.forecast);$('two-time').disabled=false;$('two-play').disabled=false;$('sensitivity-button').disabled=false;if(state.selectedCase==='baseline'&&canonicalBaseline(p))$('validation-button').disabled=false;$('two-time').value=0;setTwoTime(0);result('forecast-result',`${caseName} at 30 min: power ${format(out.at30[0],3)}°C (limit 34.5°C), control ${format(out.at30[1],3)}°C (limit 29.0°C). Both limits: ${out.at30_within_limits?'met':'not met'}.\nAt 30 min, contact flow = ${signed(out.heat_flow_at30.bridge_1_to_2)} kJ/min from module 1 toward module 2. Equilibrium: (${out.equilibrium.map(x=>format(x,3)).join(', ')})°C.`, 'current');if(!canonicalBaseline(p))status('Forecast complete. Compare only runs with the same initial conditions and heat inputs; the packet limits assume its stated case.');});});
$('validation-button').addEventListener('click',()=>{const baseline=state.runs.findLast(run=>run.caseName==='Baseline'&&canonicalBaseline(run.inputs));if(!baseline){status('Run the packet baseline case before checking its held-out readings.',true);return;}run('validation',baseline.inputs,out=>{const lines=out.rows.map(row=>`${row.time} min: predicted (${row.predicted.map(x=>format(x,2)).join(', ')})°C; observed (${row.measured.map(x=>format(x,2)).join(', ')})°C; residual (${row.residual.map(x=>signed(x,2)).join(', ')})°C.`);result('validation-result',lines.join('\n')+'\nA residual is observed minus predicted; a positive residual means the model predicted too cool.');});});
$('sensitivity-button').addEventListener('click',()=>{if(!state.forecast)return;const runSnapshot=state.forecast;run('sensitivity',runSnapshot.inputs,out=>{result('sensitivity-result',`${runSnapshot.caseName} at 22°C ambient: 30-min T₁ = ${format(out.at30[0],3)}°C; T₂ = ${format(out.at30[1],3)}°C. Both limits: ${out.at30[0]<=34.5&&out.at30[1]<=29?'met':'not met'}.\nThe initial temperatures also shift to 22°C, so the temperature elevations relative to ambient follow the same curves.`);});});
$('export-button').addEventListener('click',()=>{const data={case:'MA371 Physics synthetic thermal inquiry',created_at:new Date().toISOString(),completed_steps:state.evidence,completed_forecasts:state.runs};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='MA371_Physics_Completed_Evidence.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
loadCode();

