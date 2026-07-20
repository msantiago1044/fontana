/* ============================================================
       SISTEMA DE TEMAS (blanco / azul / negro) e IDIOMAS (es / en)
       ============================================================ */
const THEME_LABELS = { light: { es: 'Blanco', en: 'White' }, blue: { es: 'Azul', en: 'Blue' }, dark: { es: 'Negro', en: 'Black' } };
const THEME_DOTS = { light: '#fbfaf7', blue: '#235f88', dark: '#0c1016' };

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('fontana_theme', theme);
  document.getElementById('themeDot').style.background = THEME_DOTS[theme];
  document.getElementById('themeDot').style.borderColor = theme === 'light' ? '#b8853a' : 'transparent';
  const lang = localStorage.getItem('fontana_lang') || 'es';
  document.getElementById('themeLabel').textContent = THEME_LABELS[theme][lang];
  document.querySelectorAll('[data-theme-option]').forEach(b => b.classList.toggle('active', b.dataset.themeOption === theme));
  closeAllMenus();
}

function setLang(lang) {
  localStorage.setItem('fontana_lang', lang);
  document.documentElement.setAttribute('lang', lang);
  document.getElementById('langFlagLabel').textContent = lang === 'es' ? '🌐 ES' : '🌐 EN';
  document.querySelectorAll('[data-lang-option]').forEach(b => b.classList.toggle('active', b.dataset.langOption === lang));
  applyTranslations(lang);
  const theme = localStorage.getItem('fontana_theme') || 'light';
  document.getElementById('themeLabel').textContent = THEME_LABELS[theme][lang];
  closeAllMenus();
}

function toggleMenu(id) {
  const menu = document.getElementById(id);
  const isOpen = menu.classList.contains('show');
  closeAllMenus();
  if (!isOpen) menu.classList.add('show');
}
function closeAllMenus() {
  document.getElementById('themeMenu').classList.remove('show');
  document.getElementById('langMenu').classList.remove('show');
  const um = document.getElementById('userMenu');
  if (um) um.classList.remove('show');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.prefs-item') && !e.target.closest('.user-chip')) closeAllMenus();
});

function getNested(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : null, obj);
}
function applyTranslations(lang) {
  const dict = I18N[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const text = getNested(dict, el.dataset.i18n);
    if (text !== null) el.innerHTML = text;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const text = getNested(dict, el.dataset.i18nPlaceholder);
    if (text !== null) el.setAttribute('placeholder', text);
  });
  // re-pinta el año (footer.fine reemplaza el innerHTML, hay que reinsertar el span)
  const fineEl = document.querySelector('[data-i18n="footer.fine"]');
  if (fineEl) fineEl.innerHTML = fineEl.innerHTML.replace('{year}', new Date().getFullYear());
  // re-pinta el ranking y las plantillas de correo, que dependen del idioma
  renderRanking(lang);
}

