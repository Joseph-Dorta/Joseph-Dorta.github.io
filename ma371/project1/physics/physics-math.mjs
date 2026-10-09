// Native MathML keeps mathematical structure and vector accents independent of
// Unicode combining characters, code fonts, and third-party rendering services.
const NS = 'http://www.w3.org/1998/Math/MathML';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag = (name, body, attrs = '') => `<${name}${attrs}>${body}</${name}>`;
const row = (...parts) => tag('mrow', parts.join(''));
const operator = value => tag('mo', escape(value), /[()[\]]/.test(value) ? ' stretchy="false"' : '');
const identifier = value => tag('mi', escape(value));
const number = value => tag('mn', escape(value));
const sub = (base, index) => tag('msub', base + index);
const power = (base, exponent) => tag('msup', base + exponent);
const vector = base => tag('mover', base + '<mo stretchy="true">→</mo>', ' accent="true"');
const scripts = {'₀':'0','₁':'1','₂':'2','ᵢ':'i','ₐ':'a','₊':'+','₋':'−','⁻':'−','¹':'1','ᵀ':'T'};

// Small, deliberately limited tokenizer for this page's existing inline notation.
// Full display equations below are constructed explicitly from MathML objects.
export function expression(source) {
  const tokens = [];
  const chars = [...String(source)];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) continue;
    if (c === '⃗' && tokens.length) { tokens.push(vector(tokens.pop())); continue; }
    if (/[₀₁₂ᵢₐ₊₋]/.test(c) && tokens.length) { tokens.push(sub(tokens.pop(), /[0-9]/.test(scripts[c]) ? number(scripts[c]) : identifier(scripts[c]))); continue; }
    if (/[⁻¹ᵀ]/.test(c) && tokens.length) {
      let exponent = scripts[c];
      while (i + 1 < chars.length && /[⁻¹]/.test(chars[i + 1])) exponent += scripts[chars[++i]];
      tokens.push(power(tokens.pop(), expression(exponent))); continue;
    }
    if ((c === '′' || c === '*') && tokens.length) { tokens.push(power(tokens.pop(), operator(c === '*' ? '∗' : c))); continue; }
    if (/[0-9]/.test(c)) {
      let value = c;
      while (i + 1 < chars.length && /[0-9.]/.test(chars[i + 1])) value += chars[++i];
      tokens.push(number(value)); continue;
    }
    tokens.push(/[a-zA-Zθλτ]/.test(c) ? identifier(c) : operator(c === '-' ? '−' : c));
  }
  return row(...tokens);
}
const e = expression;
const fraction = (a, b) => tag('mfrac', a + b);
const f = (a, b) => fraction(e(a), e(b));
const exp = exponent => power(identifier('e'), exponent);
const brackets = body => row('<mo stretchy="true">[</mo>', body, '<mo stretchy="true">]</mo>');
const parentheses = body => row('<mo stretchy="true">(</mo>', body, '<mo stretchy="true">)</mo>');
export function matrix(rows) {
  return brackets(tag('mtable', rows.map(cells => tag('mtr', cells.map(value => tag('mtd', e(value))).join(''))).join(''), ' columnspacing="1em" rowspacing=".3em"'));
}
export function math(body, display = false, label = '') {
  return `<math xmlns="${NS}"${display ? ' display="block"' : ''}${label ? ` aria-label="${escape(label)}"` : ''}>${body}</math>`;
}
export const inlineMath = source => math(e(source));
export const displayMath = (body, label = '') => `<div class="math-display">${math(body, true, label)}</div>`;
export const column = values => matrix(values.map(value => [value]));
export const unit = value => '<mspace width=".3em"></mspace>' + tag('mtext', escape(value.trim()));

const ode = e('θ⃗′ = Aθ⃗ + b⃗');
const scalarSolution = row(e('T(t) = Tₐ +'), f('P', 'h'), e('+'), brackets(row(e('T(0) − Tₐ −'), f('P','h'))), exp(f('−ht','C')));
const sumEquation = row(e('s′ = −'), f('h','C'), e('s +'), f('P₁ + P₂','C'));
const contrastEquation = row(e('d′ = −'), f('h + 2g','C'), e('d +'), f('P₁ − P₂','C'));
const sumSolution = row(e('s(t) ='), f('P₁ + P₂','h'), parentheses(row(e('1 −'), exp(f('−ht','C')))));
const contrastSolution = row(e('d(t) ='), f('P₁ − P₂','h + 2g'), parentheses(row(e('1 −'), exp(f('−(h + 2g)t','C')))));
const genericSolution = row(e('y(t) = y* +'), brackets(e('y(0) − y*')), exp(e('−at')));
const eigenSolution = row(e('θ⃗(t) = θ⃗* + c₊'), exp(e('λ₊t')), e('v⃗₊ + c₋'), exp(e('λ₋t')), e('v⃗₋'));

