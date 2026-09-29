// One visible origin column links the training observations to A's column convention.
const diagram = document.querySelector('#transition-diagram');
const table = document.querySelector('table[aria-label="Training observations"]') ||
  document.querySelector('table');
const svg = document.querySelector('#transition-svg');
const caption = document.querySelector('#diagram-values');
const buttons = Array.from(diagram.querySelectorAll('button[data-origin]'));
const names = ['Ready','Routine maintenance','Major repair'];
const shortNames = ['Ready','Routine','Major'];
const colors = ['#006678','#956200','#693091'];
const ys = [45,130,215];
const ns = 'http://www.w3.org/2000/svg';
const counts = Array.from(table.tBodies[0].rows, row =>
  Array.from(row.cells).slice(1).map(cell => Number(cell.textContent.trim())));

function append(name, attrs = {}, parent = svg) {
  const node = document.createElementNS(ns,name);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
  parent.append(node);
  return node;
}
function draw(j) {
  const source = names[j];
  const flows = counts.map(row => row[j]);
  const total = flows.reduce((sum,value)=>sum+value,0);
  buttons.forEach((button,index)=>button.setAttribute('aria-pressed',String(index===j)));
  svg.setAttribute('aria-label',`Training observations from ${source}: ${flows.map((amount,i)=>`${amount} to ${names[i]}`).join('; ')}; ${total} total`);
  svg.replaceChildren();
  ys.forEach((y,i)=>{
    append('path',{d:`M 85 130 C 235 130 260 ${y} 405 ${y}`,fill:'none',
      stroke:colors[i],'stroke-width':2+flows[i]/Math.max(total,1)*14,opacity:'.7'});
    append('circle',{cx:417,cy:y,r:16,fill:colors[i]});
    const initial = append('text',{x:417,y:y+5,'text-anchor':'middle',fill:'#fff','font-size':13,'font-weight':700});
    initial.textContent=['R','U','M'][i];
    const label = append('text',{x:444,y:y+5,fill:'#172b3d','font-size':14});
    label.textContent=`${shortNames[i]}: ${flows[i]} / ${total}`;
  });
  append('circle',{cx:75,cy:130,r:21,fill:'#172b3d'});
  const initial=append('text',{x:75,y:135,'text-anchor':'middle',fill:'#fff','font-size':14,'font-weight':700});
  initial.textContent=['R','U','M'][j];
  const label=append('text',{x:25,y:94,fill:'#172b3d','font-size':14});
  label.textContent=`From ${source}`;
  caption.textContent=`From ${source}: ${flows.map((amount,i)=>`${amount} to ${names[i]}`).join(', ')}; ${total} observations total.`;
}
if (counts.length===3 && counts.every(row=>row.length===3 && row.every(Number.isFinite))) {
  buttons.forEach((button,j)=>button.addEventListener('click',()=>draw(j)));
  draw(0);
} else {
  caption.textContent='Diagram unavailable. Use the training-observation table above.';
}