const I18N = {
  es: {
    testBadge: "🧪 Modo de prueba — sin pagos ni correos reales",
    theme: { light: "Blanco", blue: "Azul", dark: "Negro" },
    nav: { how: "Cómo funciona", system: "El sistema", contribution: "Contribución", faq: "Preguntas", cta: "Pedir mi deseo" },
    userChip: { logout: "Cerrar sesión" },
    hero: {
      eyebrow: "Fe y trabajo",
      title: "Entrega tu moneda. <br><em>Algo se queda trabajando</em> en tu deseo.",
      lede: "Fontana es el ritual de siempre — una moneda, un deseo, una intención — acompañado de un sistema de inteligencia artificial que no descansa: trabaja tu deseo prompt sobre prompt, 24 horas al día, durante 30 días, y te mantiene informado de cada avance.",
      ctaPrimary: "Pedir mi deseo desde 1 USD",
      ctaGhost: "Ver cómo funciona",
      foot: "Un deseo activo por persona · Tu correo es solo tuyo · Cancela las notificaciones cuando quieras"
    },
    how: {
      kicker: "El ritual", title: "Cuatro pasos, un solo deseo.",
      lead: "No es magia. Es un compromiso: tú entregas algo con intención, y a cambio algo trabaja por ti sin pausa.",
      step1: { title: "Te identificas", body: "Inicias sesión con tu cuenta de Google. Así nos asegura que tu deseo es realmente tuyo, y solo tienes uno." },
      step2: { title: "Entregas tu moneda", body: "Desde 1 dólar, el gesto simbólico que activa tu deseo. Pago seguro, una sola vez." },
      step3: { title: "Formulas tu deseo", body: "Escribes lo que quieres lograr, en tus palabras. Sin fórmulas mágicas, solo lo que de verdad sientes." },
      step4: { title: "El sistema se enciende", body: "Recibes tu primer paso en minutos. Luego, un acompañamiento continuo durante 30 días." }
    },
    cycle: {
      kicker: "Lo que pasa después", title: "Una IA que no se detiene hasta que algo se mueve.",
      lead: "Tu deseo entra a un ciclo de trabajo continuo durante las 720 horas de tu mes. La inteligencia artificial vuelve sobre él una y otra vez — prompt sobre prompt — refinando un plan de acción real, y te escribe en el momento que detecta oportuno para avanzar, hasta que ese plan está completo o tu ciclo termina.",
      n1: { top: "Paso 1", bottom: "Primer correo" },
      n2: { top: "Ciclo IA", bottom: "Indaga y planea" },
      n3: { top: "720 horas", bottom: "Correos en el momento justo" },
      n4: { top: "Cierre del mes", bottom: "Correo final" },
      loopLabel: "↻ El ciclo IA se repite internamente, ajustando el plan según el avance real de tu deseo"
    },
    honesty: {
      kicker: "Lo que sí, lo que no",
      title: "Te lo decimos claro, como se merece un deseo de verdad.",
      p1: { strong: "Fontana no te promete que tu deseo se va a cumplir.", rest: "Ninguna fuente lo hizo nunca, y nadie puede prometerte eso con honestidad." },
      p2: { strong: "Lo que sí te prometemos:", rest: "un sistema que indaga en tu deseo todos los días durante un mes, que te mantiene informado de cómo va, y que en algunos casos puede incluso actuar directamente por ti — por ejemplo, conectándote con la persona indicada. La fe pone la intención. El trabajo —el tuyo, y el de la IA que trabaja contigo— pone el camino." }
    },
    offer: {
      kicker: "La contribución", title: "Desde 1 dólar. Sin letra pequeña escondida.",
      amountSuffix: "USD en adelante", amountSub: "Contribución única · Un deseo por persona",
      li1: "Tu deseo entra al sistema de inteligencia artificial",
      li2: "Correo inmediato con tu primer paso a seguir",
      li3: "Correos de avance durante las 720 horas de tu mes, en el momento que el sistema detecta oportuno",
      li4: "En algunos casos, la IA puede actuar directamente en favor de tu deseo",
      cta: "Pedir mi deseo",
      why: "¿Por qué empieza en 1 dólar? Porque el monto no es el punto — el gesto sí. Algunas personas eligen dar más, como ofrenda más grande a su propio compromiso. Tú decides cuánta fe le pones.",
      stripe: "Pago procesado de forma segura por Wompi. No almacenamos los datos de tu tarjeta."
    },
    ranking: {
      title: "La fuente recuerda a quienes más han dado",
      sub: "Un ranking público de fe — elige tu apodo al contribuir y aparece aquí.",
      note: ""
    },
    faq: {
      kicker: "Preguntas frecuentes", title: "Antes de pedir tu deseo",
      q1: "¿Por qué solo puedo pedir un deseo?",
      a1: "Porque un deseo concentrado tiene más fuerza que uno disperso. Fontana está diseñado para que toda tu fe y todo el trabajo del sistema se enfoquen en una sola intención a la vez — la tuya.",
      q2: "¿Qué tanto puede avanzar mi deseo en 30 días?",
      a2: "Más de lo que muchas personas logran solas en ese tiempo. Durante las 720 horas de tu mes, el sistema trabaja activamente en tu deseo, te mantiene informado de cómo va, y en algunos casos puede incluso actuar directamente en tu favor. Lo que avances después, sigue siendo tuyo.",
      q3: "¿Qué hace la inteligencia artificial exactamente?",
      a3: "Primero indaga: estudia tu deseo con calma para conocerte a ti y entender todos los aspectos de lo que pides. Luego analiza y genera un plan de acción personalizado. A partir de ahí, te escribe en el momento que detecta el avance adecuado — y cuando el deseo lo permite, puede actuar directamente para acercarte a él.",
      q4: "¿Es esto un servicio de adivinación o esoterismo?",
      a4: "No. Es un ritual de intención real, combinado con un sistema de IA que trabaja activamente por ti. No leemos el futuro — construimos el camino hacia él, contigo.",
      q5: "¿Qué es el ranking de donadores?",
      a5: "Un reconocimiento público a quienes más fe (y contribución) han puesto en la Fuente. Eliges un apodo al donar — nunca tu nombre real si no quieres — y tu posición se actualiza según el total que hayas contribuido."
    },
    footer: {
      terms: "Términos y condiciones", privacy: "Privacidad", refunds: "Reembolsos", contact: "Contacto",
      fine: "Fontana es un servicio de inspiración y acompañamiento personal apoyado en inteligencia artificial. No constituye asesoría financiera, médica, legal ni psicológica, y no garantiza el cumplimiento de ningún deseo o resultado. Debes tener 18 años o más para usar este servicio. © {year} Fontana."
    },
    cat: { love: "Amor y relaciones", money: "Dinero y trabajo", health: "Salud y bienestar", family: "Familia", growth: "Crecimiento personal", other: "Otro" },
    modal: {
      auth: { title: "Identifícate", sub: "Para que tu deseo sea único y solo tuyo.", google: "Continuar con Google", note: "Al continuar, aceptas nuestros", terms: "Términos", and: "y", privacy: "Política de Privacidad" },
      wish: {
        title: "Tu deseo", sub: "Escríbelo como lo sientes. La IA lo va a leer con cuidado.",
        catLabel: "¿Con qué se relaciona tu deseo?", textLabel: "Describe tu deseo", textPlaceholder: "Quiero...",
        emailLabel: "Tu correo (a donde llegará tu acompañamiento)", emailPlaceholder: "tucorreo@ejemplo.com",
        cta: "Continuar a la contribución →"
      },
      payment: {
        title: "Tu contribución", sub: "El gesto que activa tu deseo en el sistema.",
        amountLabel: "Monto (USD, mínimo 1)",
        aliasLabel: "Elige tu apodo para el ranking de donadores", aliasPlaceholder: "Ej. Viajero777",
        aliasNote: "Este apodo es público y aparece en el ranking. No uses tu nombre real si prefieres mantenerlo privado.",
        stripeNote: "Serás redirigido a Wompi para completar el pago de forma segura.",
        testNote: "",
        cta: "Ir a pagar →"
      },
      processing: { title: "Tu moneda cae en la fuente...", sub: "Procesando tu contribución" },
      confirmed: {
        title: "Tu deseo ya está en marcha 🪙", sub: "Esto es lo que recibirás en tu correo en los próximos minutos:",
        from: "De: La Fuente — Fontana", subject: "Asunto: Tu deseo ya está en marcha 🪙",
        footer: "La Fuente seguirá trabajando en tu deseo durante las próximas 720 horas. — Fontana",
        testNote: "",
        cta: "Continuar →"
      },
      identity: {
        title: "Ayúdanos a conocerte mejor",
        sub: "Este segundo correo (opcional) nos ayuda a personalizar mejor el trabajo de la IA sobre tu deseo. Puedes omitirlo y tu ciclo de 30 días arranca igual.",
        nameLabel: "¿Cómo te llamas?", namePlaceholder: "Tu nombre",
        ageLabel: "¿Cuántos años tienes?", agePlaceholder: "Ej. 29",
        contextLabel: "Cuéntanos un poco más de contexto sobre tu deseo", contextPlaceholder: "Lo que creas que ayuda a entender mejor tu situación...",
        cta: "Enviar datos", skip: "Omitir por ahora"
      }
    }
  },
  en: {
    testBadge: "🧪 Test mode — no real payments or emails",
    theme: { light: "White", blue: "Blue", dark: "Black" },
    nav: { how: "How it works", system: "The system", contribution: "Contribution", faq: "FAQ", cta: "Make my wish" },
    userChip: { logout: "Sign out" },
    hero: {
      eyebrow: "Faith and work",
      title: "Give your coin. <br><em>Something keeps working</em> on your wish.",
      lede: "Fontana is the ritual you already know — a coin, a wish, an intention — paired with an AI system that never rests: it works on your wish prompt after prompt, 24 hours a day, for 30 days, and keeps you informed of every step forward.",
      ctaPrimary: "Make my wish from $1 USD",
      ctaGhost: "See how it works",
      foot: "One active wish per person · Your email stays yours · Cancel notifications anytime"
    },
    how: {
      kicker: "The ritual", title: "Four steps, one wish.",
      lead: "It's not magic. It's a commitment: you give something with intention, and in return something works for you without pause.",
      step1: { title: "You verify who you are", body: "You sign in with your Google account. That's how we make sure your wish is truly yours, and that you only have one." },
      step2: { title: "You give your coin", body: "From $1, the symbolic gesture that activates your wish. Secure payment, one time only." },
      step3: { title: "You make your wish", body: "You write down what you want to achieve, in your own words. No magic formulas, just what you truly feel." },
      step4: { title: "The system switches on", body: "You receive your first step within minutes. Then, continuous support for 30 days." }
    },
    cycle: {
      kicker: "What happens next", title: "An AI that won't stop until something moves.",
      lead: "Your wish enters a continuous work cycle across the 720 hours of your month. The AI returns to it again and again — prompt after prompt — refining a real action plan, and writes to you whenever it considers it the right moment for you to take action, until that plan is complete or your cycle ends.",
      n1: { top: "Step 1", bottom: "First email" },
      n2: { top: "AI cycle", bottom: "Investigates and plans" },
      n3: { top: "720 hours", bottom: "Emails at the right time" },
      n4: { top: "Month closes", bottom: "Final email" },
      loopLabel: "↻ The AI cycle repeats internally, adjusting the plan based on the real progress of your wish"
    },
    honesty: {
      kicker: "What we promise, what we don't",
      title: "We'll tell you straight, the way a real wish deserves.",
      p1: { strong: "Fontana doesn't promise your wish will come true.", rest: "No fountain ever did, and no one can honestly promise you that." },
      p2: { strong: "What we do promise:", rest: "a system that looks into your wish every day for a month, that keeps you informed of how it's going, and that in some cases can even act directly on your behalf — for example, connecting you with the right person. Faith provides the intention. The work — yours, and the AI's working alongside you — provides the path." }
    },
    offer: {
      kicker: "The contribution", title: "From $1. No hidden fine print.",
      amountSuffix: "USD and up", amountSub: "One-time contribution · One wish per person",
      li1: "Your wish enters the AI system",
      li2: "Immediate email with your first step to take",
      li3: "Progress emails across the 720 hours of your month, whenever the system considers it the right moment",
      li4: "In some cases, the AI can act directly in favor of your wish",
      cta: "Make my wish",
      why: "Why start at $1? Because the amount isn't the point — the gesture is. Some people choose to give more, as a bigger offering to their own commitment. You decide how much faith you put into it.",
      stripe: "Payment securely processed by Wompi. We don't store your card details."
    },
    ranking: {
      title: "The fountain remembers those who've given the most",
      sub: "A public ranking of faith — choose your alias when contributing and you'll appear here.",
      note: ""
    },
    faq: {
      kicker: "Frequently asked questions", title: "Before you make your wish",
      q1: "Why can I only make one wish?",
      a1: "Because a focused wish carries more strength than a scattered one. Fontana is designed so that all your faith and all the system's work focus on a single intention at a time — yours.",
      q2: "How much can my wish move forward in 30 days?",
      a2: "More than many people achieve alone in that time. Across the 720 hours of your month, the system actively works on your wish, keeps you informed of how it's going, and in some cases can even act directly in your favor. Whatever you build after that stays yours.",
      q3: "What exactly does the AI do?",
      a3: "First, it investigates: it studies your wish carefully to understand you and every aspect of what you're asking for. Then it analyzes and builds a personalized action plan. From there, it writes to you whenever it considers the moment right for progress — and when the wish allows it, it can act directly to bring you closer to it.",
      q4: "Is this a fortune-telling or esoteric service?",
      a4: "No. It's a real ritual of intention, paired with an AI system that actively works for you. We don't read the future — we build the path toward it, together with you.",
      q5: "What is the donor ranking?",
      a5: "A public recognition of those who've put the most faith (and contribution) into the Fountain. You choose an alias when donating — never your real name if you'd rather not — and your position updates based on your total contribution."
    },
    footer: {
      terms: "Terms and Conditions", privacy: "Privacy", refunds: "Refunds", contact: "Contact",
      fine: "Fontana is an inspiration and personal support service powered by artificial intelligence. It does not constitute financial, medical, legal, or psychological advice, and does not guarantee that any wish or outcome will be fulfilled. You must be 18 or older to use this service. © {year} Fontana."
    },
    cat: { love: "Love and relationships", money: "Money and career", health: "Health and wellbeing", family: "Family", growth: "Personal growth", other: "Other" },
    modal: {
      auth: { title: "Verify who you are", sub: "So your wish is unique and truly yours.", google: "Continue with Google", note: "By continuing, you accept our", terms: "Terms", and: "and", privacy: "Privacy Policy" },
      wish: {
        title: "Your wish", sub: "Write it the way you feel it. The AI will read it carefully.",
        catLabel: "What's your wish related to?", textLabel: "Describe your wish", textPlaceholder: "I want...",
        emailLabel: "Your email (where your follow-up will arrive)", emailPlaceholder: "youremail@example.com",
        cta: "Continue to contribution →"
      },
      payment: {
        title: "Your contribution", sub: "The gesture that activates your wish in the system.",
        amountLabel: "Amount (USD, minimum 1)",
        aliasLabel: "Choose your alias for the donor ranking", aliasPlaceholder: "E.g. Traveler777",
        aliasNote: "This alias is public and appears in the ranking. Don't use your real name if you'd rather keep it private.",
        stripeNote: "You'll be redirected to Wompi to complete payment securely.",
        testNote: "",
        cta: "Go to payment →"
      },
      processing: { title: "Your coin is falling into the fountain...", sub: "Processing your contribution" },
      confirmed: {
        title: "Your wish is already in motion 🪙", sub: "Here's what you'll receive in your email in the next few minutes:",
        from: "From: The Fountain — Fontana", subject: "Subject: Your wish is already in motion 🪙",
        footer: "The Fountain will keep working on your wish over the next 720 hours. — Fontana",
        testNote: "📝 Test note: this text is a template example. The real email will be written by the AI (GLM), personalized to your wish, once we connect the automations.",
        cta: "Continue →"
      },
      identity: {
        title: "Help us get to know you better",
        sub: "This second, optional step helps the AI personalize its work on your wish. You can skip it and your 30-day cycle starts the same.",
        nameLabel: "What's your name?", namePlaceholder: "Your name",
        ageLabel: "How old are you?", agePlaceholder: "E.g. 29",
        contextLabel: "Tell us a bit more context about your wish", contextPlaceholder: "Whatever you think helps us understand your situation better...",
        cta: "Submit details", skip: "Skip for now"
      }
    }
  }
};

