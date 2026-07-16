const CONFIG = {
    webhook: 'https://hook.us2.make.com/aok1ucg2l66vkz13qg8rkc2e3atgx3nh?produto=HB-WN',
    redirect: 'https://sndflw.com/i/wca'
};

function isConfiguredUrl(url) {
    return Boolean(url && !/SEU_|placeholder|example\.com/i.test(url));
}

const popup = document.getElementById('popup-captura');
const form = document.getElementById('form-aula-valorize');
const popupFormBody = document.getElementById('popup-form-body');
const popupFormSuccess = document.getElementById('popup-form-success');

function abrirPopup() {
    resetarPopup();
    popup.classList.remove('hidden');
    popup.classList.add('flex');
    popup.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function fecharPopup() {
    popup.classList.add('hidden');
    popup.classList.remove('flex');
    popup.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function mostrarSucessoPopup() {
    popupFormBody.classList.add('hidden');
    popupFormSuccess.classList.remove('hidden');
}

function resetarPopup() {
    popupFormBody.classList.remove('hidden');
    popupFormSuccess.classList.add('hidden');
    const btnSubmit = form.querySelector('.btn-submit');
    if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Garantir minha vaga';
    }
}

popup.addEventListener('click', (e) => { if (e.target === popup) fecharPopup(); });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popup.classList.contains('flex')) fecharPopup();
});

function preencherCamposTracking() {
    const params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_term', 'utm_campaign', 'utm_medium', 'utm_content'].forEach((key) => {
        const el = document.getElementById(key);
        if (el) el.value = params.get(key) || '';
    });
    const urlEl = document.getElementById('url');
    if (urlEl) urlEl.value = window.location.href;
}

preencherCamposTracking();

function buildRedirectUrl(base, data) {
    const url = new URL(base, window.location.origin);
    Object.entries(data).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
    });
    return url.toString();
}

const telInput = form.querySelector('.mask-telefone');
telInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.startsWith('55') && value.length > 2) value = value.slice(2);
    value = value.slice(0, 11);
    let formatado = value;
    if (value.length > 2) formatado = `(${value.slice(0, 2)}) ` + value.slice(2);
    if (value.length > 7) formatado = formatado.slice(0, 10) + '-' + formatado.slice(10);
    e.target.value = formatado;
    form.querySelector('.error-msg').classList.add('hidden');
});

const submitBtn = form.querySelector('.btn-submit');
submitBtn.addEventListener('click', async function(e) {
    if (!form.reportValidity()) return;
    const btnSubmit = form.querySelector('.btn-submit');
    const errorMsg = form.querySelector('.error-msg');
    const telefoneFormatado = telInput.value.trim();
    const rawPhone = telefoneFormatado.replace(/\D/g, '');

    if (rawPhone.length < 10) {
        errorMsg.classList.remove('hidden');
        telInput.focus();
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Processando...';

    const nome = form.querySelector('[name="nome"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const telefone = '+55' + rawPhone;

    const payload = {
        nome: nome,
        email: email,
        telefone: telefone,
        utm_source: document.getElementById('utm_source')?.value || '',
        utm_term: document.getElementById('utm_term')?.value || '',
        utm_campaign: document.getElementById('utm_campaign')?.value || '',
        utm_medium: document.getElementById('utm_medium')?.value || '',
        utm_content: document.getElementById('utm_content')?.value || '',
        url: document.getElementById('url')?.value || window.location.href
    };

    const redirectData = { ...payload };
    const webhookAtivo = isConfiguredUrl(CONFIG.webhook);
    const redirectAtivo = isConfiguredUrl(CONFIG.redirect);

    try {
        if (webhookAtivo) {
            await fetch(CONFIG.webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            });
        }
    } catch (err) {
        console.error('Erro no envio do Webhook. Prosseguindo com fallback.', err);
    }

    if (typeof fbq !== 'undefined') fbq('track', 'Lead');

    if (redirectAtivo) {
        window.location.href = buildRedirectUrl(CONFIG.redirect, redirectData);
        return;
    }

    mostrarSucessoPopup();
});

if (window.matchMedia('(min-width: 1024px)').matches) {
    document.body.classList.add('custom-cursor');
    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    let mx = 0, my = 0, rx = 0, ry = 0;

    document.addEventListener('mousemove', (e) => {
        mx = e.clientX; my = e.clientY;
        dot.style.left = mx + 'px';
        dot.style.top = my + 'px';
    });

    function animateRing() {
        rx += (mx - rx) * 0.15;
        ry += (my - ry) * 0.15;
        ring.style.left = rx + 'px';
        ring.style.top = ry + 'px';
        requestAnimationFrame(animateRing);
    }
    animateRing();

    document.querySelectorAll('a, button, input, [onclick]').forEach((el) => {
        el.addEventListener('mouseenter', () => ring.classList.add('is-hover'));
        el.addEventListener('mouseleave', () => ring.classList.remove('is-hover'));
    });
}

if (typeof AOS !== 'undefined') {
    AOS.init({ once: true, offset: 50, duration: 800 });
}
