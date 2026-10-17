/*!
 * FrameLocal - helpers and icons
 * Made by Ashraf
 */
(() => {
  'use strict';
  const FL = (window.FL = window.FL || {});

  /* ---------- text + ids ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const uid = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 3) | 8).toString(16);
        });

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /* ---------- numbers + time ---------- */
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const fmtCount = (n) => (n < 1000 ? String(n) : compact.format(n));

  function timeAgo(ts, now = Date.now()) {
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 45) return 'Just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m <= 1 ? '1 minute ago' : `${m} minutes ago`;
    const h = Math.floor(s / 3600);
    if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
    const d = Math.floor(s / 86400);
    if (d < 7) return d === 1 ? 'Yesterday' : `${d} days ago`;
    const date = new Date(ts);
    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    return date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const fullDate = (ts) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const debounce = (fn, ms = 150) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const bytes = (n) => {
    if (!Number.isFinite(n)) return '';
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  FL.u = { esc, uid, clamp, fmtCount, timeAgo, fullDate, debounce, bytes };

  /* ---------- icons (24px grid, 1.8 stroke, round caps) ---------- */
  const PATHS = {
    home: '<path d="M3.5 10.6 12 3.5l8.5 7.1V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.6 20c.6-3.7 3.7-6 7.4-6s6.8 2.3 7.4 6"/>',
    heart:
      '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor"/>',
    camera:
      '<path d="M21.5 18.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3l1.7-2.5h5.6l1.7 2.5h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.8"/>',
    image: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="9" cy="9" r="1.6"/><path d="m20.5 15-4.8-4.8L6 20.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M2.5 12h2M19.5 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4"/>',
    moon: '<path d="M20.5 13.2A8.6 8.6 0 1 1 10.8 3.5a6.9 6.9 0 0 0 9.7 9.7z"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
    trash:
      '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.3a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7M10 11v6M14 11v6"/>',
    pencil: '<path d="M4 20h4.2L19.4 8.8a2.1 2.1 0 0 0-3-3L5.2 17z"/><path d="m14.4 7.8 2.8 2.8"/>',
    download: '<path d="M12 4v11M7.5 10.8 12 15.3l4.5-4.5M5 20h14"/>',
    upload: '<path d="M12 15.3V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    frame:
      '<path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  };

  /** icon('heart', { size: 22, fill: true, cls: 'x' }) -> SVG string */
  FL.icon = (name, { size = 24, fill = false, cls = '' } = {}) =>
    `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
})();