/* ================================================================
  FONTANA — Lógica principal (v3)
  ================================================================
  Secciones:
    1. Constantes y configuración
    2. Supabase — inicialización
    3. Modal — control de pasos y UI
    4. Auth — login con Google (onAuthStateChange + recuperación)
    5. Flujo de deseo — validaciones y navegación
    6. Pago con Wompi — firma, widget y callback
    7. Registro en Supabase — guardar-deseo Edge Function
    8. Recuperación de pago — si el usuario cierra el widget
    9. Formulario de identidad
   10. Ranking (demo)
   11. FAQ
   12. Inicialización
================================================================ */

/* ----------------------------------------------------------------
   1. CONSTANTES Y CONFIGURACIÓN
---------------------------------------------------------------- */
const SUPABASE_URL = 'https://cbvqwdrbwogsmcglsvzg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CAqF53kRDfzET56lLdKZIQ_UlnG-r5A';
const WOMPI_PUB_KEY = 'pub_test_0IxGzreyyHchWskYuckz5fWSptihxzuc';
const USD_TO_COP = 4200;        // Actualiza periódicamente
const EDGE_FIRMA = `${SUPABASE_URL}/functions/v1/wompi-firma`;
const EDGE_GUARDAR = `${SUPABASE_URL}/functions/v1/guardar-deseo`;
const EDGE_VERIFICAR = `${SUPABASE_URL}/functions/v1/verificar-pago`; // futura validación