function replaceDisplay(node, ...bodies) {
  node.replaceChildren(); node.className = 'equation-set';
  for (const body of bodies) node.insertAdjacentHTML('beforeend', displayMath(body));
}

// Replace mathematical runs in prose without touching Python, buttons, input
// labels, SVG chart labels, or existing MathML. Repeated calls are idempotent.
const inlineFormulas = new Map([
  ['θ⃗(t) = θ⃗* + c₊eλ₊tv⃗₊ + c₋eλ₋tv⃗₋', eigenSolution],
  ['y(t) = y* + [y(0) − y*]e−at', genericSolution],
  ['v⃗₊ = (1,1)ᵀ', row(e('v⃗₊ ='), column(['1','1']))],
  ['v⃗₋ = (1,−1)ᵀ', row(e('v⃗₋ ='), column(['1','−1']))],
  ['(1, 1)T', column(['1','1'])], ['(1, −1)T', column(['1','−1'])],
  ['θ = T − Ta', e('θ = T − Tₐ')], ['θᵢ = Tᵢ − Ta', e('θᵢ = Tᵢ − Tₐ')],
  ['Cθ₁′ = P₁ − hθ₁ − g(θ₁ − θ₂)', e('Cθ₁′ = P₁ − hθ₁ − g(θ₁ − θ₂)')],
  ['Aθ⃗* + b⃗ = 0', e('Aθ⃗* + b⃗ = 0')], ['z⃗ = θ⃗ − θ⃗*', e('z⃗ = θ⃗ − θ⃗*')],
  ['z⃗′ = Az⃗', e('z⃗′ = Az⃗')], ['z = θ − θ*', e('z = θ − θ*')],
  ['s = θ₁ + θ₂', e('s = θ₁ + θ₂')], ['d = θ₁ − θ₂', e('d = θ₁ − θ₂')],
  ['θ⃗(0) = 0⃗', e('θ⃗(0) = 0⃗')],
  ['g(T1 − T2)', e('g(T₁ − T₂)')], ['h(T − Ta)', e('h(T − Tₐ)')],
  ['θ* = P/h', row(e('θ* ='), f('P','h'))],
  ['z′ = −(h/C)z', row(e('z′ = −'), f('h','C'), e('z'))],
  ['τ = C/h', row(e('τ ='), f('C','h'))],
  ['λ = −h/C', row(e('λ = −'), f('h','C'))],
  ['C/h', f('C','h')], ['θ₁ = (s+d)/2', row(e('θ₁ ='), f('s+d','2'))],
  ['θ₂ = (s−d)/2', row(e('θ₂ ='), f('s−d','2'))],
]);
// Symbol runs cover the old combining-arrow strings throughout the inquiry.
const symbolPattern = '(?:[θvzbc0]⃗[₀₁₂₊₋]?[′*]?|[θλτ][₀₁₂ᵢ₊₋]?[′*]?|[TPcsvdz][₁₂ₐ₊₋][′*]?|[Tsdz][′*]|min⁻¹)';
const escapedKeys = [...inlineFormulas.keys()].sort((a,b)=>b.length-a.length).map(key=>key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
const pattern = new RegExp(escapedKeys.join('|') + '|' + symbolPattern, 'gu');

export function typesetInline(root) {
  // Match complete formulas across simple HTML subscripts/superscripts before
  // processing individual symbols. A Range preserves surrounding prose.
  for (const block of root.querySelectorAll('p, li')) {
    if (block.closest('pre, code, button, label, svg')) continue;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const runs = []; let text = '';
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('math')) { text += '\u0000'; continue; }
      runs.push({node,start:text.length,end:text.length+node.textContent.length}); text += node.textContent;
    }
    const matches = [];
    for (const [key, body] of inlineFormulas) {
      let index = text.indexOf(key);
      while (index >= 0) { matches.push({index,end:index+key.length,body}); index = text.indexOf(key,index+key.length); }
    }
    const selected = matches.sort((a,b)=>a.index-b.index||b.end-a.end).filter((match,index,all)=>!all.slice(0,index).some(earlier=>earlier.index<=match.index&&earlier.end>match.index));
    for (const match of selected.reverse()) {
      const start = runs.find(run=>run.start<=match.index&&run.end>match.index);
      const end = runs.find(run=>run.start<match.end&&run.end>=match.end);
      if (!start || !end) continue;
      const range = document.createRange(); range.setStart(start.node,match.index-start.start); range.setEnd(end.node,match.end-end.start);
      const holder = document.createElement('span'); holder.innerHTML = math(match.body);
      range.deleteContents(); range.insertNode(holder.firstChild);
    }
  }
  // Merge simple superscripts/subscripts inside prose so exponential factors
  // become structured expressions as well as ordinary Greek symbols.
  for (const node of root.querySelectorAll('sup')) {
    if (node.closest('math, pre, code, button, label, svg')) continue;
    const previous = node.previousSibling;
    if (previous?.nodeType === Node.TEXT_NODE && previous.textContent.endsWith('e')) {
      previous.textContent = previous.textContent.slice(0,-1);
      const holder = document.createElement('span'); holder.innerHTML = math(exp(e(node.textContent)));
      node.replaceWith(...holder.childNodes);
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest('math, pre, code, button, label, svg, script, style, .source, .component, .ambient')) nodes.push(node);
  }
  for (const node of nodes) {
    const text = node.textContent; pattern.lastIndex = 0;
    const matches = [...text.matchAll(pattern)]; if (!matches.length) continue;
    const fragment = document.createDocumentFragment(); let end = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(text.slice(end,match.index)));
      const holder = document.createElement('span'); holder.innerHTML = math(inlineFormulas.get(match[0]) || (match[0] === 'min⁻¹' ? power(tag('mtext','min'),e('−1')) : e(match[0])));
      fragment.append(...holder.childNodes); end = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(end))); node.replaceWith(fragment);
  }
}

