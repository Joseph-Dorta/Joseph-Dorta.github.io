const $ = (id) => document.getElementById(id);
const order = ['H', 'P', 'S', 'E', 'R'];
const codeNames = {H: 'Home', P: 'Planning Guide', S: 'Safety Checklist', E: 'Worked Examples', R: 'Reference Card'};
const resultIds = ['transition-result', 'google-result', 'step-result', 'stationary-result', 'validation-result', 'hybrid-result', 'hybrid-options-result'];
const svgNS = 'http://www.w3.org/2000/svg';
let caseData;
let labels = order.slice();
let adjacency = zeroMatrix(5);
let scenario = 'Custom';
let selectedOrigin = null;
let alpha = .85;
let state = null;
let stepNumber = 0;
let version = 0;
let runs = [];
let records = [];
let counts = {};
let worker;
let nextId = 0;
let stepBusy = false;
const pending = new Map();

function zeroMatrix(n) { return Array.from({length: n}, () => Array(n).fill(0)); }
function clean(text) { return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fixed(x, digits=4) { return Number(x).toFixed(digits); }
function percent(x, digits=2) { return `${(100*x).toFixed(digits)}%`; }
function matrixFromLinks(list, pageLabels=order) {
  const A = zeroMatrix(pageLabels.length);
  for (const [from, to] of list) A[pageLabels.indexOf(to)][pageLabels.indexOf(from)] = 1;
  return A;
}
function baselineA() { return matrixFromLinks(caseData.baseline_links); }
function currentPayload() { return {adjacency: adjacency.map(row => row.slice()), alpha}; }
function setStatus(message, error=false) { $('lab-status').textContent = message; $('lab-status').classList.toggle('error', error); }
function markStale(message='Inputs changed. Recalculate the affected stages before using their results.') {
  version++;
  for (const id of resultIds) if ($(id).classList.contains('current')) $(id).classList.add('stale');
  setStatus(message);
}
function setResult(id, html) { const el=$(id); el.innerHTML=html; el.classList.remove('stale'); el.classList.add('current'); }
function gridHtml(M, rowLabels=labels, colLabels=labels, digits=3) {
  let lines = [`             ${colLabels.map(x => x.padStart(8)).join('')}`];
  for (let i=0;i<M.length;i++) lines.push(`${String(rowLabels[i]).padStart(11)}  ${M[i].map(x=>fixed(x,digits).padStart(8)).join('')}`);
  return `<pre class="math-output">${clean(lines.join('\n'))}</pre>`;
}
function vectorHtml(v, pageLabels=labels) { return `<pre class="math-output">${clean(pageLabels.map((x,i)=>`${x}: ${fixed(v[i],6)}`).join('    '))}</pre>`; }
function edges() { const out=[]; for(let j=0;j<labels.length;j++) for(let i=0;i<labels.length;i++) if(adjacency[i][j]) out.push([labels[j],labels[i]]); return out; }

function renderMatrix() {
  const table=document.createElement('table'); table.className='matrix-editor-table';
  table.innerHTML=`<caption>Rows are destinations; columns are origins.</caption><thead><tr><th scope="col">to \\ from</th>${labels.map(x=>`<th scope="col" class="${selectedOrigin===x?'selected-column':''}">${x}</th>`).join('')}</tr></thead><tbody>${labels.map((to,i)=>`<tr><th scope="row">${to}</th>${labels.map((from,j)=>`<td>${i===j?'<span class="diagonal" title="Self-links are excluded">—</span>':`<button type="button" data-row="${i}" data-col="${j}" class="${adjacency[i][j]?'edge-on':''} ${selectedOrigin===from?'selected-column':''}" aria-label="Link from ${clean(from)} to ${clean(to)}: ${adjacency[i][j]?'present':'absent'}" aria-pressed="${Boolean(adjacency[i][j])}">${adjacency[i][j]}</button>`}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $('matrix-editor').replaceChildren(table);
  table.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>toggleEdge(Number(button.dataset.col),Number(button.dataset.row))));
  $('link-list').textContent=`Links: ${edges().map(x=>x.join(' → ')).join(', ') || 'none'}.`;
}

function svgEl(tag, attrs={}) { const e=document.createElementNS(svgNS,tag); for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,String(v)); return e; }
function renderGraph() {
  const svg=$('graph-svg'); svg.replaceChildren();
  const mobile=matchMedia('(max-width:650px)').matches;
  const w=mobile?500:680,h=mobile?500:460,cx=w/2,cy=h/2,rx=mobile?169:235,ry=mobile?169:153;
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const defs=svgEl('defs'); const marker=svgEl('marker',{id:'arrow-head',markerWidth:12,markerHeight:12,refX:9,refY:6,orient:'auto',markerUnits:'userSpaceOnUse'});
  marker.append(svgEl('path',{d:'M 1 1 L 10 6 L 1 11 z',fill:'#54869a'}));defs.append(marker);
  const proposed=svgEl('marker',{id:'arrow-new',markerWidth:12,markerHeight:12,refX:9,refY:6,orient:'auto',markerUnits:'userSpaceOnUse'});
  proposed.append(svgEl('path',{d:'M 1 1 L 10 6 L 1 11 z',fill:'#d39c36'}));defs.append(proposed);svg.append(defs);
  const points=labels.map((_,i)=>({x:cx+rx*Math.cos(-Math.PI/2+i*2*Math.PI/labels.length),y:cy+ry*Math.sin(-Math.PI/2+i*2*Math.PI/labels.length)}));
  for(let j=0;j<labels.length;j++) for(let i=0;i<labels.length;i++) if(adjacency[i][j]) {
    const a=points[j],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
    const side=adjacency[j][i] ? 14 : 0;
    const sx=a.x+ux*58-uy*side,sy=a.y+uy*43+ux*side,ex=b.x-ux*58-uy*side,ey=b.y-uy*43+ux*side;
    const fresh=scenario==='Option 1'&&labels[j]==='H'&&labels[i]==='R'||scenario==='Option 2'&&labels[j]==='P'&&labels[i]==='R';
    const path=svgEl('path',{d:`M ${sx} ${sy} Q ${(sx+ex)/2-uy*side} ${(sy+ey)/2+ux*side} ${ex} ${ey}`,class:`graph-edge${fresh?' proposed':''}`,'marker-end':`url(#${fresh?'arrow-new':'arrow-head'})`});
    const title=svgEl('title');title.textContent=`${labels[j]} to ${labels[i]}`;path.append(title);svg.append(path);
  }
  labels.forEach((code,i)=>{
    const {x,y}=points[i],g=svgEl('g',{class:`graph-node${selectedOrigin===code?' selected':''}`,role:'button',tabindex:0,'aria-label':`${code}: ${codeNames[code]||`Page ${code}`}. ${selectedOrigin===code?'Origin selected':'Select as origin or destination'}`});
    g.append(svgEl('rect',{x:x-54,y:y-31,width:108,height:62,rx:10}));
    const t=svgEl('text',{x,y:y-3,class:'code'});t.textContent=code;g.append(t);
    const shortNames={H:'Home',P:'Planning',S:'Safety',E:'Examples',R:'Reference'};
    const name=svgEl('text',{x,y:y+18,class:'name'});name.textContent=shortNames[code]||`Page ${code}`;g.append(name);
    g.addEventListener('click',()=>selectNode(i));g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(i);}});svg.append(g);
  });
  const edgeCount=edges().length; $('graph-summary').textContent=`${labels.length} pages · ${edgeCount} link${edgeCount===1?'':'s'}`;
  svg.setAttribute('aria-label',`${labels.length} labeled pages and ${edgeCount} directed links. ${edges().map(x=>x.join(' to ')).join('; ')||'No links.'}`);
}
function selectNode(index) {
  if(selectedOrigin===null) {selectedOrigin=labels[index];$('graph-instruction').textContent=`${selectedOrigin} is the origin. Select a different page as the destination, or select ${selectedOrigin} again to cancel.`;renderGraph();renderMatrix();return;}
  const from=labels.indexOf(selectedOrigin);selectedOrigin=null;
  if(from===index){$('graph-instruction').textContent='Selection canceled. Choose an origin page.';renderGraph();renderMatrix();return;}
  toggleEdge(from,index);
}
function toggleEdge(origin,destination) {
  adjacency[destination][origin]=1-adjacency[destination][origin]; scenario='Custom';state=null;stepNumber=0;
  $('graph-instruction').textContent=`${labels[origin]} → ${labels[destination]} ${adjacency[destination][origin]?'added':'removed'}. Choose another origin to continue.`;
  markStale(`Directed link ${labels[origin]} → ${labels[destination]} ${adjacency[destination][origin]?'added':'removed'}. Recalculate before interpreting results.`);
  renderGraph();renderMatrix();renderStartChoices();
}
function loadScenario(name) {
  labels=order.slice(); adjacency=baselineA(); scenario=name;selectedOrigin=null;
  if(name!=='Baseline'){const [from,to]=caseData.options[name];adjacency[labels.indexOf(to)][labels.indexOf(from)]=1;}
  state=null;stepNumber=0;renderGraph();renderMatrix();renderStartChoices();
  $('graph-instruction').textContent=`${name} loaded. Inspect the graph and matrix before calculating.`;
  markStale(`${name} links loaded. Earlier completed comparisons are retained with their original inputs.`);
}
function loadExample() {
  labels=['A','B','C'];adjacency=matrixFromLinks([['A','B'],['A','C'],['B','C'],['C','A'],['C','B']],labels);scenario='Three-page example';selectedOrigin=null;state=null;stepNumber=0;
  renderGraph();renderMatrix();renderStartChoices();$('graph-instruction').textContent='Three-page example: A links to B and C; B to C; C to A and B.';markStale('Three-page example loaded. Predict the A column of T before calculating.');
}
function clearLinks(){adjacency=zeroMatrix(labels.length);scenario='Custom';selectedOrigin=null;state=null;stepNumber=0;renderGraph();renderMatrix();renderStartChoices();markStale('All links cleared. Add directed arrows to define a network.');}
function renderStartChoices(){ $('start-page').innerHTML='<option value="uniform">Uniform on all pages</option>'+labels.map(x=>`<option value="${x}">Start entirely at ${clean(x)}</option>`).join(''); $('step-caption').textContent='Set 𝐩₀, then predict the next distribution.';$('flow-bars').replaceChildren();}