// Key que usamos para persistir el intento de pago entre recargas
const LS_PENDING_KEY = 'fontana_payment_pending';
// NOTA: usamos localStorage (no sessionStorage) para el flag de flujo porque
// algunos navegadores (Safari, móvil) limpian sessionStorage durante el
// redirect de OAuth, haciendo que el modal no se abra al volver.
const SS_FLOW_KEY = 'fontana_wish_flow';

// Plantillas de correo (preview de experiencia; la IA genera el real)
const PREVIEW_TEMPLATES = {
  es: {
    love: "Tu deseo llegó a la Fuente. Ya empezamos a indagar en tu situación para entender bien tu contexto. Mientras seguimos trabajando, un primer paso para ti: hoy, escribe en una nota tres cosas que te gustaría que la otra persona encuentre en ti cuando llegue. La Fuente sigue activa en esto, y te escribirá de nuevo en cuanto tenga algo útil que decirte.",
    money: "Tu deseo llegó a la Fuente. Ya empezamos a estudiar tu situación para conocer todos los aspectos relevantes. Un primer paso mientras avanzamos: escribe el número exacto que necesitas o el puesto exacto que buscas. La claridad ayuda incluso a un sistema que trabaja por ti. Te escribiremos de nuevo en cuanto haya un avance que contarte.",
    health: "Tu deseo llegó a la Fuente. Estamos indagando en tu situación para entenderla con cuidado. Un primer paso pequeño a propósito: anota una sola cosa que tu cuerpo te ha estado pidiendo y que llevas posponiendo. La Fuente sigue trabajando en lo que sigue, y te avisará en cuanto sea momento.",
    family: "Tu deseo llegó a la Fuente. Ya estamos conociendo el contexto de tu situación. Un primer paso: piensa en una persona específica de tu familia y una frase concreta que te gustaría decirle. La Fuente sigue activa en esto y volverá a escribirte con el siguiente avance.",
    growth: "Tu deseo llegó a la Fuente. Estamos indagando en tu contexto para entender bien qué necesitas. Un primer paso: elige una sola hora de esta semana y bloquéala, sin excusas, para algo que te acerque a quien quieres ser. La Fuente te escribirá de nuevo con el siguiente avance.",
    other: "Tu deseo llegó a la Fuente. Ya empezamos a indagar en tu situación para entender todos sus aspectos. Mientras tanto, un primer paso: escribe en una frase qué se vería diferente en tu vida si esto avanzara. La Fuente sigue trabajando, y te escribirá de nuevo en cuanto tenga novedades."
  },
  en: {
    love: "Your wish reached the Fountain. We've already started looking into your situation to understand your context well. While we keep working, a first step for you: today, write down three things you'd like the other person to find in you when they arrive. The Fountain stays active on this, and will write to you again once it has something useful to say.",
    money: "Your wish reached the Fountain. We've already started studying your situation to understand every relevant aspect. A first step while we move forward: write down the exact number you need or the exact role you're looking for. Clarity helps even a system that's working for you. We'll write again once there's progress to share.",
    health: "Your wish reached the Fountain. We're looking into your situation carefully. A first step, small on purpose: write down one thing your body has been asking for that you keep postponing. The Fountain keeps working on what comes next, and will let you know when the moment is right.",
    family: "Your wish reached the Fountain. We're already getting to know the context of your situation. A first step: think of a specific person in your family and one concrete thing you'd like to tell them. The Fountain stays active on this and will write again with the next step forward.",
    growth: "Your wish reached the Fountain. We're looking into your context to understand what you need. A first step: pick a single hour this week and block it off, no excuses, for something that moves you closer to who you want to be. The Fountain will write again with the next step.",
    other: "Your wish reached the Fountain. We've already started looking into your situation to understand every angle of it. Meanwhile, a first step: write in one sentence what would look different in your life if this moved forward. The Fountain keeps working, and will write again once there's news."
  }
};

