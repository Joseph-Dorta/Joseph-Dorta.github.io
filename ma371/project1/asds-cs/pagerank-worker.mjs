// Every visible calculation uses the same Python source shown in the code panels.
let ready;
let queue = Promise.resolve();

async function initialize() {
  self.postMessage({type: 'progress', message: 'Loading browser Python…'});
  const {loadPyodide} = await import('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs');
  const py = await loadPyodide({indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'});
  self.postMessage({type: 'progress', message: 'Loading NumPy and the PageRank model…'});
  await py.loadPackage('numpy');
  const response = await fetch(new URL('./pagerank_model.py', import.meta.url));
  if (!response.ok) throw new Error('The PageRank model could not be loaded.');
  await py.runPythonAsync(await response.text());
  return py;
}

async function handle({id, action, payload}) {
  try {
    if (!ready) ready = initialize();
    const py = await ready;
    py.globals.set('web_action', action);
    py.globals.set('web_payload_json', JSON.stringify(payload));
    const serialized = await py.runPythonAsync('json.dumps(dispatch(web_action, json.loads(web_payload_json)))');
    self.postMessage({id, result: JSON.parse(serialized)});
  } catch (error) {
    const message = (error.message || String(error)).trim().split('\n').at(-1).replace(/^ValueError:\s*/, '');
    self.postMessage({id, error: message});
  }
}

self.onmessage = ({data}) => { queue = queue.then(() => handle(data)); };
