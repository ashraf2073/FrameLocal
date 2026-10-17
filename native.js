/*!
 * FrameLocal - Capacitor bridge helpers
 * Everything here degrades gracefully to the plain web behaviour when the app runs in a browser.
 *
 * Made by Ashraf
 */
(() => {
  'use strict';
  const FL = (window.FL = window.FL || {});

  const cap = () => window.Capacitor;
  const isNative = () => {
    try { return !!(cap() && cap().isNativePlatform && cap().isNativePlatform()); } catch (_) { return false; }
  };

  const plugin = (name) => {
    try {
      const c = cap();
      return c && (c.Plugins && c.Plugins[name] ? c.Plugins[name] : c.registerPlugin(name));
    } catch (_) {
      return null;
    }
  };

  /** Light status-bar icons on dark UI, dark icons on light UI (Capacitor 8 SystemBars). */
  async function setSystemBars(isDark) {
    if (!isNative()) return;
    try {
      const bars = plugin('SystemBars');
      if (bars) await bars.setStyle({ style: isDark ? 'DARK' : 'LIGHT' });
    } catch (_) { /* purely cosmetic */ }
  }

  /**
   * Saves a text file for the user.
   * Native: writes to the app cache and opens the Android share sheet (Save to Drive, Files, WhatsApp...).
   * Web: triggers a normal download.
   * Returns 'shared' | 'downloaded'.
   */
  async function saveTextFile(filename, text, mime = 'application/json') {
    if (isNative()) {
      const fs = plugin('Filesystem');
      const share = plugin('Share');
      if (fs && share) {
        const res = await fs.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
        await share.share({ title: filename, dialogTitle: 'Save FrameLocal backup', url: res.uri });
        return 'shared';
      }
    }
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  }

  FL.native = { isNative, setSystemBars, saveTextFile };
})();