/* Helper: ¿idioma actual? */
function isEn() {
  return (localStorage.getItem('fontana_lang') || 'es') === 'en';
}

/* ----------------------------------------------------------------
   2. SUPABASE — INICIALIZACIÓN
---------------------------------------------------------------- */
let supabaseClient = null;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true   // Necesario para el redirect de Google OAuth
      }
    });
  } else {
    console.error('[Fontana] SDK Supabase no cargó. Verifica conexión.');
  }
} catch (e) {
  console.error('[Fontana] Error al inicializar Supabase:', e);
}

/* ----------------------------------------------------------------
   3. MODAL — CONTROL DE PASOS Y UI
---------------------------------------------------------------- */
const STEPS = ['step-auth', 'step-wish', 'step-payment', 'step-processing', 'step-confirmed', 'step-identity'];

function showStep(stepId) {
  STEPS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === stepId) ? 'block' : 'none';
  });
}

/* ----------------------------------------------------------------
   3b. USER CHIP — refleja el estado de sesión en el header
---------------------------------------------------------------- */

/** Actualiza el chip de usuario en el header según la sesión activa */
function updateUserChip(session) {
  const navCta = document.getElementById('navCta');
  const chip = document.getElementById('userChip');
  const avatar = document.getElementById('userAvatar');
  const chipName = document.getElementById('userChipName');
  const menuEmail = document.getElementById('userMenuEmail');

  if (!chip) return;

  if (session && session.user) {
    const user = session.user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const email = user.email || '';
    const photo = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
    const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      : email.slice(0, 2).toUpperCase();

    // Avatar: foto de Google si existe, sino iniciales
    if (photo) {
      avatar.innerHTML = '<img src="' + photo + '" alt="" referrerpolicy="no-referrer">';
    } else {
      avatar.textContent = initials;
    }

    chipName.textContent = name.split(' ')[0] || email.split('@')[0];
    menuEmail.textContent = email;

    if (navCta) navCta.style.display = 'none';
    chip.style.display = 'block';
  } else {
    // Sin sesión → mostrar el CTA original, ocultar chip
    if (navCta) navCta.style.display = '';
    chip.style.display = 'none';
  }
}

/** Cierra la sesión de Supabase */
async function signOut() {
  closeAllMenus();
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  _auth.session = null;
  _auth.hasActiveWish = false;
  updateUserChip(null);
}

/* ----------------------------------------------------------------
   4. AUTH — CACHÉ DE SESIÓN Y ESTADO DEL USUARIO
   onAuthStateChange se dispara gratis en cada carga con INITIAL_SESSION.
   Lo usamos para cachear sesión + perfil en memoria, de modo que
   openModal() tenga la respuesta lista de forma instantánea (sin red).
---------------------------------------------------------------- */

// Caché en memoria — se llena antes de que el usuario haga clic en nada
const _auth = {
  ready: false,          // true cuando INITIAL_SESSION ya resolvió
  session: null,         // sesión activa o null
  hasActiveWish: false,  // true si el perfil en BD tiene deseo activo
  _resolve: null,        // promesa interna para quien llegue antes del INITIAL_SESSION
};
_auth._promise = new Promise(res => { _auth._resolve = res; });

/** Espera a que el INITIAL_SESSION haya resuelto (máx. 3 s de seguridad) */
function waitForAuth() {
  if (_auth.ready) return Promise.resolve();
  return Promise.race([
    _auth._promise,
    new Promise(res => setTimeout(res, 3000))
  ]);
}

/** Abre el modal y decide el paso a mostrar usando el caché — sin red */
function openModal() {
  document.getElementById('modalOverlay').classList.add('show');

  if (!_auth.ready) {
    // Caso raro: el usuario es MUY rápido y el INITIAL_SESSION aún no llegó.
    // Mostramos el formulario de Google y dejamos que onAuthStateChange corrija.
    showStep('step-auth');
    return;
  }

  _resolveModalStep(_auth.session, _auth.hasActiveWish);
}

/** Decide qué paso mostrar dado el estado de sesión y perfil */
function _resolveModalStep(session, hasActiveWish) {
  if (!session) {
    showStep('step-auth');
    return;
  }

  if (hasActiveWish) {
    _showAlreadyHasWish();
    showStep('step-auth');
    return;
  }

  const pending = getPendingPayment(session.user.id);
  if (pending) {
    showPendingPaymentRecovery(pending);
    return;
  }

  // Usuario logueado, sin deseo activo, sin pago pendiente → formulario directo
  const emailEl = document.getElementById('wishEmail');
  if (emailEl) emailEl.value = session.user.email || '';
  showStep('step-wish');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  setTimeout(resetModalState, 300);
}

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target.id === 'modalOverlay') closeModal();
});

