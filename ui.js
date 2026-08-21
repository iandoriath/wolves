/* ui.js — UI primitives (part 1): escaping, icons, toast, sheet, confirm, share.
   Classic script; exposes globalThis.UI. May use globalThis.ScheduleLib. */
(function () {
  const L = globalThis.ScheduleLib;
  const U = {};
  U.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  U.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  U.isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  U.relTimeLabel = (iso, tz) => (L || globalThis.ScheduleLib).relativeTime(iso, new Date(), tz);

  const P = {   // 24×24 stroke icons (Feather-style paths)
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    check: '<path d="M20 6L9 17l-5-5"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>', 'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>', 'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M22 6l-10 7L2 6"/>',
    map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  };
  U.icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;

  // ---- toast ----
  let toastEl = null, toastTimer = null;
  U.toast = (message, { action, duration = 4500 } = {}) => {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status');
    toastEl.innerHTML = `<span>${U.esc(message)}</span>${action ? `<button class="toast-action" type="button">${U.esc(action.label)}</button>` : ''}`;
    if (action) toastEl.querySelector('button').onclick = () => { action.onClick(); toastEl.remove(); toastEl = null; };
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => { toastEl?.remove(); toastEl = null; }, duration);
  };

  // ---- sheet ----
  const dialog = () => {
    let d = document.getElementById('sheet');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'sheet'; d.className = 'sheet'; document.body.appendChild(d);
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });   // backdrop tap
    }
    return d;
  };
  U.sheet = ({ title, html, className = '', onOpen }) => {
    const d = dialog();
    d.className = ('sheet ' + className).trim();
    d.innerHTML = `<div class="sheet-handle"></div>${title ? `<div class="sheet-title">${U.esc(title)}</div>` : ''}<div class="sheet-body">${html}</div>`;
    if (!d.open) d.showModal();
    const root = d.querySelector('.sheet-body');
    if (onOpen) onOpen(root);
    return { close: () => d.close(), root };
  };
  U.closeSheet = () => { const d = document.getElementById('sheet'); if (d?.open) d.close(); };
  U.confirm = ({ title, body, confirmLabel = 'OK', danger = false }) => new Promise((resolve) => {
    const { close, root } = U.sheet({ title, html: `<p>${U.esc(body)}</p><div class="sheet-actions">
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${U.esc(confirmLabel)}</button>
      <button class="btn btn-ghost" type="button" data-cancel>Cancel</button></div>` });
    const d = document.getElementById('sheet');
    const done = (v) => { resolve(v); close(); };
    root.querySelector('[data-ok]').onclick = () => done(true);
    root.querySelector('[data-cancel]').onclick = () => done(false);
    d.addEventListener('close', () => resolve(false), { once: true });
  });

  // ---- share / copy ----
  U.copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
  U.share = async ({ title, text, url }) => {
    const body = String(text == null ? '' : text);
    if (navigator.share) { try { await navigator.share(url ? { title, text: body, url } : { title, text: body }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'failed'; } }
    const ok = await U.copy(url && !body.includes(url) ? `${body}\n${url}` : body);
    U.toast(ok ? 'Copied to clipboard' : 'Couldn’t copy — long-press to select');
    return ok ? 'copied' : 'failed';
  };

  globalThis.UI = U;
})();