export function typesetPhysicsPage() {
  for (const node of document.querySelectorAll('.equation')) {
    const text = node.textContent.trim();
    if (text.startsWith('C T′')) replaceDisplay(node, e('CT′ = P − h(T − Tₐ)'));
    else if (text.startsWith('T(t)')) replaceDisplay(node, scalarSolution);
    else if (text.startsWith('s′')) replaceDisplay(node, sumEquation, contrastEquation);
    else if (text.startsWith('s(t)')) replaceDisplay(node, sumSolution, contrastSolution);
  }
  const system = document.querySelector('.math-output[role="img"]');
  if (system) {
    system.removeAttribute('role'); system.removeAttribute('aria-label');
    replaceDisplay(system, ode, row(e('A ='), f('1','C'), matrix([['−(h+g)','g'],['g','−(h+g)']])), row(e('b⃗ ='), f('1','C'), column(['P₁','P₂'])));
  }
  typesetInline(document.querySelector('main'));
}

// Calculator presentation only: outputs and evidence retain their full-precision
// Python values. The caller supplies already formatted display strings.
export function modelResult(out, fmt, signed) {
  return displayMath(ode) + displayMath(row(e('θ⃗ ='), column(['T₁ − Tₐ','T₂ − Tₐ'])))
    + displayMath(row(e('A ='), matrix(out.A.map(cells=>cells.map(value=>fmt(value,4)))), unit(' min⁻¹')))
    + displayMath(row(e('b⃗ ='), column(out.b.map(value=>fmt(value,4))), unit(' °C/min')))
    + '<p>At power-on:</p>' + displayMath(row(e('T⃗′(0) ='), column(out.initial_slopes.map(value=>signed(value))), unit(' °C/min')))
    + `<p>Contact flow = ${escape(signed(out.initial_contact))} kJ/min.</p>`;
}
export function scalarBalanceResult(out, fmt, signed) {
  return `<p>At power-on: heat production ${escape(fmt(out.production))} kJ/min; ambient loss ${escape(signed(out.ambient_loss))} kJ/min.</p>`
    + displayMath(row(e('T′(0) ='), e(signed(out.initial_slope)), unit(' °C/min')))
    + '<p>Equilibrium temperature and time constant:</p>'
    + displayMath(row(e('T* ='), e(fmt(out.equilibrium)), unit(' °C'), e(', τ ='), f('C','h'), e('='), e(fmt(out.time_constant)), unit(' min')));
}
export function scalarCurveResult(out, fmt) {
  return displayMath(row(e('T(10) ='), e(fmt(out.temperature_at_10,3)), unit(' °C')))
    + '<p>The heat-balance residual at 10 minutes is</p>'
    + displayMath(row(e('CT′ −'), brackets(e('P − h(T − Tₐ)')), e('='), e(fmt(out.ode_residual_at_10,9)), unit(' kJ/min')))
    + '<p>This numerical check confirms the formula satisfies the modeled ODE at that time.</p>';
}
export function modesResult(out, fmt) {
  return '<p>Overall elevation:</p>' + displayMath(row(e('v⃗₊ ='), column(['1','1']), e(', λ₊ ='), e(fmt(out.lambda_plus,4)), unit(' min⁻¹')))
    + '<p>Temperature contrast:</p>' + displayMath(row(e('v⃗₋ ='), column(['1','−1']), e(', λ₋ ='), e(fmt(out.lambda_minus,4)), unit(' min⁻¹')))
    + displayMath(row(e('s* ='), e(fmt(out.s_star,3)), unit(' °C'), e(', d* ='), e(fmt(out.d_star,3)), unit(' °C')))
    + '<p>Equilibrium:</p>' + displayMath(row(e('T₁* ='), e(fmt(out.temperature_star[0],3)), unit(' °C'), e(', T₂* ='), e(fmt(out.temperature_star[1],3)), unit(' °C')));
}

typesetPhysicsPage();
