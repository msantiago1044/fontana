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
      document.getElementById('langFlagLabel').textContent = lang === 'es' ? 'ðŸŒ ES' : 'ðŸŒ EN';
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
    }
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.prefs-item')) closeAllMenus();
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
      // re-pinta el aÃ±o (footer.fine reemplaza el innerHTML, hay que reinsertar el span)
      const fineEl = document.querySelector('[data-i18n="footer.fine"]');
      if (fineEl) fineEl.innerHTML = fineEl.innerHTML.replace('{year}', new Date().getFullYear());
      // re-pinta el ranking y las plantillas de correo, que dependen del idioma
      renderRanking(lang);
    }

    const I18N = {
      es: {
        testBadge: "ðŸ§ª Modo de prueba â€” sin pagos ni correos reales",
        theme: { light: "Blanco", blue: "Azul", dark: "Negro" },
        nav: { how: "CÃ³mo funciona", system: "El sistema", contribution: "ContribuciÃ³n", faq: "Preguntas", cta: "Pedir mi deseo" },
        hero: {
          eyebrow: "Fe y trabajo",
          title: "Entrega tu moneda. <br><em>Algo se queda trabajando</em> en tu deseo.",
          lede: "Fontana es el ritual de siempre â€” una moneda, un deseo, una intenciÃ³n â€” acompaÃ±ado de un sistema de inteligencia artificial que no descansa: trabaja tu deseo prompt sobre prompt, 24 horas al dÃ­a, durante 30 dÃ­as, y te mantiene informado de cada avance.",
          ctaPrimary: "Pedir mi deseo desde 1 USD",
          ctaGhost: "Ver cÃ³mo funciona",
          foot: "Un deseo activo por persona Â· Tu correo es solo tuyo Â· Cancela las notificaciones cuando quieras"
        },
        how: {
          kicker: "El ritual", title: "Cuatro pasos, un solo deseo.",
          lead: "No es magia. Es un compromiso: tÃº entregas algo con intenciÃ³n, y a cambio algo trabaja por ti sin pausa.",
          step1: { title: "Te identificas", body: "Inicias sesiÃ³n con tu cuenta de Google. AsÃ­ nos asegura que tu deseo es realmente tuyo, y solo tienes uno." },
          step2: { title: "Entregas tu moneda", body: "Desde 1 dÃ³lar, el gesto simbÃ³lico que activa tu deseo. Pago seguro, una sola vez." },
          step3: { title: "Formulas tu deseo", body: "Escribes lo que quieres lograr, en tus palabras. Sin fÃ³rmulas mÃ¡gicas, solo lo que de verdad sientes." },
          step4: { title: "El sistema se enciende", body: "Recibes tu primer paso en minutos. Luego, un acompaÃ±amiento continuo durante 30 dÃ­as." }
        },
        cycle: {
          kicker: "Lo que pasa despuÃ©s", title: "Una IA que no se detiene hasta que algo se mueve.",
          lead: "Tu deseo entra a un ciclo de trabajo continuo durante las 720 horas de tu mes. La inteligencia artificial vuelve sobre Ã©l una y otra vez â€” prompt sobre prompt â€” refinando un plan de acciÃ³n real, y te escribe en el momento que detecta oportuno para avanzar, hasta que ese plan estÃ¡ completo o tu ciclo termina.",
          n1: { top: "Paso 1", bottom: "Primer correo" },
          n2: { top: "Ciclo IA", bottom: "Indaga y planea" },
          n3: { top: "720 horas", bottom: "Correos en el momento justo" },
          n4: { top: "Cierre del mes", bottom: "Correo final" },
          loopLabel: "â†» El ciclo IA se repite internamente, ajustando el plan segÃºn el avance real de tu deseo"
        },
        honesty: {
          kicker: "Lo que sÃ­, lo que no",
          title: "Te lo decimos claro, como se merece un deseo de verdad.",
          p1: { strong: "Fontana no te promete que tu deseo se va a cumplir.", rest: "Ninguna fuente lo hizo nunca, y nadie puede prometerte eso con honestidad." },
          p2: { strong: "Lo que sÃ­ te prometemos:", rest: "un sistema que indaga en tu deseo todos los dÃ­as durante un mes, que te mantiene informado de cÃ³mo va, y que en algunos casos puede incluso actuar directamente por ti â€” por ejemplo, conectÃ¡ndote con la persona indicada. La fe pone la intenciÃ³n. El trabajo â€”el tuyo, y el de la IA que trabaja contigoâ€” pone el camino." }
        },
        offer: {
          kicker: "La contribuciÃ³n", title: "Desde 1 dÃ³lar. Sin letra pequeÃ±a escondida.",
          amountSuffix: "USD en adelante", amountSub: "ContribuciÃ³n Ãºnica Â· Un deseo por persona",
          li1: "Tu deseo entra al sistema de inteligencia artificial",
          li2: "Correo inmediato con tu primer paso a seguir",
          li3: "Correos de avance durante las 720 horas de tu mes, en el momento que el sistema detecta oportuno",
          li4: "En algunos casos, la IA puede actuar directamente en favor de tu deseo",
          cta: "Pedir mi deseo",
          why: "Â¿Por quÃ© empieza en 1 dÃ³lar? Porque el monto no es el punto â€” el gesto sÃ­. Algunas personas eligen dar mÃ¡s, como ofrenda mÃ¡s grande a su propio compromiso. TÃº decides cuÃ¡nta fe le pones.",
          stripe: "Pago procesado de forma segura por Stripe. No almacenamos los datos de tu tarjeta."
        },
        ranking: {
          title: "La fuente recuerda a quienes mÃ¡s han dado",
          sub: "Un ranking pÃºblico de fe â€” elige tu apodo al contribuir y aparece aquÃ­.",
          note: "ðŸ“ Datos de ejemplo en este modo de prueba. El ranking real se actualiza con cada contribuciÃ³n."
        },
        faq: {
          kicker: "Preguntas frecuentes", title: "Antes de pedir tu deseo",
          q1: "Â¿Por quÃ© solo puedo pedir un deseo?",
          a1: "Porque un deseo concentrado tiene mÃ¡s fuerza que uno disperso. Fontana estÃ¡ diseÃ±ado para que toda tu fe y todo el trabajo del sistema se enfoquen en una sola intenciÃ³n a la vez â€” la tuya.",
          q2: "Â¿QuÃ© tanto puede avanzar mi deseo en 30 dÃ­as?",
          a2: "MÃ¡s de lo que muchas personas logran solas en ese tiempo. Durante las 720 horas de tu mes, el sistema trabaja activamente en tu deseo, te mantiene informado de cÃ³mo va, y en algunos casos puede incluso actuar directamente en tu favor. Lo que avances despuÃ©s, sigue siendo tuyo.",
          q3: "Â¿QuÃ© hace la inteligencia artificial exactamente?",
          a3: "Primero indaga: estudia tu deseo con calma para conocerte a ti y entender todos los aspectos de lo que pides. Luego analiza y genera un plan de acciÃ³n personalizado. A partir de ahÃ­, te escribe en el momento que detecta el avance adecuado â€” y cuando el deseo lo permite, puede actuar directamente para acercarte a Ã©l.",
          q4: "Â¿Es esto un servicio de adivinaciÃ³n o esoterismo?",
          a4: "No. Es un ritual de intenciÃ³n real, combinado con un sistema de IA que trabaja activamente por ti. No leemos el futuro â€” construimos el camino hacia Ã©l, contigo.",
          q5: "Â¿QuÃ© es el ranking de donadores?",
          a5: "Un reconocimiento pÃºblico a quienes mÃ¡s fe (y contribuciÃ³n) han puesto en la Fuente. Eliges un apodo al donar â€” nunca tu nombre real si no quieres â€” y tu posiciÃ³n se actualiza segÃºn el total que hayas contribuido."
        },
        footer: {
          terms: "TÃ©rminos y condiciones", privacy: "Privacidad", refunds: "Reembolsos", contact: "Contacto",
          fine: "Fontana es un servicio de inspiraciÃ³n y acompaÃ±amiento personal apoyado en inteligencia artificial. No constituye asesorÃ­a financiera, mÃ©dica, legal ni psicolÃ³gica, y no garantiza el cumplimiento de ningÃºn deseo o resultado. Debes tener 18 aÃ±os o mÃ¡s para usar este servicio. Â© {year} Fontana."
        },
        cat: { love: "Amor y relaciones", money: "Dinero y trabajo", health: "Salud y bienestar", family: "Familia", growth: "Crecimiento personal", other: "Otro" },
        modal: {
          auth: { title: "IdentifÃ­cate", sub: "Para que tu deseo sea Ãºnico y solo tuyo.", google: "Continuar con Google", note: "Al continuar, aceptas nuestros", terms: "TÃ©rminos", and: "y", privacy: "PolÃ­tica de Privacidad" },
          wish: {
            title: "Tu deseo", sub: "EscrÃ­belo como lo sientes. La IA lo va a leer con cuidado.",
            catLabel: "Â¿Con quÃ© se relaciona tu deseo?", textLabel: "Describe tu deseo", textPlaceholder: "Quiero...",
            emailLabel: "Tu correo (a donde llegarÃ¡ tu acompaÃ±amiento)", emailPlaceholder: "tucorreo@ejemplo.com",
            cta: "Continuar a la contribuciÃ³n â†’"
          },
          payment: {
            title: "Tu contribuciÃ³n", sub: "El gesto que activa tu deseo en el sistema.",
            amountLabel: "Monto (USD, mÃ­nimo 1)",
            aliasLabel: "Elige tu apodo para el ranking de donadores", aliasPlaceholder: "Ej. Viajero777",
            aliasNote: "Este apodo es pÃºblico y aparece en el ranking. No uses tu nombre real si prefieres mantenerlo privado.",
            stripeNote: "SerÃ¡s redirigido a Stripe Checkout para completar el pago de forma segura.",
            testNote: "(Modo de prueba: este botÃ³n simula el pago, no se conecta a Stripe todavÃ­a.)",
            cta: "Ir a pagar â†’"
          },
          processing: { title: "Tu moneda cae en la fuente...", sub: "Procesando tu contribuciÃ³n" },
          confirmed: {
            title: "Tu deseo ya estÃ¡ en marcha ðŸª™", sub: "Esto es lo que recibirÃ¡s en tu correo en los prÃ³ximos minutos:",
            from: "De: La Fuente â€” Fontana", subject: "Asunto: Tu deseo ya estÃ¡ en marcha ðŸª™",
            footer: "La Fuente seguirÃ¡ trabajando en tu deseo durante las prÃ³ximas 720 horas. â€” Fontana",
            testNote: "ðŸ“ Nota de prueba: este texto es un ejemplo de plantilla. El correo real lo redactarÃ¡ la IA (GLM) de forma personalizada segÃºn tu deseo, una vez conectemos las automatizaciones.",
            cta: "Continuar â†’"
          },
          identity: {
            title: "AyÃºdanos a conocerte mejor",
            sub: "Este segundo correo (opcional) nos ayuda a personalizar mejor el trabajo de la IA sobre tu deseo. Puedes omitirlo y tu ciclo de 30 dÃ­as arranca igual.",
            nameLabel: "Â¿CÃ³mo te llamas?", namePlaceholder: "Tu nombre",
            ageLabel: "Â¿CuÃ¡ntos aÃ±os tienes?", agePlaceholder: "Ej. 29",
            contextLabel: "CuÃ©ntanos un poco mÃ¡s de contexto sobre tu deseo", contextPlaceholder: "Lo que creas que ayuda a entender mejor tu situaciÃ³n...",
            cta: "Enviar datos", skip: "Omitir por ahora"
          }
        }
      },
      en: {
        testBadge: "ðŸ§ª Test mode â€” no real payments or emails",
        theme: { light: "White", blue: "Blue", dark: "Black" },
        nav: { how: "How it works", system: "The system", contribution: "Contribution", faq: "FAQ", cta: "Make my wish" },
        hero: {
          eyebrow: "Faith and work",
          title: "Give your coin. <br><em>Something keeps working</em> on your wish.",
          lede: "Fontana is the ritual you already know â€” a coin, a wish, an intention â€” paired with an AI system that never rests: it works on your wish prompt after prompt, 24 hours a day, for 30 days, and keeps you informed of every step forward.",
          ctaPrimary: "Make my wish from $1 USD",
          ctaGhost: "See how it works",
          foot: "One active wish per person Â· Your email stays yours Â· Cancel notifications anytime"
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
          lead: "Your wish enters a continuous work cycle across the 720 hours of your month. The AI returns to it again and again â€” prompt after prompt â€” refining a real action plan, and writes to you whenever it considers it the right moment for you to take action, until that plan is complete or your cycle ends.",
          n1: { top: "Step 1", bottom: "First email" },
          n2: { top: "AI cycle", bottom: "Investigates and plans" },
          n3: { top: "720 hours", bottom: "Emails at the right time" },
          n4: { top: "Month closes", bottom: "Final email" },
          loopLabel: "â†» The AI cycle repeats internally, adjusting the plan based on the real progress of your wish"
        },
        honesty: {
          kicker: "What we promise, what we don't",
          title: "We'll tell you straight, the way a real wish deserves.",
          p1: { strong: "Fontana doesn't promise your wish will come true.", rest: "No fountain ever did, and no one can honestly promise you that." },
          p2: { strong: "What we do promise:", rest: "a system that looks into your wish every day for a month, that keeps you informed of how it's going, and that in some cases can even act directly on your behalf â€” for example, connecting you with the right person. Faith provides the intention. The work â€” yours, and the AI's working alongside you â€” provides the path." }
        },
        offer: {
          kicker: "The contribution", title: "From $1. No hidden fine print.",
          amountSuffix: "USD and up", amountSub: "One-time contribution Â· One wish per person",
          li1: "Your wish enters the AI system",
          li2: "Immediate email with your first step to take",
          li3: "Progress emails across the 720 hours of your month, whenever the system considers it the right moment",
          li4: "In some cases, the AI can act directly in favor of your wish",
          cta: "Make my wish",
          why: "Why start at $1? Because the amount isn't the point â€” the gesture is. Some people choose to give more, as a bigger offering to their own commitment. You decide how much faith you put into it.",
          stripe: "Payment securely processed by Stripe. We don't store your card details."
        },
        ranking: {
          title: "The fountain remembers those who've given the most",
          sub: "A public ranking of faith â€” choose your alias when contributing and you'll appear here.",
          note: "ðŸ“ Example data in this test mode. The real ranking updates with every contribution."
        },
        faq: {
          kicker: "Frequently asked questions", title: "Before you make your wish",
          q1: "Why can I only make one wish?",
          a1: "Because a focused wish carries more strength than a scattered one. Fontana is designed so that all your faith and all the system's work focus on a single intention at a time â€” yours.",
          q2: "How much can my wish move forward in 30 days?",
          a2: "More than many people achieve alone in that time. Across the 720 hours of your month, the system actively works on your wish, keeps you informed of how it's going, and in some cases can even act directly in your favor. Whatever you build after that stays yours.",
          q3: "What exactly does the AI do?",
          a3: "First, it investigates: it studies your wish carefully to understand you and every aspect of what you're asking for. Then it analyzes and builds a personalized action plan. From there, it writes to you whenever it considers the moment right for progress â€” and when the wish allows it, it can act directly to bring you closer to it.",
          q4: "Is this a fortune-telling or esoteric service?",
          a4: "No. It's a real ritual of intention, paired with an AI system that actively works for you. We don't read the future â€” we build the path toward it, together with you.",
          q5: "What is the donor ranking?",
          a5: "A public recognition of those who've put the most faith (and contribution) into the Fountain. You choose an alias when donating â€” never your real name if you'd rather not â€” and your position updates based on your total contribution."
        },
        footer: {
          terms: "Terms and Conditions", privacy: "Privacy", refunds: "Refunds", contact: "Contact",
          fine: "Fontana is an inspiration and personal support service powered by artificial intelligence. It does not constitute financial, medical, legal, or psychological advice, and does not guarantee that any wish or outcome will be fulfilled. You must be 18 or older to use this service. Â© {year} Fontana."
        },
        cat: { love: "Love and relationships", money: "Money and career", health: "Health and wellbeing", family: "Family", growth: "Personal growth", other: "Other" },
        modal: {
          auth: { title: "Verify who you are", sub: "So your wish is unique and truly yours.", google: "Continue with Google", note: "By continuing, you accept our", terms: "Terms", and: "and", privacy: "Privacy Policy" },
          wish: {
            title: "Your wish", sub: "Write it the way you feel it. The AI will read it carefully.",
            catLabel: "What's your wish related to?", textLabel: "Describe your wish", textPlaceholder: "I want...",
            emailLabel: "Your email (where your follow-up will arrive)", emailPlaceholder: "youremail@example.com",
            cta: "Continue to contribution â†’"
          },
          payment: {
            title: "Your contribution", sub: "The gesture that activates your wish in the system.",
            amountLabel: "Amount (USD, minimum 1)",
            aliasLabel: "Choose your alias for the donor ranking", aliasPlaceholder: "E.g. Traveler777",
            aliasNote: "This alias is public and appears in the ranking. Don't use your real name if you'd rather keep it private.",
            stripeNote: "You'll be redirected to Stripe Checkout to complete payment securely.",
            testNote: "(Test mode: this button simulates payment, it isn't connected to Stripe yet.)",
            cta: "Go to payment â†’"
          },
          processing: { title: "Your coin is falling into the fountain...", sub: "Processing your contribution" },
          confirmed: {
            title: "Your wish is already in motion ðŸª™", sub: "Here's what you'll receive in your email in the next few minutes:",
            from: "From: The Fountain â€” Fontana", subject: "Subject: Your wish is already in motion ðŸª™",
            footer: "The Fountain will keep working on your wish over the next 720 hours. â€” Fontana",
            testNote: "ðŸ“ Test note: this text is a template example. The real email will be written by the AI (GLM), personalized to your wish, once we connect the automations.",
            cta: "Continue â†’"
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