function python(action,payload) {
  if(!worker){worker=new Worker(new URL('./pagerank-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(data.type==='progress'){setStatus(data.message);return;}const item=pending.get(data.id);if(!item)return;pending.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data.result);};
    worker.onerror=event=>{for(const item of pending.values()) item.reject(new Error(event.message||'Browser Python failed to load.'));pending.clear();};
  }
  return new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
}
async function calculate(buttonId,action,payload,display){
  const button=$(buttonId),prior=button.textContent,captured=version,capturedAlpha=alpha;button.disabled=true;button.textContent='Calculating…';setStatus('Running the requested Python calculation…');
  try{const output=await python(action,payload);if(captured!==version||capturedAlpha!==alpha){setStatus('Inputs changed while Python was running. That result was discarded.');return;}display(output);records.push({action,inputs:payload,output,completed_at:new Date().toISOString()});$('export-evidence').disabled=false;setStatus(`${action.replaceAll('_',' ')} completed. Interpret the result before moving on.`);}
  catch(error){setStatus(error.message,true);}
  finally{button.disabled=false;button.textContent=prior;}
}
function runTransition(){calculate('calculate-transition','transition',currentPayload(),r=>{setResult('transition-result',`<p><strong>Outgoing links by origin:</strong> ${labels.map((x,i)=>`${x}: ${r.outgoing[i]}`).join('; ')}.</p>${gridHtml(r.T)}<p><strong>Column sums:</strong> ${r.column_sums.map(x=>fixed(x,3)).join(', ')}. ${r.dangling.length?`Dangling: ${r.dangling.map(i=>labels[i]).join(', ')}; each receives a uniform column.`:'No dangling columns.'}</p>`);});}
function runGoogle(){calculate('calculate-google','google',currentPayload(),r=>{setResult('google-result',`<p>Restart contribution to <em>each</em> destination, from any origin: ${fixed(r.restart_each,4)}. Every column still sums to 1.</p>${gridHtml(r.G)}<p><strong>Check:</strong> column sums ${r.column_sums.map(x=>fixed(x,3)).join(', ')}.</p>`);});}
function resetState(){version++;const chosen=$('start-page').value,n=labels.length;state=chosen==='uniform'?Array(n).fill(1/n):labels.map(x=>x===chosen?1:0);stepNumber=0;$('flow-bars').replaceChildren();setResult('step-result',`<p><strong>𝐩₀</strong> is a probability distribution, not observed clicks.</p>${vectorHtml(state)}`);$('step-caption').textContent=`Set 𝐩₀: ${chosen==='uniform'?'uniform':`all mass on ${chosen}`}. Predict the next distribution.`;setStatus('Starting distribution set. Advance when ready.');}
function renderFlow(item){const box=$('flow-bars');box.innerHTML=item.p.map((p,i)=>`<div class="flow-row"><strong>${labels[i]} · ${clean(codeNames[labels[i]]||'Page')}</strong><div class="track" aria-label="${labels[i]}: follow ${percent(item.follow[i])}, restart ${percent(item.restart[i])}"><span class="follow" style="width:${100*item.follow[i]}%"></span><span class="restart" style="width:${100*item.restart[i]}%"></span></div><span class="value">${percent(p,1)}</span></div>`).join('');}
function advance(steps,buttonId){if(stepBusy)return;if(!state)resetState();stepBusy=true;$('advance-one').disabled=true;$('advance-five').disabled=true;const startK=stepNumber;calculate(buttonId,steps===1?'step':'iterate',{...currentPayload(),p:state.slice(),steps},r=>{state=r.p;stepNumber=startK+steps;const last=r.history.at(-1);renderFlow(last);setResult('step-result',`<p><strong>𝐩${stepNumber}</strong> after ${stepNumber} navigation update${stepNumber===1?'':'s'}; sum = ${fixed(last.sum,6)}.</p>${vectorHtml(last.p)}<p>${steps>1?'The final bar display separates follow and restart contributions on the last of five steps.':''} This finite-step result need not equal the stationary ranking.</p>`);$('step-caption').textContent=`The bars show the components of the update from 𝐩${stepNumber-1} to 𝐩${stepNumber}.`;}).finally(()=>{stepBusy=false;$('advance-one').disabled=false;$('advance-five').disabled=false;});}
function renderRuns(){const body=$('run-table').querySelector('tbody');body.innerHTML=runs.length?runs.map(r=>`<tr><th scope="row">${clean(r.scenario)}</th><td>${fixed(r.alpha,2)}</td><td><strong>${percent(r.p[4])}</strong></td><td>${r.p.slice(0,4).map((x,i)=>`${order[i]} ${percent(x,1)}`).join(' · ')}</td><td>L1 residual ${r.residual.toExponential(2)}</td></tr>`).join(''):'<tr><td colspan="5">No completed run yet.</td></tr>';}
function runStationary(){const payload=currentPayload(),snapshot=scenario,links=edges(),snapshotLabels=labels.slice();calculate('calculate-stationary','stationary',payload,r=>{const target=snapshotLabels.includes('R')?`<strong>Reference Card share:</strong> ${percent(r.p[snapshotLabels.indexOf('R')])}. `:'This three-page example has no Reference Card decision. ';setResult('stationary-result',`<p><strong>${clean(snapshot)}:</strong> stationary eigenvector for eigenvalue 1, normalized so its entries sum to ${fixed(r.sum,6)}.</p>${vectorHtml(r.p,snapshotLabels)}<p>${target}<span class="check">Arithmetic check:</span> ||G𝐩* − 𝐩*||₁ = ${r.residual_l1.toExponential(3)} after ${r.iterations} iterations.</p><p>This result describes the model's long-run navigation probabilities; it is not an observed visit rate.</p>`);if(snapshotLabels.length===5){runs.push({scenario:snapshot,alpha,p:r.p.slice(),residual:r.residual_l1,links,adjacency:payload.adjacency});renderRuns();}});}
function initialCounts(){const out={};for(const [origin, destinations] of Object.entries(caseData.held_out_counts))out[String(order.indexOf(origin))]=order.map(dest=>Number(destinations[dest]||0));return out;}
function renderCounts(){const origins=['H','P','E'];$('click-table').querySelector('tbody').innerHTML=origins.map(origin=>{const j=order.indexOf(origin),values=counts[String(j)],allowed=caseData.baseline_links.filter(([from])=>from===origin).map(([,to])=>to);return `<tr><th scope="row">${origin} · ${clean(codeNames[origin])}</th>${order.map((dest,i)=>`<td>${allowed.includes(dest)?`<input type="number" min="0" step="1" data-origin="${j}" data-dest="${i}" value="${values[i]}" aria-label="Clicks from ${origin} to ${dest}">`:'<span class="unavailable">—</span>'}</td>`).join('')}<td class="total">${values.reduce((a,b)=>a+b,0)}</td></tr>`;}).join('');$('click-table').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{const v=Number(input.value);if(!Number.isInteger(v)||v<0){input.value=counts[input.dataset.origin][Number(input.dataset.dest)];setStatus('Click counts must be nonnegative whole numbers.',true);return;}counts[input.dataset.origin][Number(input.dataset.dest)]=v;input.closest('tr').querySelector('.total').textContent=counts[input.dataset.origin].reduce((a,b)=>a+b,0);markStale('Hypothetical click counts changed. Rerun validation or the hybrid model.');}));}
function clickPayload(){return {alpha,baseline_adjacency:baselineA(),click_counts:structuredClone(counts)};}
function validate(){const j=order.indexOf($('observed-origin').value);calculate('analyze-clicks','validate',{...clickPayload(),origin:j},r=>{const dest=order.map((x,i)=>`<tr><th scope="row">${x}</th><td>${percent(r.model[i])}</td><td>${percent(r.observed[i])}</td><td>${percent(r.absolute_gaps[i])}</td></tr>`).join('');setResult('validation-result',`<p><strong>Origin ${order[j]}:</strong> ${r.events} held-out click events. The equal-link model and observed distribution differ by as much as ${percent(r.max_gap)} in one destination.</p><div class="table-scroll"><table><thead><tr><th>Destination</th><th>Equal-link model</th><th>Observed</th><th>Absolute gap</th></tr></thead><tbody>${dest}</tbody></table></div><p>These observations test the baseline link-following assumption only. They contain no click evidence for either proposed link.</p>`);});}
function hybridBaseline(){calculate('build-hybrid','hybrid_baseline',clickPayload(),r=>{setResult('hybrid-result',`<p><strong>Hybrid baseline R share:</strong> ${percent(r.p[4])}. Click-informed origins: ${r.observed_origins.map(i=>order[i]).join(', ')}; still structural: ${r.structural_origins.map(i=>order[i]).join(', ')}.</p>${gridHtml(r.T,order,order)}<p>These columns use different evidence; treating the whole matrix as measured would overstate the data.</p>`);});}
function hybridOptions(){const q1=Number($('q1-range').value),q2=Number($('q2-range').value);calculate('compare-hybrid','hybrid_options',{...clickPayload(),q1,q2},r=>{const b=r.scenarios.baseline.p[4],one=r.scenarios.option1.p[4],two=r.scenarios.option2.p[4];setResult('hybrid-options-result',`<p><strong>Hypothetical shares:</strong> q₁ = ${percent(q1,0)}, q₂ = ${percent(q2,0)}. The new links have no observed click counts.</p><p>Reference Card stationary shares: baseline <strong>${percent(b)}</strong>; Option 1 <strong>${percent(one)}</strong>; Option 2 <strong>${percent(two)}</strong>.</p><p>Option 1 change: ${(100*(one-b)).toFixed(2)} percentage points; Option 2 change: ${(100*(two-b)).toFixed(2)} percentage points. ${one>two?'Option 1 ranks higher under these assumptions.':two>one?'Option 2 ranks higher under these assumptions.':'The options tie under these assumptions.'}</p>`);});}
function exportEvidence(){const evidence={project:'MA371 Project 1 ASDS/CS PageRank',case:'synthetic training-resource portal',generated_at:new Date().toISOString(),note:'Only completed Python calculations are recorded. Model results are not observed portal outcomes.',completed_calculations:records,saved_stationary_comparisons:runs};const blob=new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ma371-pagerank-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function loadCode(){try{const source=await fetch('./pagerank_model.py').then(r=>r.text());for(const name of ['transition','google','step','stationary','hybrid']){const begin=`# WEB_CODE_BEGIN ${name}`,end=`# WEB_CODE_END ${name}`,start=source.indexOf(begin),stop=source.indexOf(end);if(start>=0&&stop>start)$(`code-${name}`).textContent=source.slice(start+begin.length,stop).trim();}}catch{for(const name of ['transition','google','step','stationary','hybrid'])$(`code-${name}`).textContent='Download pagerank_model.py to inspect this calculation.';}}

async function init(){try{caseData=await fetch('./pagerank_data.json').then(r=>{if(!r.ok)throw Error('Case data unavailable.');return r.json();});counts=initialCounts();renderCounts();renderGraph();renderMatrix();renderStartChoices();await loadCode();
  $('load-example').onclick=loadExample;$('load-baseline').onclick=()=>loadScenario('Baseline');$('clear-links').onclick=clearLinks;
  $('calculate-transition').onclick=runTransition;$('calculate-google').onclick=runGoogle;
  $('alpha-range').oninput=event=>{$('alpha-value').textContent=Number(event.target.value).toFixed(2);alpha=Number(event.target.value);state=null;stepNumber=0;markStale(`Continuation probability changed to ${alpha.toFixed(2)}. Recalculate using this value.`);};
  $('reset-state').onclick=resetState;$('advance-one').onclick=()=>advance(1,'advance-one');$('advance-five').onclick=()=>advance(5,'advance-five');
  $('calculate-stationary').onclick=runStationary;$('load-option1').onclick=()=>loadScenario('Option 1');$('load-option2').onclick=()=>loadScenario('Option 2');$('restore-baseline').onclick=()=>loadScenario('Baseline');
  $('analyze-clicks').onclick=validate;$('restore-clicks').onclick=()=>{counts=initialCounts();renderCounts();markStale('Supplied click counts restored. Rerun validation or the hybrid model.');};
  $('build-hybrid').onclick=hybridBaseline;$('compare-hybrid').onclick=hybridOptions;
  for(const q of ['q1','q2'])$(`${q}-range`).oninput=event=>{$(`${q}-value`).textContent=Number(event.target.value).toFixed(2);markStale('Hypothetical new-link shares changed. Rerun the hybrid comparison.');};
  $('export-evidence').onclick=exportEvidence;addEventListener('resize',renderGraph,{passive:true});
}catch(error){setStatus(`Laboratory could not initialize: ${error.message}`,true);}}
init();
