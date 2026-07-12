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

    function openModal() {
      document.getElementById('modalOverlay').classList.add('show');
    }

    function closeModal() {
      document.getElementById('modalOverlay').classList.remove('show');
      setTimeout(resetModalState, 300);
    }

    document.getElementById('modalOverlay').addEventListener('click', e => {
      if (e.target.id === 'modalOverlay') closeModal();
    });

    function resetModalState() {
      // Restaurar HTML original del step-auth (showAlreadyHasWish lo sobreescribe)
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

    function showAlreadyHasWish() {
      const authStep = document.getElementById('step-auth');
      authStep.innerHTML = isEn()
        ? '<h3>You already have an active wish</h3><p class="sub">Check your email to see how it\'s going — only one wish per person.</p>'
        : '<h3>Ya tienes un deseo activo</h3><p class="sub">Revisa tu correo para ver cómo va — solo se permite un deseo por persona.</p>';
    }

    /* ----------------------------------------------------------------
       4. AUTH — LOGIN CON GOOGLE
       Usamos onAuthStateChange para detectar el retorno de Google OAuth
       sin necesidad de que el usuario haga doble clic.
    ---------------------------------------------------------------- */
    async function signInWithGoogle() {
      if (!supabaseClient) {
        alert(isEn()
          ? 'Login service unavailable. Please reload the page.'
          : 'Servicio de login no disponible. Recarga la página.');
        return;
      }
      // Marcamos que el usuario inició el flujo del deseo
      sessionStorage.setItem(SS_FLOW_KEY, '1');

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });

      if (error) {
        console.error('[Fontana] OAuth error:', error);
        alert(isEn()
          ? 'Could not sign you in: ' + error.message
          : 'No pudimos iniciar sesión: ' + error.message);
        sessionStorage.removeItem(SS_FLOW_KEY);
      }
      // Si no hay error el navegador redirige a Google; onAuthStateChange se
      // encarga de retomar el flujo cuando el usuario regrese.
    }

    /**
     * Se llama cuando Supabase detecta que una sesión ya está activa o fue
     * creada (incluyendo el retorno del redirect de Google OAuth).
     * Esto reemplaza la llamada manual a checkSessionOnLoad() y elimina el
     * "doble login" porque se dispara automáticamente en el momento correcto.
     */
    async function handleAuthSession(session) {
      if (!session) return;                             // No hay sesión — nada que hacer

      const wasInFlow = sessionStorage.getItem(SS_FLOW_KEY) === '1';
      if (!wasInFlow) return;                           // El usuario no estaba en el flujo

      sessionStorage.removeItem(SS_FLOW_KEY);

      try {
        const { data: profile, error } = await supabaseClient
          .from('profiles')
          .select('has_active_wish')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error('[Fontana] Error leyendo profile:', error);
        }

        openModal();

        if (profile?.has_active_wish) {
          showAlreadyHasWish();
        } else {
          // Verificar si hay un pago pendiente primero
          const pendingPayment = getPendingPayment(session.user.id);
          if (pendingPayment) {
            showPendingPaymentRecovery(pendingPayment);
          } else {
            // Flujo normal: ir al formulario del deseo
            const emailEl = document.getElementById('wishEmail');
            if (emailEl) emailEl.value = session.user.email || '';
            showStep('step-wish');
          }
        }
      } catch (e) {
        console.error('[Fontana] Error en handleAuthSession:', e);
        openModal();
        showStep('step-wish');
      }
    }

    /* Inicializar el listener de auth estado — se activa inmediatamente
       si ya hay sesión (evita el polling manual y el doble-click) */
    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleAuthSession(session);
      });
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

      // Verificar sesión activa ANTES de iniciar el pago
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.user?.id) {
        alert(isEn()
          ? 'Your session expired. Please log in again.'
          : 'Tu sesión expiró. Por favor inicia sesión de nuevo.');
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
      // Verificar sesión actual y avanzar directamente al formulario del deseo
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          const emailEl = document.getElementById('wishEmail');
          if (emailEl) emailEl.value = session.user.email || '';
          showStep('step-wish');
        }
      });
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
       10. RANKING (demo)
    ---------------------------------------------------------------- */
    const RANKING_DEMO = [
      { name: 'Viajero777', amount: 85 },
      { name: 'LunaDorada', amount: 42 },
      { name: 'RaícesDeFe', amount: 30 },
      { name: 'SegundaOportunidad', amount: 21 },
      { name: 'AnonimoConFe', amount: 14 },
    ];

    function renderRanking() {
      const list = document.getElementById('rankingList');
      if (!list) return;
      list.innerHTML = RANKING_DEMO.map((d, i) => `
        <div class="rank-row ${i === 0 ? 'first' : ''}">
          <div class="rank-pos">${i === 0 ? '🥇' : '#' + (i + 1)}</div>
          <div class="rank-name">${d.name}</div>
          <div class="rank-amount">$${d.amount} USD</div>
        </div>
      `).join('');
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

      // Renderizar ranking demo
      renderRanking();
    })();