function resetModalState() {
  const authStep = document.getElementById('step-auth');
  if (authStep && authStep.dataset.originalHtml) {
    authStep.innerHTML = authStep.dataset.originalHtml;
  }
  showStep('step-auth');
  ['wishText', 'wishEmail', 'donorAlias', 'identityName', 'identityAge', 'identityContext']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const countEl = document.getElementById('count');
  if (countEl) countEl.textContent = '0';
}

function _showAlreadyHasWish() {
  const authStep = document.getElementById('step-auth');
  authStep.innerHTML = isEn()
    ? `<h3>You already have an active wish</h3>
           <p class="sub">Check your email — your wish is already being worked on. Only one wish per person.</p>
           <button class="btn-ghost btn-full" style="margin-top:20px" onclick="closeModal()">Close</button>`
    : `<h3>Ya tienes un deseo activo</h3>
           <p class="sub">Revisa tu correo — ya estamos trabajando en tu deseo. Solo se permite uno por persona.</p>
           <button class="btn-ghost btn-full" style="margin-top:20px" onclick="closeModal()">Cerrar</button>`;
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    alert(isEn()
      ? 'Login service unavailable. Please reload the page.'
      : 'Servicio de login no disponible. Recarga la página.');
    return;
  }
  localStorage.setItem(SS_FLOW_KEY, '1');
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    console.error('[Fontana] OAuth error:', error);
    alert(isEn()
      ? 'Could not sign you in: ' + error.message
      : 'No pudimos iniciar sesión: ' + error.message);
    localStorage.removeItem(SS_FLOW_KEY);
  }
}

/**
 * onAuthStateChange se dispara dos veces relevantes:
 *   1. INITIAL_SESSION al cargar → usamos para llenar el caché (_auth)
 *   2. SIGNED_IN al regresar de Google OAuth → abrimos el modal directamente
 */
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {

    if (event === 'INITIAL_SESSION') {
      // Llenar el caché con la sesión y el perfil del usuario
      _auth.session = session;

      if (session) {
        try {
          const { data: profile } = await supabaseClient
            .from('profiles')
            .select('has_active_wish')
            .eq('id', session.user.id)
            .maybeSingle();
          _auth.hasActiveWish = profile?.has_active_wish ?? false;
        } catch (e) {
          console.warn('[Fontana] No se pudo leer el perfil en INITIAL_SESSION', e);
          _auth.hasActiveWish = false;
        }
      }

      _auth.ready = true;
      _auth._resolve(); // desbloquear waitForAuth() si alguien esperaba

      // Actualizar el chip de usuario en el header
      updateUserChip(session);

      // CASO CLAVE: cuando Supabase v2 procesa el hash de OAuth en la carga
      // inicial, dispara INITIAL_SESSION (con sesión) en lugar de SIGNED_IN.
      // Detectamos esto chequeando el flag de flujo que guardamos antes del redirect.
      const wasInFlow = localStorage.getItem(SS_FLOW_KEY) === '1';
      if (wasInFlow && session) {
        localStorage.removeItem(SS_FLOW_KEY);
        document.getElementById('modalOverlay').classList.add('show');
        _resolveModalStep(session, _auth.hasActiveWish);
      }
      return;
    }

    if (event === 'SIGNED_IN') {
      // Retorno del redirect de Google OAuth (algunas versiones de Supabase
      // disparan SIGNED_IN en lugar de — o además de — INITIAL_SESSION)
      const wasInFlow = localStorage.getItem(SS_FLOW_KEY) === '1';
      if (!wasInFlow) return;
      localStorage.removeItem(SS_FLOW_KEY);

      // Actualizar caché con la nueva sesión
      _auth.session = session;
      try {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('has_active_wish')
          .eq('id', session.user.id)
          .maybeSingle();
        _auth.hasActiveWish = profile?.has_active_wish ?? false;
      } catch (e) {
        _auth.hasActiveWish = false;
      }
      _auth.ready = true;

      // Actualizar el chip de usuario en el header
      updateUserChip(session);

      // Abrir el modal directamente en el paso correcto
      document.getElementById('modalOverlay').classList.add('show');
      _resolveModalStep(session, _auth.hasActiveWish);
      return;
    }

    if (event === 'SIGNED_OUT') {
      _auth.session = null;
      _auth.hasActiveWish = false;
      updateUserChip(null);
    }
  });
} else {
  // Sin Supabase — marcar como listo sin sesión
  _auth.ready = true;
  _auth._resolve();
}

/* ----------------------------------------------------------------
   5. FLUJO DE DESEO — VALIDACIONES Y NAVEGACIÓN
---------------------------------------------------------------- */
function updateCount() {
  const el = document.getElementById('wishText');
  const count = document.getElementById('count');
  if (el && count) count.textContent = el.value.length;
}

function goToPayment() {
  const text = document.getElementById('wishText')?.value.trim() || '';
  const email = document.getElementById('wishEmail')?.value.trim() || '';
  if (text.length < 10) {
    alert(isEn() ? 'Tell us a bit more about your wish.' : 'Cuéntanos un poco más sobre tu deseo.');
    return;
  }
  if (!email.includes('@') || !email.includes('.')) {
    alert(isEn() ? 'Please enter a valid email.' : 'Por favor ingresa un correo válido.');
    return;
  }
  showStep('step-payment');
}

