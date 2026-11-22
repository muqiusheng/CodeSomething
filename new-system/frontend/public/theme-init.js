/* Loaded before first paint. React subscribes to this same store after mount. */
(() => {
  const backgrounds = {
    emerald: ['#F7FAF8', '#0D1317'],
    indigo: ['#F8FAFC', '#0B0F19'],
    terracotta: ['#FAF7F2', '#161311'],
    ocean: ['#F4F9FD', '#0A121E'],
    graphite: ['#FAFAFA', '#09090B'],
    forest: ['#F4F7F4', '#0C1410'],
    rose: ['#FDF8F9', '#160D14'],
    amber: ['#FBF9F3', '#12110E'],
    'cupcake-synthwave': ['#FAF7F5', '#09002F'],
  };
  const themeKey = 'cs-theme';
  const paletteKey = 'cs-palette';
  const media = matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const listeners = new Set();

  function read(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }

  function validTheme(value) {
    return value === 'system' || value === 'dark' ? value : 'light';
  }

  function validPalette(value) {
    return Object.hasOwn(backgrounds, value) ? value : 'emerald';
  }

  let preference = validTheme(read(themeKey));
  let palette = validPalette(read(paletteKey));
  let snapshot;

  function sync() {
    const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    if (snapshot?.preference === preference && snapshot.resolved === resolved && snapshot.palette === palette) return;
    root.dataset.theme = resolved;
    root.dataset.palette = palette;
    root.style.colorScheme = resolved;
    themeColor?.setAttribute('content', backgrounds[palette][resolved === 'dark' ? 1 : 0]);
    snapshot = Object.freeze({preference, resolved, palette});
    listeners.forEach(listener => listener());
  }

  function persist(key, value) {
    let saved = true;
    try { localStorage.setItem(key, value); }
    catch { saved = false; }
    sync();
    return saved;
  }

  window.csAppearance = Object.freeze({
    paletteIds: Object.freeze(Object.keys(backgrounds)),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTheme(value) {
      preference = validTheme(value);
      return persist(themeKey, preference);
    },
    setPalette(value) {
      palette = validPalette(value);
      return persist(paletteKey, palette);
    },
  });

  sync();
  media.addEventListener('change', sync);
  window.addEventListener('storage', event => {
    if (event.key === themeKey || event.key === null) preference = validTheme(read(themeKey));
    if (event.key === paletteKey || event.key === null) palette = validPalette(read(paletteKey));
    sync();
  });
})();
