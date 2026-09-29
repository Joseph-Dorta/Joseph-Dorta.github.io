(() => {
  const key = 'ma371-appearance';
  const modes = ['system', 'light', 'dark'];
  let mode = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) mode = saved;
  } catch (_) {
    // Storage may be unavailable; the system theme still works.
  }

  function apply(next, save = false) {
    mode = modes.includes(next) ? next : 'system';
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = mode;
    if (save) {
      try { localStorage.setItem(key, mode); } catch (_) { /* This page still changes. */ }
    }
    document.querySelectorAll('.theme-switch button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
  }

  apply(mode);
  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header .wrap');
    if (!header) return;
    const group = document.createElement('div');
    group.className = 'theme-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Appearance');
    for (const [value, label] of [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mode = value;
      button.textContent = label;
      button.title = value === 'system' ? 'Follow your device appearance' : `Use ${label.toLowerCase()} appearance`;
      button.addEventListener('click', () => apply(value, true));
      group.append(button);
    }
    header.append(group);
    apply(mode);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === key) apply(event.newValue);
  });
})();