/* ----------------------------------------------------------------
   6. PAGO CON WOMPI
---------------------------------------------------------------- */
async function simulatePayment() {
  const amountRaw = parseFloat(document.getElementById('amount')?.value || '0');
  if (!amountRaw || amountRaw < 1) {
    alert(isEn() ? 'Minimum amount is $1 USD.' : 'El monto mínimo es 1 USD.');
    return;
  }

  // Usar caché — si el token caducó, refrescar una sola vez
  let session = _auth.session;
  if (!session?.user?.id) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      session = data?.session ?? null;
      _auth.session = session;
    } catch (_) { session = null; }
  }
  if (!session?.user?.id) {
    alert(isEn()
      ? 'Your session expired. Please log in again.'
      : 'Tu sesión expiró. Por favor inicia sesión de nuevo.');
    _auth.session = null;
    _auth.hasActiveWish = false;
    resetModalState();
    openModal();
    return;
  }

  const amountInCents = Math.round(amountRaw * USD_TO_COP) * 100;
  const userId = session.user.id;
  const reference = `FONTANA-${userId.slice(0, 8)}-${Date.now()}`;

  // Persistir en localStorage (sobrevive si el usuario cierra el widget)
  const pendingData = {
    userId,
    category: document.getElementById('wishCategory')?.value || 'other',
    wishText: document.getElementById('wishText')?.value || '',
    contactEmail: document.getElementById('wishEmail')?.value || '',
    donorAlias: document.getElementById('donorAlias')?.value || null,
    amountUsd: amountRaw,
    amountInCents,
    reference,
    createdAt: Date.now()
  };
  savePendingPayment(pendingData);

  showStep('step-processing');

  try {
    // Obtener firma de integridad desde la Edge Function
    const sigResp = await fetch(EDGE_FIRMA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, amountInCents, currency: 'COP' })
    });

    if (!sigResp.ok) {
      const sigErr = await sigResp.json().catch(() => ({}));
      throw new Error(sigErr.error || `Firma error ${sigResp.status}`);
    }

    const { signature } = await sigResp.json();

    // Volver a visible el paso de pago mientras Wompi abre su modal
    showStep('step-payment');

    const checkout = new WidgetCheckout({
      currency: 'COP',
      amountInCents,
      reference,
      publicKey: WOMPI_PUB_KEY,
      signature: { integrity: signature }
    });

    checkout.open(function (result) {
      // result.transaction puede ser null si el usuario cerró sin pagar
      const status = result?.transaction?.status;
      const txId = result?.transaction?.id;

      if (status === 'APPROVED') {
        showStep('step-processing');
        registrarDeseo(txId, pendingData).catch(e => {
          console.error('[Fontana] Error registrando deseo:', e);
          showStep('step-payment');
          alert(isEn()
            ? 'Payment received but an error occurred saving your wish. ' +
            'Write to fontanadigital.ai@gmail.com with ref: ' + reference
            : 'Pago recibido pero hubo un error guardando tu deseo. ' +
            'Escríbenos a fontanadigital.ai@gmail.com con ref: ' + reference);
        });
      } else if (status && status !== 'DECLINED') {
        // PENDING: el pago está en proceso (ej. PSE), dejar datos y esperar
        showStep('step-payment');
        alert(isEn()
          ? 'Your payment is being processed. We\'ll confirm via email.'
          : 'Tu pago está siendo procesado. Confirmaremos por correo.');
      } else {
        // null (cerró widget sin pagar) o DECLINED
        clearPendingPayment();
        showStep('step-payment');
        if (status === 'DECLINED') {
          alert(isEn()
            ? 'Payment was declined. Please try with another card.'
            : 'El pago fue rechazado. Intenta con otra tarjeta.');
        }
        // Si status es null simplemente no mostramos alerta —
        // el usuario cerró el widget intencionalmente.
      }
    });

  } catch (e) {
    showStep('step-payment');
    console.error('[Fontana] Error iniciando Wompi:', e);
    alert(isEn()
      ? 'Connection error. Please try again: ' + e.message
      : 'Error de conexión. Intenta de nuevo: ' + e.message);
  }
}

/* ----------------------------------------------------------------
   7. REGISTRO EN SUPABASE — guardar-deseo
---------------------------------------------------------------- */
async function registrarDeseo(transactionId, pendingData) {
  // Si pendingData no se pasó directamente, intentar recuperar de localStorage
  const data = pendingData || getPendingPayment();
  if (!data?.userId) {
    throw new Error('No hay datos del deseo pendiente.');
  }

  const resp = await fetch(EDGE_GUARDAR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: data.userId,
      category: data.category,
      wishText: data.wishText,
      contactEmail: data.contactEmail,
      donorAlias: data.donorAlias || null,
      amountUsd: data.amountUsd,
      transactionId: transactionId,
      reference: data.reference
    })
  });

  const result = await resp.json();

  if (!resp.ok) {
    console.error('[Fontana] guardar-deseo error:', result);
    // Si el deseo ya existe (409 conflict) lo tratamos como éxito — ya estaba guardado
    if (resp.status !== 409) {
      throw new Error(result.error || `Server error ${resp.status}`);
    }
  }

  // Limpiar el pago pendiente del localStorage solo cuando éxito
  clearPendingPayment();

  // Mostrar confirmación
  const lang = localStorage.getItem('fontana_lang') || 'es';
  const previewEl = document.getElementById('previewEmailBody');
  if (previewEl) {
    previewEl.textContent =
      PREVIEW_TEMPLATES[lang]?.[data.category] ||
      PREVIEW_TEMPLATES[lang]?.other ||
      '';
  }
  // Ocultar step-processing y mostrar confirmación
  STEPS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('step-confirmed').style.display = 'block';
}

/* ----------------------------------------------------------------
   8. RECUPERACIÓN DE PAGO PENDIENTE
   Si el usuario pagó pero cerró el widget antes de que el callback
   disparara (ej. problema de red), guardamos los datos en localStorage.
   Cuando regresa al sitio y se autentica, le ofrecemos completar.
---------------------------------------------------------------- */
const PENDING_EXPIRY_MS = 60 * 60 * 1000; // 1 hora

function savePendingPayment(data) {
  localStorage.setItem(LS_PENDING_KEY, JSON.stringify(data));
}

