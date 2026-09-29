# Joseph Dorta: MA371 course website

Student-facing site for MA371 Linear Algebra. The course hub is `/ma371/`; Project 1 has an Operations Research pilot and clearly marked pending tracks for Computer Science, Mathematical Sciences, Applied Data Science, and Physics.

The OR page contains an embedded no-coding calculator powered by Python and NumPy in a browser worker (Pyodide 314.0.7). Students select Load calculator, enter numbers or move sliders, select Run analysis, and export an evidence ZIP. Nothing is calculated automatically. An optional code view is read-only. Session history is in memory and is cleared by refresh/closing; inputs are not sent to a computation server.

Python and NumPy are downloaded from jsDelivr on first load; internet/CDN access is required. No Google account is required for the embedded calculator. The self-contained Colab notebook remains a fallback. The web inquiry is printable; the LaTeX source is included. All data are synthetic. Vectors have arrow notation and computed vectors appear as 3 × 1 columns.

## Publishing

In this repository's Settings → Pages, select **Deploy from a branch**, **main**, **/(root)**, then Save. The intended course URL is https://joseph-dorta.github.io/ma371/.

Only student-facing files belong in this public repository. Do not copy instructor solutions, answer-filled backups, private student information, gradebooks, or the complete course workspace into it.

## Adding a track

Replace the corresponding `ma371/project1/<track>/index.html` placeholder, add the student computational tool and inquiry resources in that folder, and update its status and links on `ma371/project1/index.html`. Check the runtime download, controls, and evidence export on the cadet network before classroom use.

For the OR model, keep `fleet_model.py` synchronized with the first code cell of `OR_Fleet_Readiness.ipynb`. The web interface never accepts arbitrary Python code. Its worker runs the same model as the notebook. Export packages contain evidence.html, inputs_and_results.json, and run_history.json; unrun control edits are not included.

Due dates, submission instructions, and the instructor's Army-style memo template are provided separately. AI use is limited to the designated classroom inquiry; final memo and annex authorship is independent.

