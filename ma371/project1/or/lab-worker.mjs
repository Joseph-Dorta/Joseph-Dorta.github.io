// Python runs in a separate browser thread. Only numeric inputs enter the model.
let python;
let latest = null;
let history = [];
let queue = Promise.resolve();

async function initialize() {
  self.postMessage({type: 'progress', message: 'Loading browser Python…'});
  const {loadPyodide} = await import('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs');
  python = await loadPyodide({indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'});
  self.postMessage({type: 'progress', message: 'Loading NumPy and the fleet model…'});
  await python.loadPackage('numpy');
  const response = await fetch(new URL('./fleet_model.py', import.meta.url));
  if (!response.ok) throw new Error('The fleet model could not be loaded.');
  await python.runPythonAsync(await response.text());
  return JSON.parse(python.runPython('json.dumps(DATA)'));
}

async function handle({id, action, inputs}) {
  try {
    if (action === 'initialize') {
      const data = await initialize();
      self.postMessage({id, data});
      return;
    }
    if (!python) throw new Error('Load the calculator before running an analysis.');
    if (action === 'analyze') {
      // Clear the active record on failure; the prior runs remain in the history.
      latest = null;
      python.globals.set('web_inputs_json', JSON.stringify(inputs));
      const result = await python.runPythonAsync(`
web_inputs = json.loads(web_inputs_json)
web_record = analyze(web_inputs['counts'], web_inputs['initial'],
    web_inputs['deadline'], web_inputs['prevention_effect'],
    web_inputs['repair_effect'], web_inputs['target'])
json.dumps({'record': web_record, 'html': report_html(web_record)})
`);
      latest = JSON.parse(result);
      history.push(latest.record);
      self.postMessage({id, ...latest, historyCount: history.length});
      return;
    }
    if (action === 'export') {
      if (!latest) throw new Error('Complete a successful analysis before exporting.');
      python.globals.set('web_export_json', JSON.stringify({...latest, history}));
      const encoded = await python.runPythonAsync(`
import io, zipfile, base64
web_export = json.loads(web_export_json)
web_buffer = io.BytesIO()
with zipfile.ZipFile(web_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as web_zip:
    web_zip.writestr('evidence.html', web_export['html'])
    web_zip.writestr('inputs_and_results.json', json.dumps(web_export['record'], indent=2))
    web_zip.writestr('run_history.json', json.dumps(web_export['history'], indent=2))
base64.b64encode(web_buffer.getvalue()).decode('ascii')
`);
      self.postMessage({id, base64: encoded, runId: latest.record.run_id});
      return;
    }
    throw new Error('Unknown calculator action.');
  } catch (error) {
    const lines = (error.message || String(error)).trim().split('\n');
    const userMessage = lines[lines.length - 1].replace(/^ValueError:\s*/, '');
    self.postMessage({id, error: userMessage});
  }
}

self.onmessage = event => {
  queue = queue.then(() => handle(event.data));
};