function getPendingPayment(userId) {
  try {
    const raw = localStorage.getItem(LS_PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expirar pagos de más de 1 hora
    if (Date.now() - (data.createdAt || 0) > PENDING_EXPIRY_MS) {
      clearPendingPayment();
      return null;
    }
    // Si se pasa userId, validar que sea del mismo usuario
    if (userId && data.userId !== userId) return null;
    return data;
  } catch {
    return null;
  }
}

function clearPendingPayment() {
  localStorage.removeItem(LS_PENDING_KEY);
}

/**
 * Muestra un paso especial de recuperación si hay un pago en vuelo.
 * El usuario puede intentar recuperar o descartar.
 */
function showPendingPaymentRecovery(pendingData) {
  const en = isEn();
  const authStep = document.getElementById('step-auth');
  authStep.innerHTML = `
        <h3>${en ? '⚠️ Pending payment found' : '⚠️ Pago pendiente encontrado'}</h3>
        <p class="sub">${en
      ? `We found a payment attempt for reference <strong>${pendingData.reference}</strong>. Did you complete the payment?`
      : `Encontramos un intento de pago con referencia <strong>${pendingData.reference}</strong>. ¿Completaste el pago?`
    }</p>
        <button class="btn-primary" style="width:100%;margin-bottom:12px;"
          onclick="recoverPendingPayment()">
          ${en ? '✓ Yes, I paid — save my wish' : '✓ Sí, pagué — guardar mi deseo'}
        </button>
        <button class="btn-ghost" style="width:100%;"
          onclick="discardPendingPayment()">
          ${en ? '✕ No, start over' : '✕ No, empezar de nuevo'}
        </button>
      `;
  showStep('step-auth');
}

async function recoverPendingPayment() {
  const pending = getPendingPayment();
  if (!pending) { discardPendingPayment(); return; }
  showStep('step-processing');
  try {
    // Intentamos guardar con el transactionId como referencia
    // (el webhook de Wompi debería ya haber llegado, pero por si acaso)
    await registrarDeseo(pending.reference, pending);
  } catch (e) {
    showStep('step-auth');
    alert(isEn()
      ? 'We could not verify the payment. If you paid, contact fontanadigital.ai@gmail.com with ref: ' + pending.reference
      : 'No pudimos verificar el pago. Si pagaste, escríbenos a fontanadigital.ai@gmail.com con ref: ' + pending.reference);
  }
}

function discardPendingPayment() {
  clearPendingPayment();
  resetModalState();
  // Usar caché: si hay sesión activa, ir directo al formulario
  if (_auth.session) {
    const emailEl = document.getElementById('wishEmail');
    if (emailEl) emailEl.value = _auth.session.user.email || '';
    showStep('step-wish');
  }
}

/* ----------------------------------------------------------------
   9. FORMULARIO DE IDENTIDAD (opcional, paso post-confirmación)
---------------------------------------------------------------- */
function goToIdentityForm() {
  document.getElementById('step-confirmed').style.display = 'none';
  document.getElementById('step-identity').style.display = 'block';
}

function submitIdentityForm() {
  // TODO (producción): enviar datos a Supabase vía Edge Function
  // asociándolos al wish_id del usuario para que la IA los use.
  alert(isEn()
    ? 'Thank you — in the connected version this saves your data so the AI understands you better.'
    : 'Gracias — en la versión conectada esto guarda tus datos para que la IA te conozca mejor.');
  closeModal();
}

/* ----------------------------------------------------------------
   10. RANKING (real — lee de Supabase)
---------------------------------------------------------------- */
async function renderRanking() {
  const list = document.getElementById('rankingList');
  const note = document.querySelector('[data-i18n="ranking.note"]');
  if (!list) return;

  // Mostrar skeleton mientras carga
  list.innerHTML = [1, 2, 3, 4, 5].map(() => `
    <div class="rank-row" style="opacity:.35">
      <div class="rank-pos">—</div>
      <div class="rank-name" style="background:var(--border-soft);height:14px;width:120px;border-radius:4px;"></div>
      <div class="rank-amount" style="background:var(--border-soft);height:14px;width:60px;border-radius:4px;"></div>
    </div>`).join('');

  try {
    const { data, error } = await supabaseClient
      .from('wishes')
      .select('alias, amount_usd')
      .eq('status', 'active')
      .not('alias', 'is', null)
      .order('amount_usd', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = '<p style="color:var(--ivory-faint);font-size:13px;padding:16px 0;">Sé el primero en aparecer aquí.</p>';
      if (note) note.style.display = 'none';
      return;
    }

    list.innerHTML = data.map((d, i) => `
      <div class="rank-row ${i === 0 ? 'first' : ''}">
        <div class="rank-pos">${i === 0 ? '🥇' : '#' + (i + 1)}</div>
        <div class="rank-name">${d.alias}</div>
        <div class="rank-amount">$${d.amount_usd} USD</div>
      </div>`).join('');

    // Ocultar la nota de "datos de ejemplo" — ya hay datos reales
    if (note) note.style.display = 'none';

  } catch (err) {
    console.warn('[Fontana] Ranking no disponible:', err.message);
    list.innerHTML = '<p style="color:var(--ivory-faint);font-size:13px;padding:16px 0;">El ranking se actualizará pronto.</p>';
  }
}

/* ----------------------------------------------------------------
   11. FAQ ACCORDION
---------------------------------------------------------------- */
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('click', () => {
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

/* ----------------------------------------------------------------
   12. INICIALIZACIÓN
---------------------------------------------------------------- */
(function init() {
  // Guardar HTML original del step-auth para poder restaurarlo
  const authStep = document.getElementById('step-auth');
  if (authStep) authStep.dataset.originalHtml = authStep.innerHTML;

  // Aplicar preferencias guardadas (tema e idioma)
  const savedTheme = localStorage.getItem('fontana_theme') || 'light';
  const savedLang = localStorage.getItem('fontana_lang') || 'es';
  setTheme(savedTheme);
  setLang(savedLang);

  // Renderizar ranking real desde Supabase
  renderRanking();
})();