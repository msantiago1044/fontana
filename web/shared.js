/* ============================================================
   shared.js — Header, tema e idioma compartido para todas las
   páginas secundarias de Fontana (como-funciona, roadmap, etc.)
   ============================================================ */

(function () {
  /* ── 1. Leer preferencias guardadas ── */
  const savedTheme = localStorage.getItem('fontana_theme') || 'light';
  const savedLang = localStorage.getItem('fontana_lang') || 'es';

  /* Aplicar al <html> (el IIFE del <head> ya lo hizo, pero por seguridad) */
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.documentElement.setAttribute('lang', savedLang);

  /* ── 2. Etiquetas UI ── */
  const THEME_LABELS = {
    light: { es: 'Blanco', en: 'White' },
    blue: { es: 'Azul', en: 'Blue' },
    dark: { es: 'Negro', en: 'Black' }
  };
  const THEME_DOT_COLORS = { light: '#fbfaf7', blue: '#235f88', dark: '#0c1016' };
  const THEME_DOT_BORDER = { light: '#b8853a', blue: 'transparent', dark: 'transparent' };

  /* ── 3. Inyectar el CSS del header (reutiliza fontana.css si ya está cargado) ── */
  const hasFontanaCSS = [...document.styleSheets].some(s => {
    try { return s.href && s.href.includes('fontana.css'); } catch { return false; }
  });

  if (!hasFontanaCSS) {
    /* Estilos mínimos para el header compartido */
    const style = document.createElement('style');
    style.textContent = `
      :root { --serif:'Cormorant Garamond',serif; --sans:'Inter',sans-serif; --gold:#c9a14a; --gold-bright:#b8853a; }
      html[data-theme="light"]{ --night:#fbfaf7;--night-2:#ffffff;--stone:#f1eee6;--gold:#b8853a;--gold-bright:#9c6d28;--ivory:#1f2430;--ivory-dim:#51564f;--ivory-faint:#84807a;--border-soft:rgba(20,20,10,.1); }
      html[data-theme="blue"] { --night:#1c4f73;--night-2:#235f88;--stone:#2a719d;--gold:#f2cd80;--gold-bright:#ffe3a3;--ivory:#f5fbff;--ivory-dim:#cfe8f5;--ivory-faint:#9bc9e0;--border-soft:rgba(244,241,234,.16); }
      html[data-theme="dark"] { --night:#0c1016;--night-2:#11161f;--stone:#1a2029;--gold:#c9a14a;--gold-bright:#e8c873;--ivory:#f4f1ea;--ivory-dim:#c9c6bc;--ivory-faint:#8a8a82;--border-soft:rgba(244,241,234,.1); }

      #sh-header {
        position:fixed;top:0;left:0;right:0;z-index:200;
        display:flex;align-items:center;justify-content:space-between;
        padding:18px 5vw;
        background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
        font-family:var(--sans,Inter,sans-serif);
      }
      #sh-header .sh-logo {
        display:flex;align-items:center;gap:10px;text-decoration:none;
        font-family:var(--serif,Georgia,serif);font-size:22px;font-weight:500;
        color:var(--ivory,#f4f1ea);letter-spacing:.04em;
      }
      #sh-header .sh-logo em { color:var(--gold-bright,#e8c873);font-style:normal; }
      #sh-header .sh-right { display:flex;align-items:center;gap:10px; }
      .sh-prefs-item { position:relative; }
      .sh-btn {
        background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.15);
        color:var(--ivory,#f4f1ea);font-size:12px;font-weight:600;
        padding:6px 11px;border-radius:999px;cursor:pointer;
        display:flex;align-items:center;gap:6px;
        font-family:var(--sans,Inter,sans-serif);white-space:nowrap;
        transition:.2s;
      }
      .sh-btn:hover { border-color:var(--gold,#c9a14a);color:#fff; }
      .sh-dot {
        width:11px;height:11px;border-radius:50%;flex-shrink:0;
        border:1px solid rgba(255,255,255,.3);
      }
      .sh-menu {
        display:none;flex-direction:column;gap:2px;
        position:absolute;top:calc(100% + 8px);right:0;
        background:var(--night-2,#11161f);border:1px solid var(--border-soft,rgba(255,255,255,.1));
        border-radius:12px;padding:6px;min-width:140px;
        box-shadow:0 12px 28px rgba(0,0,0,.4);z-index:300;
      }
      .sh-menu.open { display:flex; }
      .sh-menu button {
        background:none;border:none;color:var(--ivory-dim,#c9c6bc);
        font-size:13px;padding:8px 10px;border-radius:8px;text-align:left;
        cursor:pointer;display:flex;align-items:center;gap:9px;
        font-family:var(--sans,Inter,sans-serif);width:100%;white-space:nowrap;
        transition:.15s;
      }
      .sh-menu button:hover { background:var(--stone,#1a2029);color:var(--ivory,#f4f1ea); }
      .sh-menu button.sh-active { color:var(--gold-bright,#e8c873);font-weight:600; }
      .sh-back {
        font-family:var(--sans,Inter,sans-serif);font-size:13px;
        color:var(--ivory-dim,#c9c6bc);text-decoration:none;
        padding:6px 12px;border-radius:999px;
        border:1px solid rgba(255,255,255,.12);
        transition:.2s;white-space:nowrap;
      }
      .sh-back:hover { color:var(--gold-bright,#e8c873);border-color:var(--gold,#c9a14a); }
      body { padding-top:70px !important; }
      @media(max-width:540px){
        #sh-header { padding:14px 4vw; }
        .sh-label { display:none; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── 4. Inyectar el HTML del header ── */
  function getThemeDotHTML(theme) {
    return `<span class="sh-dot" id="sh-theme-dot" style="background:${THEME_DOT_COLORS[theme]};border-color:${THEME_DOT_BORDER[theme]}"></span>`;
  }

  const headerEl = document.createElement('header');
  headerEl.id = 'sh-header';
  headerEl.innerHTML = `
    <a href="/" class="sh-logo" aria-label="Ir a inicio">
      <svg width="26" height="26" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="shCoinGrad" cx="38%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#f2dca0"/>
            <stop offset="55%" stop-color="#c9a14a"/>
            <stop offset="100%" stop-color="#93732e"/>
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="28" fill="#7a5510"/>
        <circle cx="32" cy="30" r="28" fill="url(#shCoinGrad)"/>
        <circle cx="32" cy="30" r="22" fill="none" stroke="#8a6520" stroke-width="1.5" opacity="0.5"/>
        <text x="32" y="39" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-weight="400" font-style="italic" fill="#4a3000" opacity="0.85">f</text>
      </svg>
      <span>font<em>a</em>na</span>
    </a>

    <div class="sh-right">
      <!-- Tema -->
      <div class="sh-prefs-item">
        <button class="sh-btn" id="sh-theme-btn" onclick="shToggleMenu('sh-theme-menu')" aria-label="Cambiar tema">
          ${getThemeDotHTML(savedTheme)}
          <span class="sh-label" id="sh-theme-label">${THEME_LABELS[savedTheme][savedLang]}</span>
        </button>
        <div class="sh-menu" id="sh-theme-menu">
          <button onclick="shSetTheme('light')" data-sh-theme="light">
            <span class="sh-dot" style="background:#fbfaf7;border-color:#b8853a;"></span>
            <span id="sh-lbl-light">${savedLang === 'es' ? 'Blanco' : 'White'}</span>
          </button>
          <button onclick="shSetTheme('blue')" data-sh-theme="blue">
            <span class="sh-dot" style="background:#235f88;border-color:transparent;"></span>
            <span id="sh-lbl-blue">${savedLang === 'es' ? 'Azul' : 'Blue'}</span>
          </button>
          <button onclick="shSetTheme('dark')" data-sh-theme="dark">
            <span class="sh-dot" style="background:#0c1016;border-color:transparent;"></span>
            <span id="sh-lbl-dark">${savedLang === 'es' ? 'Negro' : 'Black'}</span>
          </button>
        </div>
      </div>

      <!-- Idioma -->
      <div class="sh-prefs-item">
        <button class="sh-btn" id="sh-lang-btn" onclick="shToggleMenu('sh-lang-menu')" aria-label="Cambiar idioma">
          <span id="sh-lang-flag">${savedLang === 'es' ? '🌐 ES' : '🌐 EN'}</span>
        </button>
        <div class="sh-menu" id="sh-lang-menu">
          <button onclick="shSetLang('es')" data-sh-lang="es">🇪🇸 Español</button>
          <button onclick="shSetLang('en')" data-sh-lang="en">🇬🇧 English</button>
        </div>
      </div>

      <!-- Volver -->
      <a href="/" class="sh-back">← Inicio</a>
    </div>
  `;

  /* Insertar al inicio del body */
  document.body.insertBefore(headerEl, document.body.firstChild);

  /* ── 5. Marcar opción activa inicial ── */
  shMarkActive(savedTheme, savedLang);

  /* ── 6. Funciones globales de control ── */
  window.shToggleMenu = function (id) {
    const target = document.getElementById(id);
    const wasOpen = target.classList.contains('open');
    /* Cerrar todos */
    document.querySelectorAll('.sh-menu').forEach(m => m.classList.remove('open'));
    if (!wasOpen) target.classList.add('open');
  };

  window.shSetTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fontana_theme', theme);
    const lang = localStorage.getItem('fontana_lang') || 'es';
    /* Actualizar dot y label */
    const dot = document.getElementById('sh-theme-dot');
    if (dot) { dot.style.background = THEME_DOT_COLORS[theme]; dot.style.borderColor = THEME_DOT_BORDER[theme]; }
    const lbl = document.getElementById('sh-theme-label');
    if (lbl) lbl.textContent = THEME_LABELS[theme][lang];
    shMarkActive(theme, lang);
    document.querySelectorAll('.sh-menu').forEach(m => m.classList.remove('open'));
  };

  window.shSetLang = function (lang) {
    const prevLang = localStorage.getItem('fontana_lang') || 'es';
    localStorage.setItem('fontana_lang', lang);
    document.documentElement.setAttribute('lang', lang);
    const theme = localStorage.getItem('fontana_theme') || 'light';
    /* Actualizar flag y etiqueta de tema */
    const flag = document.getElementById('sh-lang-flag');
    if (flag) flag.textContent = lang === 'es' ? '🌐 ES' : '🌐 EN';
    const lbl = document.getElementById('sh-theme-label');
    if (lbl) lbl.textContent = THEME_LABELS[theme][lang];
    /* Traducir etiquetas del menú de temas */
    const lblLight = document.getElementById('sh-lbl-light');
    const lblBlue = document.getElementById('sh-lbl-blue');
    const lblDark = document.getElementById('sh-lbl-dark');
    if (lblLight) lblLight.textContent = THEME_LABELS.light[lang];
    if (lblBlue) lblBlue.textContent = THEME_LABELS.blue[lang];
    if (lblDark) lblDark.textContent = THEME_LABELS.dark[lang];
    /* Traducir botón "Volver" */
    const back = document.querySelector('#sh-header .sh-back');
    if (back) back.textContent = lang === 'es' ? '← Inicio' : '← Home';
    shMarkActive(theme, lang);
    document.querySelectorAll('.sh-menu').forEach(m => m.classList.remove('open'));

    // Recargar página si el idioma efectivamente cambió para que las páginas estáticas apliquen el traductor
    if (lang !== prevLang) {
      window.location.reload();
    }
  };

  function shMarkActive(theme, lang) {
    document.querySelectorAll('[data-sh-theme]').forEach(b =>
      b.classList.toggle('sh-active', b.dataset.shTheme === theme));
    document.querySelectorAll('[data-sh-lang]').forEach(b =>
      b.classList.toggle('sh-active', b.dataset.shLang === lang));
  }

  /* Cerrar menús al hacer clic fuera */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.sh-prefs-item')) {
      document.querySelectorAll('.sh-menu').forEach(m => m.classList.remove('open'));
    }
  });

})();
