// Illustrate A_0 x_0, using the percentages displayed in Table 2.
const diagram = document.querySelector('#transition-diagram');
const matrixTable = document.querySelector('#baseline-matrix');
const svg = document.querySelector('#transition-svg');
const caption = document.querySelector('#diagram-values');
const fallback = document.querySelector('#diagram-fallback');
const buttons = Array.from(diagram.querySelectorAll('button[data-origin]'));
const originButtons = buttons.filter(button => button.dataset.origin !== 'all');
const initial = originButtons.map(button => Number(button.dataset.count));
const names = ['Ready', 'Routine maintenance', 'Major repair'];
const shortNames = ['Ready', 'Routine', 'Major'];
const colors = ['#006678', '#956200', '#693091'];
const ys = [45, 130, 215];
const ns = 'http://www.w3.org/2000/svg';

function append(name, attrs = {}, parent = svg) {
  const node = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  parent.append(node);
  return node;
}

function format(value) {
  return String(Number(value.toFixed(2)));
}

function readMatrix() {
  const rows = Array.from(matrixTable.tBodies[0].rows).slice(0, 3);
  const matrix = rows.map(row =>
    Array.from(row.cells).slice(1, 4).map(cell =>
      Number(cell.textContent.trim().replace('%', '')) / 100
    )
  );
  if (
    matrix.length !== 3 ||
    matrix.some(row => row.length !== 3 || row.some(value => !Number.isFinite(value) || value < 0 || value > 1)) ||
    initial.length !== 3 ||
    initial.some(value => !Number.isFinite(value) || value < 0) ||
    [0, 1, 2].some(j => Math.abs(matrix.reduce((sum, row) => sum + row[j], 0) - 1) > 1e-8)
  ) {
    throw new Error('Invalid baseline matrix or starting fleet');
  }
  return matrix;
}

function draw(mode, matrix) {
  const all = mode === 'all';
  const origin = all ? -1 : Number(mode);
  const sourceCount = all ? initial.reduce((sum, value) => sum + value, 0) : initial[origin];
  const flows = matrix.map(row =>
    all
      ? row.reduce((sum, probability, j) => sum + probability * initial[j], 0)
      : row[origin] * initial[origin]
  );

  buttons.forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.origin === mode))
  );
  svg.replaceChildren();
  const defs = append('defs');
  colors.forEach((color, i) => {
    const marker = append('marker', {
      id: `transition-arrow-${i}`,
      markerWidth: 12, markerHeight: 12, refX: 10, refY: 6,
      orient: 'auto', markerUnits: 'userSpaceOnUse'
    }, defs);
    append('path', {d: 'M 0 0 L 12 6 L 0 12 Z', fill: color}, marker);
  });

  ys.forEach((y, i) => {
    append('path', {
      d: `M 100 130 C 230 130 265 ${y} 385 ${y}`,
      fill: 'none',
      stroke: colors[i],
      'stroke-width': 2 + 15 * flows[i] / Math.max(sourceCount, 1),
      'stroke-linecap': 'round',
      'marker-end': `url(#transition-arrow-${i})`,
      opacity: 0.75
    });
    append('circle', {cx: 414, cy: y, r: 17, fill: colors[i]});
    const destination = append('text', {
      x: 414, y: y + 5, 'text-anchor': 'middle',
      fill: '#fff', 'font-size': 13, 'font-weight': 700
    });
    destination.textContent = ['R', 'U', 'M'][i];
    const label = append('text', {x: 445, y: y + 5, fill: '#172b3d', 'font-size': 14});
    label.textContent = `${shortNames[i]}: ${format(flows[i])}`;
  });

  append('circle', {cx: 72, cy: 130, r: 25, fill: '#172b3d'});
  const source = append('text', {
    x: 72, y: 135, 'text-anchor': 'middle',
    fill: '#fff', 'font-size': 14, 'font-weight': 700
  });
  source.textContent = format(sourceCount);
  const sourceLabel = append('text', {x: 18, y: 88, fill: '#172b3d', 'font-size': 14});
  sourceLabel.textContent = all ? 'Starting fleet' : `Starting ${shortNames[origin]}`;

  if (all) {
    caption.textContent =
      `Ready: ${format(matrix[0][0] * initial[0])} + ${format(matrix[0][1] * initial[1])} + ${format(matrix[0][2] * initial[2])} = ${format(flows[0])}. ` +
      `Routine: ${format(matrix[1][0] * initial[0])} + ${format(matrix[1][1] * initial[1])} + ${format(matrix[1][2] * initial[2])} = ${format(flows[1])}. ` +
      `Major: ${format(matrix[2][0] * initial[0])} + ${format(matrix[2][1] * initial[1])} + ${format(matrix[2][2] * initial[2])} = ${format(flows[2])} expected vehicles.`;
  } else {
    caption.textContent =
      `From ${format(sourceCount)} currently ${names[origin].toLowerCase()} vehicles: ` +
      `${format(flows[0])} expected ready, ${format(flows[1])} in routine maintenance, ` +
      `and ${format(flows[2])} in major repair next week. These contributions sum to ${format(sourceCount)}.`;
  }
  svg.setAttribute('aria-label', caption.textContent);
}

try {
  const matrix = readMatrix();
  buttons.forEach(button =>
    button.addEventListener('click', () => draw(button.dataset.origin, matrix))
  );
  draw('all', matrix);
  // SVGElement.hidden is not reflected consistently; remove the attribute itself.
  svg.removeAttribute('hidden');
  fallback.hidden = true;
} catch (error) {
  caption.textContent = 'The diagram is unavailable. The contribution check below gives the same one-week forecast.';
}
