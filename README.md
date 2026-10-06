# Joseph Dorta: MA371 course website

Student-facing site for MA371 Linear Algebra. The course hub is `/ma371/`; Project 1 has Operations Research, Mathematical Sciences, a shared Applied Data Science/Computer Science pilot, and a Physics pilot.

The OR page contains an embedded no-coding calculator powered by Python and NumPy in a browser worker (Pyodide 314.0.7). Students select Load calculator, enter numbers or move sliders, select Run analysis, and export an evidence ZIP. Nothing is calculated automatically. An optional code view is read-only. Session history is in memory and is cleared by refresh/closing; inputs are not sent to a computation server. The inquiry has an interactive training-count-to-matrix-column diagram. Completed calculator runs show deadline, trajectory, and effectiveness-sensitivity charts plus a margin animation of expected vehicle flow. Its icons are proportional samples; exact expected values appear beside them. Motion can be paused and does not autoplay when the browser requests reduced motion.

Every site page offers Auto, Light, and Dark appearance. Auto follows the device preference; an explicit choice is stored locally in the browser and applies across the site. The OR landing page uses an original, illustrative Stryker-like fleet-depot banner; it does not depict real unit data or exact vehicle transitions.

The Math Sci page uses an original illustrated planning-map banner and a responsive graph manipulative. Students choose 3–8 labeled vertices, toggle undirected edges in an adjacency matrix or on the graph, and separately request Python/NumPy calculations of degrees, the Laplacian, eigenpairs, and cohort cut counts. Each stage exposes the corresponding short Python function. The exact binary adjacency matrix remains the source of truth; eigenvectors are rounded only for display, and earlier completed comparisons retain their graph snapshots. The six-team case and two optional missing edges follow the revised Math Sci inquiry packet. The Army-style Math Sci memo template contains writing prompts, not solutions.

The shared ASDS/CS page introduces a synthetic five-page training-resource portal and a decision between two proposed navigation links. Its responsive directed-graph manipulative and adjacency matrix share exact binary data. Cadets separately request Python/NumPy construction of the column-stochastic link-following matrix, restart matrix, one- or five-step updates, and a stationary ranking. Completed runs preserve the actual link snapshot. Held-out baseline click counts test the equal-link assumption. An optional ASDS hybrid model uses observed click proportions for three origins, structural assumptions for two missing origins, and adjustable hypothetical click shares for the unbuilt links. The guided inquiry explicitly distinguishes modeled PageRank from observed discoverability; its Army-style memo template supplies prompts, not an answer. The original illustrated page banner is conceptual rather than an accurate graph diagram.

The Physics page follows the revised coupled-thermal-system inquiry. Cadets request browser-Python calculations step by step: one-module balance and curve, two-module matrix, eigenmodes, scenario forecasts, held-out baseline residuals, and hotter-day sensitivity. Responsive circuit-board diagrams use a fixed 15–45°C color scale and signed heat-flow labels from completed unrounded forecasts. A time slider and user-started animation stay synchronized with SVG temperature plots; the mode lens replots common elevation or temperature contrast. Completed runs retain exact input snapshots. The original SVG banner is conceptual and does not encode model values. The downloadable LaTeX packet is the user's revised attachment.

Browser Python is downloaded from jsDelivr on first calculation; the OR, Math Sci, and ASDS/CS tools also download NumPy. Internet/CDN access is required. No Google account is required for the embedded calculators. The OR self-contained Colab notebook remains a fallback. Web inquiries are printable and LaTeX sources are included. All data are synthetic.

## Publishing

In this repository's Settings → Pages, select **Deploy from a branch**, **main**, **/(root)**, then Save. The intended course URL is https://joseph-dorta.github.io/ma371/.

Only student-facing files belong in this public repository. Do not copy instructor solutions, answer-filled backups, private student information, gradebooks, or the complete course workspace into it.

## Adding a track

Replace the corresponding `ma371/project1/<track>/index.html` placeholder, add the student computational tool and inquiry resources in that folder, and update its status and links on `ma371/project1/index.html`. Check the runtime download, controls, and evidence export on the cadet network before classroom use.

For the OR model, keep `fleet_model.py` synchronized with the first code cell of `OR_Fleet_Readiness.ipynb`. The private pilot's `tests/sync_model.mjs` performs this mechanical sync for the two copies of the model and notebook. The web interface never accepts arbitrary Python code. Its worker runs the same model as the notebook. Export packages contain evidence.html, inputs_and_results.json, and run_history.json; unrun control edits are not included. The evidence HTML includes all three analytical charts.

Due dates and submission instructions are provided separately. The cleaned Army-style memo templates are downloadable from their respective project pages. AI use is limited to the designated classroom inquiry; final memo and annex authorship is independent.

