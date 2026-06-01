// ===== CALOPSITE - script.js =====


// ===== INICIALIZAÇÃO =====

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    syncCartFromStorage();
    renderFeatured();

    // Busca do header (filtra no listing pelo texto digitado)
    const searchBtn = document.querySelector('.btn-buscar');
    const searchInput = document.querySelector('#main-header input[type="text"], #main-header input:not([type])');
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const txt = (searchInput.value || '').trim();
            if (!txt) return;

            const detected = detectCategoryFromSearch(txt);
            const cat = state.currentCategory || 'aves';
            const sub = detected?.sub || state.currentSubcategory || subsForCatDefault(cat);

            navigateTo('listing', cat, sub);
            renderListing(cat, sub);


            // filtragem por texto (nome do produto)
            state._listingSearch = txt;
            applyListingTextFilter(txt);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            searchBtn.click();
        });
    }
});

// ===== STATE =====
const state = {
    cart: [],
    currentPage: 'home',
    currentCategory: null,
    currentSubcategory: null,
    carouselIndex: 0,
    carouselTimer: null,
    loggedUser: null,
};

// ===== AUTH HELPERS =====
function getUsers() {
    try { return JSON.parse(localStorage.getItem('calopsite_users') || '[]'); }
    catch { return []; }
}

function saveUsers(users) {
    localStorage.setItem('calopsite_users', JSON.stringify(users));
}

function getLoggedUser() {
    try { return JSON.parse(localStorage.getItem('calopsite_logged') || 'null'); }
    catch { return null; }
}

function setLoggedUser(user) {
    state.loggedUser = user;
    if (user) localStorage.setItem('calopsite_logged', JSON.stringify(user));
    else localStorage.removeItem('calopsite_logged');
    updateAuthButton();
}

function updateAuthButton() {
    const btn = document.querySelector('.btn-entrar');
    if (!btn) return;
    const user = state.loggedUser;
    if (user) {
        btn.textContent = 'Olá, ' + user.name.split(' ')[0];
        btn.onclick = showUserMenu;
    } else {
        btn.textContent = 'Entrar/Cadastrar';
        btn.onclick = () => navigateTo('login');
    }
}

// ===== CEP HELPERS =====
function normalizeCep(cep) {
    if (!cep) return '';
    return String(cep).replace(/\D/g, '').slice(0, 8);
}

function lookupCepViaCep(cep) {
    const clean = normalizeCep(cep);
    if (clean.length !== 8) return Promise.reject(new Error('CEP inválido.'));

    return new Promise((resolve, reject) => {
        const callbackName = '_viaCepCb_' + Date.now();
        const script = document.createElement('script');

        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
            if (data && data.erro) return reject(new Error('CEP não encontrado.'));
            resolve(data);
        };

        script.onerror = function() {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('Falha ao consultar CEP.'));
        };

        script.src = `https://viacep.com.br/ws/${clean}/json/?callback=${callbackName}`;
        document.body.appendChild(script);
    });
}

function applyCepToProfileStorage(cepData) {
    const profile = getProfileFromStorage() || {};
    saveProfileToStorage({
        ...profile,
        cep:    cepData?.cep        ? String(cepData.cep).trim()        : profile.cep    || '',
        rua:    cepData?.logradouro ? String(cepData.logradouro).trim() : profile.rua    || '',
        bairro: cepData?.bairro     ? String(cepData.bairro).trim()     : profile.bairro || '',
        cidade: cepData?.localidade ? String(cepData.localidade).trim() : profile.cidade || '',
        estado: cepData?.uf         ? String(cepData.uf).trim()         : profile.estado || '',
    });
}

// ===== CEP - CARRINHO =====
async function handleCepBuscarFromCart() {
    const cartPage = document.getElementById('page-cart');
    if (!cartPage) return;

    const cepInput = cartPage.querySelector('.cep-row input');
    if (!cepInput) return;

    const cepClean = normalizeCep(cepInput.value);
    if (cepClean.length !== 8) {
        showToast('Digite um CEP válido (8 dígitos).');
        return;
    }

    try {
        showToast('Buscando CEP...', true);

        const data = await lookupCepViaCep(cepClean);
        applyCepToProfileStorage(data);

        const cepFormatted = cepClean.replace(/^(\d{5})(\d{3})$/, '$1-$2');
        cepInput.value = cepFormatted;

        const oldBox = cartPage.querySelector('.cep-address-fields');
        if (oldBox) oldBox.remove();

        const box = document.createElement('div');
        box.className = 'cep-address-fields';
        box.style.cssText = 'margin-top:10px;padding:12px;background:var(--beige);border:1.5px solid var(--border);border-radius:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;';

        const profile = getProfileFromStorage() || {};

        box.innerHTML = `
          <div style="font-size:12px;color:var(--text-mid);font-weight:800">Rua</div>
          <input type="text" readonly style="grid-column:1/-1;" value="${data.logradouro ? String(data.logradouro).trim() : ''}" />

          <div style="font-size:12px;color:var(--text-mid);font-weight:800">Número</div>
          <input type="text" placeholder="Número" style="grid-column:1/-1;" value="${profile.numero || ''}" />

          <div style="font-size:12px;color:var(--text-mid);font-weight:800">Complemento</div>
          <input type="text" placeholder="Complemento" style="grid-column:1/-1;" value="${profile.complemento || ''}" />

          <div style="font-size:12px;color:var(--text-mid);font-weight:800">Bairro</div>
          <input type="text" readonly style="grid-column:1/-1;" value="${data.bairro ? String(data.bairro).trim() : ''}" />

          <div style="font-size:12px;color:var(--text-mid);font-weight:800">Cidade</div>
          <input type="text" readonly style="grid-column:1/-1;" value="${data.localidade ? String(data.localidade).trim() : ''}" />

          <div style="font-size:12px;color:var(--text-mid);font-weight:800">UF</div>
          <input type="text" readonly style="grid-column:1/-1;" value="${data.uf ? String(data.uf).trim() : ''}" />
        `;

        box.querySelectorAll('input').forEach(i => {
            i.style.cssText = 'padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);font-size:13px;background:var(--white);color:var(--text-dark);';
        });

        cepInput.closest('.cart-extra-box').appendChild(box);
        showToast('Endereço encontrado! ✅', true);

    } catch (e) {
        console.error(e);
        showToast(e?.message || 'Não foi possível buscar o CEP.', false);
    }
}

// ===== CEP - PERFIL =====
window.buscarCepPerfil = async function() {
    const cepInput = document.getElementById('profile-cep');
    if (!cepInput) return;

    const cepClean = normalizeCep(cepInput.value);
    if (cepClean.length !== 8) {
        showToast('Digite um CEP válido (8 dígitos).');
        return;
    }

    try {
        showToast('Buscando CEP...', true);
        const data = await lookupCepViaCep(cepClean);

        const cepFormatted = cepClean.replace(/^(\d{5})(\d{3})$/, '$1-$2');
        cepInput.value = cepFormatted;

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        set('profile-rua',    data.logradouro);
        set('profile-bairro', data.bairro);
        set('profile-cidade', data.localidade);
        set('profile-estado', data.uf);

        const profile = getProfileFromStorage() || {};
        saveProfileToStorage({
            ...profile,
            cep:    cepFormatted,
            rua:    data.logradouro || '',
            bairro: data.bairro     || '',
            cidade: data.localidade || '',
            estado: data.uf         || '',
        });

        showToast('Endereço encontrado! ✅', true);
    } catch (e) {
        console.error(e);
        showToast(e?.message || 'Não foi possível buscar o CEP.', false);
    }
};

// ===== USER MENU =====
function showUserMenu() {
    const existing = document.getElementById('user-menu-popup');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'user-menu-popup';
    menu.style.cssText = 'position:fixed;top:80px;right:64px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);z-index:9999;min-width:160px;overflow:hidden;border:1px solid #E8D8C0;';
    menu.innerHTML = '<div class="user-menu-item" onclick="navigateTo(\'profile\');document.getElementById(\'user-menu-popup\').remove()">Minha Conta</div><div class="user-menu-item logout" onclick="doLogout()">Sair</div>';
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', function h(e) {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', h); }
    }), 50);
}

function doLogout() {
    setLoggedUser(null);
    const m = document.getElementById('user-menu-popup');
    if (m) m.remove();
    showToast('Você saiu da conta.');
    navigateTo('home');
}

// ===== TOAST =====
function showToast(msg, isSuccess) {
    const t = document.createElement('div');
    t.className = 'toast-notification' + (isSuccess ? ' toast-success' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast-show'), 10);
    setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 2800);
}

// ===== SVG ICONS for products =====
const productIcons = {
    racao_cachorro: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect x="20" y="8" width="40" height="52" rx="8" stroke="#2C2C2C" stroke-width="3"/><circle cx="40" cy="28" r="10" stroke="#2C2C2C" stroke-width="3"/><path d="M30 50h20M28 58h24" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/><path d="M14 36h8M58 36h8" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/></svg>`,
    racao_gato: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect x="22" y="10" width="36" height="50" rx="8" stroke="#2C2C2C" stroke-width="3"/><circle cx="40" cy="30" r="9" stroke="#2C2C2C" stroke-width="3"/><path d="M22 10 L14 2M58 10 L66 2" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/><path d="M32 50h16" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/></svg>`,
    petiscos: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><ellipse cx="40" cy="40" rx="18" ry="12" stroke="#2C2C2C" stroke-width="3"/><circle cx="22" cy="26" r="6" stroke="#2C2C2C" stroke-width="3"/><circle cx="58" cy="26" r="6" stroke="#2C2C2C" stroke-width="3"/><circle cx="22" cy="54" r="6" stroke="#2C2C2C" stroke-width="3"/><circle cx="58" cy="54" r="6" stroke="#2C2C2C" stroke-width="3"/></svg>`,
    brinquedo_bola: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><circle cx="30" cy="50" r="18" stroke="#2C2C2C" stroke-width="3"/><circle cx="54" cy="26" r="14" stroke="#2C2C2C" stroke-width="3"/><path d="M16 44 Q24 36 36 40" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    brinquedo_corda: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><circle cx="60" cy="24" r="12" stroke="#2C2C2C" stroke-width="3"/><path d="M48 24 C38 24 28 34 28 44 C28 54 38 58 30 66" stroke="#2C2C2C" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="24" cy="70" rx="8" ry="5" stroke="#2C2C2C" stroke-width="3"/></svg>`,
    brinquedo_varinha: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><line x1="16" y1="64" x2="52" y2="20" stroke="#2C2C2C" stroke-width="3.5" stroke-linecap="round"/><path d="M52 20 L58 8 M58 8 L62 18 M58 8 L68 12 M58 8 L56 20" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="52" cy="28" rx="6" ry="4" transform="rotate(-30 52 28)" stroke="#2C2C2C" stroke-width="2"/></svg>`,
    brinquedo_kit: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><circle cx="32" cy="44" r="18" stroke="#2C2C2C" stroke-width="3"/><circle cx="56" cy="28" r="12" stroke="#2C2C2C" stroke-width="3"/><path d="M20 42 Q28 34 38 40" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/><path d="M48 26 Q52 22 60 26" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    brinquedo_mordedor: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect x="18" y="32" width="44" height="20" rx="10" stroke="#2C2C2C" stroke-width="3"/><path d="M28 32 L28 20 M40 32 L40 16 M52 32 L52 20" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/><path d="M28 52 L28 64 M52 52 L52 64" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/></svg>`,
    brinquedo_pelucia: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><circle cx="40" cy="46" r="22" stroke="#2C2C2C" stroke-width="3"/><circle cx="28" cy="28" r="10" stroke="#2C2C2C" stroke-width="3"/><circle cx="52" cy="28" r="10" stroke="#2C2C2C" stroke-width="3"/><circle cx="33" cy="44" r="3" fill="#2C2C2C"/><circle cx="47" cy="44" r="3" fill="#2C2C2C"/><path d="M33 54 Q40 60 47 54" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    brinquedo_kong: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><ellipse cx="40" cy="52" rx="22" ry="16" stroke="#2C2C2C" stroke-width="3"/><path d="M18 52 C18 30 30 16 40 14 C50 16 62 30 62 52" stroke="#2C2C2C" stroke-width="3"/><circle cx="40" cy="14" r="6" stroke="#2C2C2C" stroke-width="2.5"/></svg>`,
    brinquedo_puxador: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><path d="M16 40 C16 28 24 20 32 20 C40 20 48 28 48 40 C48 52 56 60 64 60" stroke="#2C2C2C" stroke-width="4" stroke-linecap="round"/><circle cx="64" cy="60" r="8" stroke="#2C2C2C" stroke-width="3"/><circle cx="16" cy="40" r="8" stroke="#2C2C2C" stroke-width="3"/></svg>`,
    coleira: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><ellipse cx="40" cy="40" rx="28" ry="18" stroke="#2C2C2C" stroke-width="3"/><circle cx="40" cy="58" r="6" stroke="#2C2C2C" stroke-width="2.5"/><rect x="36" y="30" width="8" height="6" rx="2" stroke="#2C2C2C" stroke-width="2.5"/></svg>`,
    guia: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><circle cx="32" cy="40" r="18" stroke="#2C2C2C" stroke-width="3"/><path d="M32 22 L32 8 M32 8 L50 8 Q58 8 58 20 L58 36" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="54" y="32" width="10" height="14" rx="3" stroke="#2C2C2C" stroke-width="2.5"/></svg>`,
    shampoo: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect x="24" y="24" width="32" height="44" rx="8" stroke="#2C2C2C" stroke-width="3"/><path d="M34 24 L34 14 L46 14 L46 24" stroke="#2C2C2C" stroke-width="3"/><path d="M46 10 L52 4" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/><path d="M32 40 Q40 36 48 40 Q40 44 32 40Z" fill="#2C2C2C"/></svg>`,
    lencinho: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect x="14" y="20" width="52" height="40" rx="8" stroke="#2C2C2C" stroke-width="3"/><path d="M14 34 Q30 28 46 34 Q62 40 66 34" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/><path d="M14 48 Q30 42 46 48 Q62 54 66 48" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    cama: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><ellipse cx="40" cy="50" rx="30" ry="18" stroke="#2C2C2C" stroke-width="3"/><ellipse cx="40" cy="42" rx="22" ry="12" stroke="#2C2C2C" stroke-width="2.5"/><path d="M14 50 L14 62 M66 50 L66 62" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/></svg>`,
    cobertor: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect x="12" y="20" width="56" height="42" rx="6" stroke="#2C2C2C" stroke-width="3"/><path d="M20 30 Q30 24 40 30 Q50 36 60 30" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/><path d="M20 42 Q30 36 40 42 Q50 48 60 42" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/><path d="M20 54 Q30 48 40 54 Q50 60 60 54" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    arranhador: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect x="34" y="18" width="12" height="44" rx="6" stroke="#2C2C2C" stroke-width="3"/><ellipse cx="40" cy="14" rx="16" ry="8" stroke="#2C2C2C" stroke-width="3"/><ellipse cx="40" cy="66" rx="16" ry="8" stroke="#2C2C2C" stroke-width="3"/><circle cx="40" cy="14" r="4" stroke="#2C2C2C" stroke-width="2"/></svg>`,
    sementes: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><path d="M20 60 C20 38 36 16 40 10 C44 16 60 38 60 60 Z" stroke="#2C2C2C" stroke-width="3" stroke-linejoin="round"/><path d="M40 10 L40 60" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/><path d="M40 28 C34 28 28 32 26 38" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    balanco: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="72"><path d="M20 16 L60 16" stroke="#2C2C2C" stroke-width="3" stroke-linecap="round"/><path d="M28 16 L28 44 M52 16 L52 44" stroke="#2C2C2C" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="40" cy="48" rx="14" ry="6" stroke="#2C2C2C" stroke-width="3"/><circle cx="60" cy="36" r="10" stroke="#2C2C2C" stroke-width="3"/><path d="M56 34 L60 30 L64 34 M60 30 L60 42" stroke="#2C2C2C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function getProductIcon(p) {
    if (p.sub === 'racao' && p.cat === 'cachorro') return productIcons.racao_cachorro;
    if (p.sub === 'racao' && p.cat === 'gato') return productIcons.racao_gato;
    if (p.sub === 'racao' && p.cat === 'aves') return productIcons.sementes;
    if (p.sub === 'petiscos') return productIcons.petiscos;
    if (p.sub === 'coleiras') {
        if (p.id === 19) return productIcons.coleira;
        return productIcons.guia;
    }
    if (p.sub === 'limpeza') {
        if (p.id === 21) return productIcons.shampoo;
        return productIcons.lencinho;
    }
    if (p.sub === 'camas') {
        if (p.id === 23) return productIcons.cama;
        return productIcons.cobertor;
    }
    if (p.sub === 'brinquedos') {
        const bmap = {
            11: productIcons.brinquedo_bola,
            12: productIcons.brinquedo_corda,
            13: productIcons.brinquedo_kit,
            14: productIcons.brinquedo_puxador,
            15: productIcons.brinquedo_mordedor,
            16: productIcons.brinquedo_pelucia,
            17: productIcons.brinquedo_kong,
            18: productIcons.brinquedo_puxador,
            27: productIcons.brinquedo_varinha,
            28: productIcons.arranhador,
            31: productIcons.balanco,
        };
        return bmap[p.id] || productIcons.brinquedo_bola;
    }
    return productIcons.racao_cachorro;
}

// ===== PRODUCTS DATA =====
const products = {
    aves: {
        racao: [
            { id: 29, name: 'Mistura de Sementes para Calopsita 500g', price: 19.90, cat: 'aves', sub: 'racao' },
            { id: 30, name: 'Ração Extrusada para Papagaios 1kg', price: 42.00, cat: 'aves', sub: 'racao' },
            { id: 31, name: 'Mistura Calopsita 500g', price: 19.90, cat: 'aves', sub: 'racao' },
            { id: 32, name: 'Ração Papagaios 1kg', price: 19.00, cat: 'aves', sub: 'racao' },
            { id: 33, name: 'Supra Impulso', price: 39.90, cat: 'aves', sub: 'racao' },
            { id: 34, name: 'Ração Extrusada para Papagaios 1kg', price: 42.00, cat: 'aves', sub: 'racao' },
            { id: 35, name: 'Mistura Calopsita 500g', price: 19.90, cat: 'aves', sub: 'racao' },
            { id: 36, name: 'Ração Papagaios 1kg', price: 19.00, cat: 'aves', sub: 'racao' },
        ],
        brinquedos: [
            { id: 370, name: 'Brinquedo Balanço com Espelho para Aves', price: 15.90, cat: 'aves', sub: 'brinquedos' },
            { id: 371, name: 'Brinquedo Teto para Aves (Genérico 1)', price: 32.90, cat: 'aves', sub: 'brinquedos' },
            { id: 372, name: 'Brinquedo Teto para Aves (Genérico 2)', price: 35.90, cat: 'aves', sub: 'brinquedos' },
            { id: 373, name: 'Brinquedo Parede para Aves (Genérico 1)', price: 31.90, cat: 'aves', sub: 'brinquedos' },
            { id: 374, name: 'Brinquedo Parede para Aves (Genérico 2)', price: 38.90, cat: 'aves', sub: 'brinquedos' },
        ],
        casa: [
            { id: 1044, name: 'Gaiola para Calopsita Premium', price: 89.90, cat: 'aves', sub: 'casa' },
            { id: 1045, name: 'Gaiola para Papagaio Grande', price: 149.90, cat: 'aves', sub: 'casa' },
            { id: 1046, name: 'Poleiro de Madeira para Aves', price: 45.90, cat: 'aves', sub: 'casa' },
            { id: 1047, name: 'Ninho para Aves Pequenas', price: 35.90, cat: 'aves', sub: 'casa' },
            { id: 1048, name: 'Casinha de Repouso para Aves', price: 55.90, cat: 'aves', sub: 'casa' },
        ],
    },
};


const subcategoryLabels = {
    racao: 'Ração e Sementes',
    brinquedos: 'Brinquedos e Diversão',
    casa: 'Habitat e Acessórios',
    kits: 'Kits Promocionais',
    aprenda: 'Conteúdo Educativo',
};

const speciesList = ['Calopsita', 'Periquito', 'Papagaio', 'Agapornis', 'Canário', 'Ring Neck', 'Cacatua', 'Arara'];
const agesList = ['Filhote', 'Adulto', 'Sênior'];

const filtersBySubcat = {
    racao: { 
        Espécie: speciesList,
        Idade: agesList,
        Tipo: ['Sementes', 'Ração Extrusada', 'Mistura Premium'] 
    },
    brinquedos: { 
        Espécie: speciesList,
        Tipo: ['Balanço', 'Teto', 'Parede', 'Poleiro', 'Mordedores', 'Forrageamento'] 
    },
    casa: { 
        Espécie: speciesList,
        Tipo: ['Gaiola', 'Viveiro', 'Poleiro', 'Comedouro', 'Bebedouro'] 
    },
    kits: {
        Espécie: speciesList,
        Tipo: ['Kit Habitat', 'Kit Diversão', 'Kit Alimentação']
    }
};

// ===== DOM HELPERS =====
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

// ===== NAVIGATION =====
function navigateTo(page, category, subcategory) {
    state.currentPage = page;
    state.currentCategory = category || null;
    state.currentSubcategory = subcategory || null;

    $$('.page').forEach(p => p.classList.remove('active'));
    const target = $(`#page-${page}`);
    if (target) target.classList.add('active');

    const mainHeader = $('#main-header');
    const mainNav = $('#main-nav');
    const checkoutHeader = $('#checkout-header');
    const mainBanner = $('#main-banner');
    const checkoutBanner = $('#checkout-banner');

    if (page === 'home' || page === 'listing' || page === 'contact') {
        mainHeader && (mainHeader.style.display = '');
        mainNav && (mainNav.style.display = '');
        checkoutHeader && (checkoutHeader.style.display = 'none');
        mainBanner && (mainBanner.style.display = '');
        checkoutBanner && (checkoutBanner.style.display = 'none');
    } else {
        mainHeader && (mainHeader.style.display = 'none');
        mainNav && (mainNav.style.display = 'none');
        checkoutHeader && (checkoutHeader.style.display = '');
        mainBanner && (mainBanner.style.display = 'none');
        if (page === 'login' || page === 'register') {
            checkoutBanner && (checkoutBanner.style.display = 'none');
        } else {
            checkoutBanner && (checkoutBanner.style.display = '');
        }
    }

    if (page === 'listing') {
        if (subcategory === 'aprenda') renderAprendaPage();
        else renderListing(category, subcategory);
    }
    if (page === 'cart') renderCartPage();
    if (page === 'checkout') renderCheckoutPage();
    if (page === 'profile') renderProfilePage();

    window.scrollTo(0, 0);
}

// ===== CAROUSEL =====
function initCarousel() {
    const slides = $$('.carousel-slide');
    const dots = $$('.carousel-dots .dot');
    const total = slides.length;

    function goTo(i) {
        state.carouselIndex = (i + total) % total;
        const track = $('.carousel-slides');
        if (track) track.style.transform = `translateX(-${state.carouselIndex * 100}%)`;
        dots.forEach((d, di) => d.classList.toggle('active', di === state.carouselIndex));
    }

    $('.carousel-btn.prev')?.addEventListener('click', () => { goTo(state.carouselIndex - 1); resetTimer(); });
    $('.carousel-btn.next')?.addEventListener('click', () => { goTo(state.carouselIndex + 1); resetTimer(); });
    dots.forEach((d, i) => d.addEventListener('click', () => { goTo(i); resetTimer(); }));

    function resetTimer() {
        clearInterval(state.carouselTimer);
        state.carouselTimer = setInterval(() => goTo(state.carouselIndex + 1), 4000);
    }

    goTo(0);
    resetTimer();
}

// ===== APRENDA PAGE =====
function renderAprendaPage() {
    const page = $('#page-listing');
    if (!page) return;

    const articles = [
        { title: 'Cuidados Básicos com Calopsitas', category: 'Cuidados', icon: '🐦' },
        { title: 'Enriquecimento Ambiental para Aves', category: 'Comportamento', icon: '🎪' },
        { title: 'Alimentação Balanceada: O Guia Completo', category: 'Saúde', icon: '🥗' },
        { title: 'Como Escolher a Gaiola Ideal', category: 'Habitat', icon: '🏠' },
        { title: 'Preservação e Conscientização Ambiental', category: 'Natureza', icon: '🌍' }
    ];

    page.innerHTML = `
    <div class="aprenda-page">
      <div class="aprenda-header">
        <h2>Aprenda: Conteúdo Educativo</h2>
        <p>Dicas sobre cuidados, comportamento e preservação para suas aves.</p>
      </div>
      <div class="aprenda-grid">
        ${articles.map(art => `
          <div class="aprenda-card">
            <div class="aprenda-icon">${art.icon}</div>
            <div class="aprenda-info">
              <span class="aprenda-cat">${art.category}</span>
              <h3>${art.title}</h3>
              <a class="aprenda-link">Ler artigo completa <span>›</span></a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    `;
}

// ===== LISTING =====
function getProductsForCategorySubcat(cat, sub) {
    if (!cat) return [];
    const catData = products[cat];
    if (!catData) return [];
    if (sub && catData[sub]) return catData[sub];
    return Object.values(catData).flat();
}

function normalizeSearchTxt(txt) {
    // remove accents + lowercase
    try {
        return String(txt)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    } catch {
        return String(txt).toLowerCase();
    }
}

function subsForCatDefault(cat) {
    // default subcategory if only cat was detected
    return (cat && products[cat] && Object.keys(products[cat])[0]) ? Object.keys(products[cat])[0] : 'brinquedos';
}

function detectCategoryFromSearch(rawTxt) {
    const txt = normalizeSearchTxt(rawTxt);

    // cat
    const cats = {
        aves: ['aves', 'calopsita', 'papagaio', 'passaro', 'pássaro'],
    };

    let cat = null;
    for (const [k, words] of Object.entries(cats)) {
        if (words.some(w => txt.includes(normalizeSearchTxt(w)))) {
            cat = k;
            break;
        }
    }

    // sub
    const subs = {
        racao: ['racao', 'racao', 'racoa', 'sementes', 'raçao', 'mistura'],
        brinquedos: ['brinquedo', 'brinquedos', 'teto', 'parede', 'balanco', 'poleiro'],
        casa: ['casa', 'gaiola', 'ninho', 'casinha'],
    };

    let sub = null;
    for (const [k, words] of Object.entries(subs)) {
        if (words.some(w => txt.includes(normalizeSearchTxt(w)))) {
            sub = k;
            break;
        }
    }

    return { cat, sub };
}

function applyListingTextFilter(txt) {
    // mantem estado._listingSearch (renderListing já aplica o filtro)
}



function renderListing(cat, sub) {
    const page = $('#page-listing');
    if (!page) return;

    const catData = products[cat] || {};
    const subs = Object.keys(catData);
    const currentSub = sub || subs[0];

    const rawProds = getProductsForCategorySubcat(cat, currentSub);
    const filters = filtersBySubcat[currentSub] || {};
    const subLabel = subcategoryLabels[currentSub] || currentSub;

    const listingTxt = (state._listingSearch || '').trim();
    const prods = listingTxt
        ? rawProds.filter(p => (p?.name || '').toLowerCase().includes(normalizeSearchTxt(listingTxt)))
        : rawProds;


    const sidebarCatHTML = subs.map(s =>
        `<li class="${s === currentSub ? 'active' : ''}" onclick="navigateTo('listing','${cat}','${s}')">${subcategoryLabels[s] || s}</li>`
    ).join('');

    let filterHTML = '';
    for (const [groupName, options] of Object.entries(filters)) {
        filterHTML += `<div class="filter-section">
      <h4>${groupName}</h4>
      ${options.map(o => `<label><input type="checkbox"> ${o}</label>`).join('')}
    </div>`;
    }

    const productHTML = prods.map(p => {
        const inCart = state.cart.find(i => i.id === p.id);
        const inCartClass = inCart ? 'in-cart' : '';
        const btnLabel = inCart
            ? `<span class="cart-btn-label">✓ No Carrinho</span>`
            : `<span class="cart-btn-label">+ Adicionar</span>`;
        return `
    <div class="product-card ${inCartClass}" onclick="addToCart(${p.id}, this); rerenderListingCards()">
      <div class="prod-icon">${(p?.cat === 'aves' && typeof getAvesMediaForProduct === 'function' && getAvesMediaForProduct(p)?.image)
        ? `<img loading="lazy" alt="${p.name}" src="${getAvesMediaForProduct(p).image}" onerror="this.remove()"/>`
        : (getProductPrimaryImageUrl(p) ? `<img loading="lazy" alt="${p.name}" src="${getProductPrimaryImageUrl(p)}" onerror="this.remove()"/>` : getProductIcon(p))}</div>
      <h4>${p.name}</h4>
      <div class="price">R$ ${p.price.toFixed(2).replace('.', ',')}</div>
      <div class="card-add-btn">${btnLabel}</div>
    </div>
  `}).join('');

    page.innerHTML = `
    <div class="listing-layout">
      <aside class="sidebar">
        <h3>Categorias</h3>
        <ul class="sidebar-cats">${sidebarCatHTML}</ul>
        ${filterHTML}
      </aside>
      <div class="product-area">
        <div class="product-header">
          <h2>${subLabel}</h2>
          <div class="sort-wrap">
            Ordenar por:
            <select>
              <option>Maior relevância</option>
              <option>Menor preço</option>
              <option>Maior preço</option>
              <option>Mais vendidos</option>
            </select>
          </div>
        </div>
        <div class="all-items">Todos os itens</div>
        <div class="product-grid">${productHTML}</div>
      </div>
    </div>
  `;
}

function rerenderListingCards() {
    const cards = document.querySelectorAll('#page-listing .product-card');
    cards.forEach(card => {
        const onclick = card.getAttribute('onclick') || '';
        const match = onclick.match(/addToCart\((\d+)/);
        if (!match) return;
        const pid = parseInt(match[1]);
        const inCart = state.cart.find(i => i.id === pid);
        const btnEl = card.querySelector('.cart-btn-label');
        if (inCart) {
            card.classList.add('in-cart');
            if (btnEl) btnEl.textContent = '✓ No Carrinho';
        } else {
            card.classList.remove('in-cart');
            if (btnEl) btnEl.textContent = '+ Adicionar';
        }
    });
}

// ===== CART =====
function findProduct(id) {
    for (const cat of Object.values(products)) {
        for (const subs of Object.values(cat)) {
            const found = subs.find(p => p.id === id);
            if (found) return found;
        }
    }
    return null;
}

function addToCart(productId, cardEl) {
    const product = findProduct(productId);
    if (!product) return;

    const inCart = state.cart.find(i => i.id === productId);

    if (cardEl) {
        if (cardEl.classList.contains('in-cart')) {
            cardEl.classList.remove('in-cart');
            state.cart = state.cart.filter(i => i.id !== productId);
            updateCartBadge();
            renderCartSidebar();
            persistCartToStorage();
            showToast('Produto removido do carrinho.', false);
            return;
        }
        cardEl.classList.add('in-cart');
    }

    // Garante que o card que disparou o clique continue alternando corretamente
    if (state.currentPage === 'listing') rerenderListingCards();

    if (inCart) {
        inCart.qty++;
    } else {
        state.cart.push({ ...product, qty: 1 });
    }
    updateCartBadge();
    showToast('Produto adicionado ao carrinho! 🛒', true);
    persistCartToStorage();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(i => i.id !== productId);
    updateCartBadge();
    renderCartSidebar();
    if (state.currentPage === 'cart') renderCartPage();
}

function updateQty(productId, delta) {
    const item = state.cart.find(i => i.id === productId);
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    renderCartSidebar();
    if (state.currentPage === 'cart') renderCartPage();
}

function updateCartBadge() {
    const total = state.cart.reduce((s, i) => s + i.qty, 0);
    const badge = $('#cart-badge');
    if (badge) {
        badge.textContent = total;
        badge.style.display = total > 0 ? 'flex' : 'none';
    }
}

function getCartTotal() {
    return state.cart.reduce((s, i) => s + i.price * i.qty, 0);
}

// ===== CART SIDEBAR =====
function showCartPanel() {
    const overlay = $('#cart-overlay');
    if (overlay) overlay.classList.add('open');
    renderCartSidebar();
}

function hideCartPanel() {
    const overlay = $('#cart-overlay');
    if (overlay) overlay.classList.remove('open');
}

function renderCartSidebar() {
    const panel = $('#cart-panel');
    if (!panel) return;

    if (state.cart.length === 0) {
        panel.innerHTML = `
      <h2>Carrinho de Compras</h2>
      <p style="color:var(--text-mid);text-align:center;padding:48px 0;font-size:15px;font-weight:600">Seu carrinho está vazio.</p>
      <button class="btn-continue" onclick="hideCartPanel()">Continuar Comprando</button>
    `;
        return;
    }

    const itemsHTML = state.cart.map(item => `
    <div class="cart-item">
      <div class="item-img">${getProductIcon(item)}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-price">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
        <div class="qty-label">Quantidade</div>
        <div class="qty-controls">
          <button onclick="updateQty(${item.id},-1)">−</button>
          <span>${item.qty}</span>
          <button onclick="updateQty(${item.id},1)">+</button>
        </div>
      </div>
      <button class="remove-btn" onclick="removeFromCart(${item.id})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2"/>
        </svg>
      </button>
    </div>
  `).join('');

    const total = getCartTotal();

    panel.innerHTML = `
    <h2>Carrinho de Compras</h2>
    <div class="cart-items">${itemsHTML}</div>
    <div class="cart-footer">
      <div class="subtotal">
        <span>Subtotal</span>
        <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
      </div>
      <button class="btn-checkout" onclick="goToCart()">Ir para o Check-out</button>
      <button class="btn-continue" onclick="hideCartPanel()">Continuar Comprando</button>
    </div>
  `;
}

// ===== CART PAGE =====
function renderCartPage() {
    const page = $('#page-cart');
    if (!page) return;

    if (state.cart.length === 0) {
        page.innerHTML = `
      <div class="cart-page">
        <h2>Meu Carrinho</h2>
        <p style="color:var(--text-mid);text-align:center;padding:60px 0;font-size:16px;font-weight:600">Seu carrinho está vazio.</p>
        <div style="text-align:center">
          <button class="btn-fazer-pedido" style="width:auto;padding:14px 40px" onclick="navigateTo('home')">Escolher Produtos</button>
        </div>
      </div>
    `;
        return;
    }

    const deleteSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2"/></svg>`;

    const itemsHTML = state.cart.map(item => `
    <div class="cart-page-item">
      <div class="cart-page-item-top">
        <div class="item-img">${getProductIcon(item)}</div>
        <div class="item-name">${item.name}</div>
        <div class="qty-controls">
          <button onclick="updateQty(${item.id},-1);renderCartPage()">−</button>
          <span>${item.qty}</span>
          <button onclick="updateQty(${item.id},1);renderCartPage()">+</button>
        </div>
        <div class="item-price">R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</div>
        <button class="delete-btn" onclick="removeFromCart(${item.id})">${deleteSVG}</button>
      </div>
      <div class="frequency-row">
        <label class="toggle"><input type="checkbox" ${item.frequency ? 'checked' : ''} onchange="toggleFrequency(${item.id})"><span class="toggle-slider"></span></label>
        <span class="frequency-label">Comprar com Frequência</span>
        ${item.frequency ? `<select class="frequency-select"><option>Selecionar Frequência</option><option>Semanal</option><option>Quinzenal</option><option>Mensal</option></select>` : ''}
      </div>
    </div>
  `).join('');

    const total = getCartTotal();

    page.innerHTML = `
    <div class="cart-page">
      <h2>Meu Carrinho</h2>
      <div class="cart-page-layout">
        <div class="cart-items-col">
          ${itemsHTML}
          <div class="cart-extras">
            <div class="cart-extra-box">
              <h4>Prazo de Entrega</h4>
              <div class="cep-row">
                <input type="text" placeholder="Insira o CEP" />
                <button class="btn-cep" onclick="handleCepBuscarFromCart()">BUSCAR</button>
              </div>
              <a class="cep-link">Não sei meu CEP</a>
            </div>
            <div class="cart-extra-box">
              <h4>Cupom de Desconto</h4>
              <div class="coupon-row">
                <input type="text" placeholder="Insira seu Cupom">
                <button class="btn-coupon">APLICAR</button>
              </div>
            </div>
          </div>
        </div>
        <div class="summary-box">
          <h3>Resumo do Pedido</h3>
          <div class="summary-row">
            <span>Valor dos Produtos (${state.cart.reduce((s, i) => s + i.qty, 0)} itens)</span>
            <span style="color:var(--orange);font-weight:800">R$ ${total.toFixed(2).replace('.', ',')}</span>
          </div>
          <div class="summary-row">
            <span>Descontos</span>
            <span>R$ 0,00</span>
          </div>
          <div class="summary-row total">
            <span>Total</span>
            <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
          </div>
          <button class="btn-fazer-pedido" onclick="goToCheckout()">Fazer Pedido</button>
          <button class="btn-mais-produtos" onclick="navigateTo('home')">Escolher mais Produtos</button>
        </div>
      </div>
    </div>
  `;
}

function toggleFrequency(id) {
    const item = state.cart.find(i => i.id === id);
    if (item) item.frequency = !item.frequency;
    renderCartPage();
}

// ===== CHECKOUT =====
function renderCheckoutPage() {
    const page = $('#page-checkout');
    if (!page) return;

    const total = getCartTotal();
    const itemCount = state.cart.reduce((s, i) => s + i.qty, 0);

    page.innerHTML = `
    <div class="checkout-page-body">
      <div class="checkout-col">
        <div class="checkout-card">
          <div class="checkout-card-header">
            <span class="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" stroke="currentColor" stroke-width="2"/>
                <circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="2"/>
              </svg>
            </span>
            Endereço
          </div>
          <div class="address-grid">
            <input type="text" placeholder="CEP*">
            <input type="text" placeholder="Estado*">
            <input type="text" placeholder="Cidade*">
            <input type="text" placeholder="Bairro*">
            <input type="text" placeholder="Logradouro (Rua)*">
            <input type="text" placeholder="Número*">
            <input type="text" placeholder="Complemento">
            <input type="text" placeholder="Ponto de Referência">
            <input type="text" placeholder="Destinatário*">
          </div>
          <div class="address-row-check">
            <input type="checkbox" id="main-address">
            <label for="main-address">Esse é meu endereço principal</label>
          </div>
          <div class="checkout-buttons">
            <button class="btn-cancel" onclick="navigateTo('cart')">Cancelar</button>
            <button class="btn-continuar">Continuar</button>
          </div>
        </div>

        <div class="checkout-card">
          <div class="checkout-card-header">
            <span class="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </span>
            Pagamento
          </div>
          <div class="payment-tabs">
            <button class="payment-tab" onclick="setPayTab(this,'pix')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Pix
            </button>
            <button class="payment-tab active" onclick="setPayTab(this,'card')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="1" y="4" width="22" height="16" rx="3" stroke="currentColor" stroke-width="2"/><line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" stroke-width="2"/></svg>
              Cartão de Crédito
            </button>
          </div>
          <div class="payment-fields" id="payment-fields">
            <input type="text" placeholder="Número do Cartão*">
            <input type="text" placeholder="Nome Impresso no Cartão*">
            <input type="text" placeholder="Vencimento*">
            <input type="text" placeholder="CVV*">
          </div>
          <div class="checkout-buttons" style="justify-content:flex-start;margin-top:12px">
            <button class="btn-cancel">Cancelar</button>
          </div>
        </div>
      </div>

      <div class="checkout-summary">
        <div class="summary-box">
          <h3>Resumo do Pedido</h3>
          <div class="summary-row">
            <span>Valor dos Produtos (${itemCount} itens)</span>
            <span style="color:var(--orange);font-weight:800">R$ ${total.toFixed(2).replace('.', ',')}</span>
          </div>
          <div class="summary-row">
            <span>Descontos</span>
            <span>R$ 0,00</span>
          </div>
          <div class="summary-row total">
            <span>Total</span>
            <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
          </div>
          <button class="btn-finalizar" onclick="handleFinalizePayment()">Finalizar Pedido</button>
        </div>
      </div>
    </div>
  `;
}

function setPayTab(btn, type) {
    $$('.payment-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const fields = $('#payment-fields');
    if (!fields) return;
    if (type === 'card') {
        fields.innerHTML = `
      <input type="text" placeholder="Número do Cartão*">
      <input type="text" placeholder="Nome Impresso no Cartão*">
      <input type="text" placeholder="Vencimento*">
      <input type="text" placeholder="CVV*">
    `;
    } else if (type === 'pix') {
        const total = getCartTotal();
        const payload = window.__pixPayloadExample || null;

        fields.innerHTML = `
          <div class="pix-box">
            <p style="grid-column:1/-1;color:var(--text-mid);font-size:14px;padding:10px 0 6px;font-weight:600">
              Pagamento via Pix (exemplo). Após confirmar o pedido, o QR será gerado.
            </p>
            <div class="pix-qr-holder" id="pix-qr-holder" style="grid-column:1/-1;margin:10px 0 8px;">
              <div style="color:var(--text-mid);font-size:13px;font-weight:700">QR será exibido aqui</div>
            </div>
            <div class="pix-amount-row" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:8px 0;grid-column:1/-1;">
              <span>Valor</span>
              <strong style="color:var(--orange);font-weight:900;">R$ ${total.toFixed(2).replace('.', ',')}</strong>
            </div>
            <div class="pix-copy" style="grid-column:1/-1;">
              <label style="display:block;font-weight:800;margin-bottom:6px;">Copia e cola</label>
              <textarea id="pix-copy-ta" readonly rows="3" style="width:100%;resize:none;">${payload || 'Clique em "Finalizar Pedido" para gerar o Pix.'}</textarea>
              <button type="button" class="btn-pix-copy" style="margin-top:8px" onclick="window.__pixCopyFromTextarea(this)">Copiar</button>
            </div>
            <div class="pix-expire" style="grid-column:1/-1;color:var(--text-mid);font-size:13px;font-weight:700;margin-top:8px;">
              Expira em 10 minutos (exemplo)
            </div>
          </div>
        `;

        if (typeof window.__pixPayloadExample === 'string') {
            const ta = document.getElementById('pix-copy-ta');
            if (ta) ta.value = window.__pixPayloadExample;
        }
    } else if (type === 'boleto') {
        fields.innerHTML = `<p style="grid-column:1/-1;color:var(--text-mid);font-size:14px;padding:16px 0;font-weight:600">O boleto será gerado após a confirmação do pedido. Prazo de compensação: até 3 dias úteis.</p>`;
    }
}

// ===== INIT =====
function initApp() {
    const savedUser = getLoggedUser();
    if (savedUser) {
        state.loggedUser = savedUser;
        updateAuthButton();
    }

    initCarousel();
    updateCartBadge();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideCartPanel();
    });

    const cartOverlay = $('#cart-overlay');
    if (cartOverlay) {
        cartOverlay.addEventListener('click', (e) => {
            if (!$('#cart-panel').contains(e.target)) hideCartPanel();
        });
    }

    $('#cart-panel')?.addEventListener('click', (e) => e.stopPropagation());

    document.querySelectorAll('.eye-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.closest('.input-pw-wrap');
            if (!wrap) return;
            const inp = wrap.querySelector('input');
            if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
        });
    });
}

// ===== LOGIN =====
function handleLogin() {
    const emailEl = document.querySelector('#page-login input[type="email"]');
    const pwEl = document.querySelector('#page-login input[type="password"]');
    if (!emailEl || !pwEl) return;
    const email = emailEl.value.trim();
    const pw = pwEl.value;
    if (!email || !pw) { showToast('Preencha email e senha.'); return; }
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === pw);
    if (!user) { showToast('Email ou senha incorretos.'); return; }
    setLoggedUser(user);
    showToast('Bem-vindo(a), ' + user.name.split(' ')[0] + '! 🐾', true);
    if (state._pendingCart) {
        state._pendingCart = false;
        navigateTo('cart');
    } else {
        navigateTo('home');
    }
}

// ===== CADASTRO =====
function handleRegister() {
    const name = $('#reg-name')?.value.trim();
    const email = $('#reg-email')?.value.trim();
    const phone = $('#reg-phone')?.value.trim();
    const telFixo = $('#reg-tel-fixo')?.value.trim();
    const cpf = $('#reg-cpf')?.value.trim();
    const pw = $('#reg-pw')?.value;
    const pw2 = $('#reg-pw2')?.value;
    const agreed = $('#reg-agree');

    if (!name || !email || !cpf || !pw || !phone) { showToast('Preencha todos os campos obrigatórios.'); return; }
    if (pw.length < 8) { showToast('Senha deve ter no mínimo 8 caracteres.'); return; }
    if (pw !== pw2) { showToast('As senhas não coincidem.'); return; }
    if (agreed && !agreed.checked) { showToast('Aceite os Termos e Condições.'); return; }

    const users = getUsers();
    if (users.find(u => u.email === email)) { showToast('Esse email já está cadastrado.'); return; }
    const newUser = { name, email, password: pw, cpf, phone };
    users.push(newUser);
    saveUsers(users);
    setLoggedUser(newUser);
    showToast('Cadastro realizado! Bem-vindo(a) 🎉', true);
    if (state._pendingCart) {
        state._pendingCart = false;
        navigateTo('cart');
    } else {
        navigateTo('home');
    }
}

// ===== EYE TOGGLE =====

const wrap = btn.closest('.input-pw-wrap');
const input = wrap
    ? wrap.querySelector('input[type="password"], input[type="text"]')
    : btn.previousElementSibling;

// ===== CART AUTH GUARD =====
function goToCart() {
    hideCartPanel();
    if (!state.loggedUser) {
        state._pendingCart = true;
        showLoginRequired();
        return;
    }
    navigateTo('cart');
}

function goToCheckout() {
    if (!state.loggedUser) {
        state._pendingCart = true;
        showLoginRequired();
        return;
    }
    navigateTo('checkout');
}

function showLoginRequired() {
    const existing = document.getElementById('login-required-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'login-required-modal';
    modal.innerHTML = `
    <div class="lrm-backdrop" onclick="closeLoginRequired()"></div>
    <div class="lrm-box">
      <div class="lrm-logo">🐾</div>
      <h3>Entre na sua conta</h3>
      <p>Para acessar o carrinho, faça login ou cadastre-se.</p>
      <button class="btn-auth lrm-btn" onclick="closeLoginRequired(); navigateTo('login')">Entrar</button>
      <button class="btn-auth lrm-btn lrm-outline" onclick="closeLoginRequired(); navigateTo('register')">Criar Conta</button>
      <div class="lrm-cancel" onclick="closeLoginRequired()">Cancelar</div>
    </div>
  `;
    document.body.appendChild(modal);
}

function closeLoginRequired() {
    const m = document.getElementById('login-required-modal');
    if (m) m.remove();
    state._pendingCart = false;
}

// ===== REVIEWS CAROUSEL =====
let _reviewsIndex = 0;
function shiftReviews(dir) {
    const row = document.getElementById('review-track');
    if (!row) return;
    const cards = Array.from(row.querySelectorAll('.review-card'));
    if (cards.length === 0) return;
    _reviewsIndex = (_reviewsIndex + dir + cards.length) % cards.length;
    const frag = document.createDocumentFragment();
    const order = cards.slice(_reviewsIndex).concat(cards.slice(0, _reviewsIndex));
    order.forEach(c => frag.appendChild(c));
    row.innerHTML = '';
    row.appendChild(frag);
}

// ===== STORAGE =====
function syncCartFromStorage() {
    try {
        const raw = localStorage.getItem('calopsite_cart');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) state.cart = parsed;
    } catch {}
    updateCartBadge();
    if (state.currentPage === 'cart') renderCartPage();
    if ($('#cart-panel')) renderCartSidebar();
}

function persistCartToStorage() {
    try {
        localStorage.setItem('calopsite_cart', JSON.stringify(state.cart));
    } catch {}
}

// ===== FEATURED =====
function renderFeatured() {
    const grid = document.getElementById("featured-grid");
    if (!grid) return;

    const featured = [
        // Mix de produtos em destaque com fotos reais
        products.aves.racao[0],
        products.aves.brinquedos[0],
        products.aves.casa[0],
        products.aves.racao[1],
        products.aves.brinquedos[1],
        products.aves.casa[1],
        products.aves.racao[2],
        products.aves.brinquedos[2],
    ];



    grid.innerHTML = featured.map(p => {
        const inCart = state.cart.find(i => i.id === p.id);
        const inCartClass = inCart ? 'in-cart' : '';
        const btnLabel = inCart ? '✓ No Carrinho' : '+ Adicionar';
        return `
        <div class="product-card ${inCartClass}" onclick="addToCart(${p.id}, this); rerenderFeaturedCards()">
          <div class="prod-media">
            <img class="prod-img" loading="lazy" alt="${p.name}" src="${getProductImageUrl(p)}" />
          </div>
          <h4 class="prod-title">${p.name}</h4>
          <div class="price">R$ ${p.price.toFixed(2).replace(".", ",")}</div>
          <div class="card-add-btn"><span class="cart-btn-label">${btnLabel}</span></div>
        </div>
    `}).join("");
}

function rerenderFeaturedCards() {
    // Recalcula os botões/estilos dos cards do bloco "Produtos em Destaque".
    const grid = document.getElementById('featured-grid');
    if (!grid) return;

    const cards = grid.querySelectorAll('.product-card');
    cards.forEach(card => {
        const onclick = card.getAttribute('onclick') || '';
        const match = onclick.match(/addToCart\((\d+)/);
        if (!match) return;

        const pid = parseInt(match[1]);
        const inCart = state.cart.find(i => i.id === pid);
        const btnEl = card.querySelector('.cart-btn-label');

        if (inCart) {
            card.classList.add('in-cart');
            if (btnEl) btnEl.textContent = '✓ No Carrinho';
        } else {
            card.classList.remove('in-cart');
            if (btnEl) btnEl.textContent = '+ Adicionar';
        }
    });
}


function getProductImageUrl(p) {
    // Tenta pegar a imagem local mapeada em AVES_MEDIA
    if (typeof getAvesMediaForProduct === 'function') {
        const media = getAvesMediaForProduct(p);
        if (media && media.image) return media.image;
    }
    
    // Fallback para picsum se não houver imagem local
    const seed = (p?.cat || 'pet') + '-' + (p?.sub || 'item') + '-' + (p?.id || '0');
    return `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/600`;
}

function getProductImage() {
    return getProductImageUrl(arguments[0] || {});
}

// ===== PIX =====
function handleFinalizePayment() {
    const payBtn = document.querySelector('.payment-tab.active');
    const type = payBtn ? (payBtn.getAttribute('onclick') || '').includes("'pix'") ? 'pix' : 'card' : 'pix';

    if (type === 'pix') {
        return window.__onFinalizePix();
    }

    const fields = document.getElementById('payment-fields');
    const inputs = fields ? fields.querySelectorAll('input') : [];
    const cardNumber = inputs[0]?.value;
    const cardHolder = inputs[1]?.value;
    const expiry = inputs[2]?.value;
    const cvv = inputs[3]?.value;

    const res = (typeof window.validateCreditCard === 'function')
        ? window.validateCreditCard({ cardNumber, cardHolder, expiry, cvv })
        : { ok: true, errors: [] };

    if (!res.ok) {
        showToast(res.errors[0] || 'Dados do cartão inválidos.', false);
        return false;
    }

    showToast('Pagamento no cartão aprovado! ✅ (exemplo)', true);
    const btn = document.querySelector('.btn-finalizar');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Pagamento confirmado ✅';
    }

    return true;
}

// ===== PROFILE =====
function getProfileFromStorage() {
    try {
        return JSON.parse(localStorage.getItem('calopsite_profile') || 'null');
    } catch {
        return null;
    }
}

function saveProfileToStorage(profile) {
    try {
        localStorage.setItem('calopsite_profile', JSON.stringify(profile));
    } catch {}
}

function renderProfilePage() {
    const page = $('#page-profile');
    if (!page) return;

    const injectAndPopulate = () => {
        const profile = getProfileFromStorage() || {
            avatarDataUrl: '',
            name: state.loggedUser?.name || '',
            cpf: state.loggedUser?.cpf || '',
            cep: '', rua: '', numero: '', complemento: '',
            bairro: '', cidade: '', appliedCoupons: [],
        };

        if (!profile.cpf && state.loggedUser?.cpf) {
            profile.cpf = state.loggedUser.cpf;
        }

        const img           = document.getElementById('profile-avatar-img');
        const initials      = document.getElementById('profile-avatar-initials');
        const nameInput     = document.getElementById('profile-name');
        const cpfInput      = document.getElementById('profile-cpf');
        const cepInput      = document.getElementById('profile-cep');
        const ruaInput      = document.getElementById('profile-rua');
        const numeroInput   = document.getElementById('profile-numero');
        const compInput     = document.getElementById('profile-complemento');
        const bairroInput   = document.getElementById('profile-bairro');
        const cidadeInput   = document.getElementById('profile-cidade');
        const avatarImg     = document.getElementById('avatarImg');
        const avatarInitials= document.getElementById('avatarInitials');
        const displayName   = document.getElementById('displayName');

        if (displayName) displayName.textContent = profile.name || 'Sem nome';

        if (avatarImg) {
            avatarImg.src = profile.avatarDataUrl || '';
            avatarImg.style.display = profile.avatarDataUrl ? '' : 'none';
        }

        const getInitials = (name) => {
            const parts = (name || '').trim().split(/\s+/).filter(Boolean);
            const i1 = parts[0]?.[0] || 'C';
            const i2 = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : (parts[0]?.[1] || '');
            return (i1 + i2).toUpperCase();
        };

        if (avatarInitials) avatarInitials.textContent = getInitials(profile.name);
        if (img) {
            img.src = profile.avatarDataUrl || '';
            img.style.display = profile.avatarDataUrl ? '' : 'none';
        }
        if (initials) initials.textContent = getInitials(profile.name);

        if (nameInput)   nameInput.value   = profile.name   || '';
        if (cpfInput)    cpfInput.value    = profile.cpf    || '';
        if (cepInput)    cepInput.value    = profile.cep    || '';
        if (ruaInput)    ruaInput.value    = profile.rua    || '';
        if (numeroInput) numeroInput.value = profile.numero || '';
        if (compInput)   compInput.value   = profile.complemento || '';
        if (bairroInput) bairroInput.value = profile.bairro || '';
        if (cidadeInput) cidadeInput.value = profile.cidade || '';

        const couponsList = document.getElementById('profile-coupons-list');
        if (couponsList) {
            const coupons = getCouponsForProfile(profile);
            couponsList.innerHTML = coupons.map(c => `
                <div class="coupon-item">
                    <div class="coupon-left">
                        <div class="coupon-code">${c.code}</div>
                        <div class="coupon-desc">${c.desc}</div>
                    </div>
                    <button type="button" class="btn-profile-coupon" onclick="applyCouponFromProfile('${c.code}')">
                        ${c.alreadyApplied ? 'Aplicado' : 'Aplicar'}
                    </button>
                </div>
            `).join('');
        }

        if (typeof myAccountSyncFromProfileStorage === 'function') {
            try { myAccountSyncFromProfileStorage(); } catch {}
        }
    };

    if (page.dataset.__profileRendered) {
        injectAndPopulate();
        return;
    }

    page.dataset.__profileRendered = '1';
    page.innerHTML = '<div style="padding:24px 0;color:#6B5A4A;font-weight:700">Carregando configurações da conta...</div>';

    fetch('./components/profile-page.html')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(html => {
            if (!html || !html.trim()) throw new Error('HTML vazio');
            page.innerHTML = html;
            injectAndPopulate();
        })
        .catch((e) => {
            console.error('Erro ao renderizar profile-page.html:', e);
            page.innerHTML = '<div style="padding:24px 0;color:#A32D2D;font-weight:800">Erro ao carregar Minha Conta. Veja o Console.</div>';
        });
}

function getCouponsForProfile(profile) {
    const already = Array.isArray(profile.appliedCoupons) ? profile.appliedCoupons : [];
    return [
        { code: 'BEMVINDO10',  desc: '10% OFF na primeira compra',                discountPercent: 10, alreadyApplied: already.includes('BEMVINDO10') },
        { code: 'FRETEGRATIS', desc: 'Frete grátis acima de R$ 99 (exemplo)',     discountPercent: 0,  alreadyApplied: already.includes('FRETEGRATIS') },
        { code: 'PETLOVER15',  desc: '15% OFF em ração e petiscos (exemplo)',     discountPercent: 15, alreadyApplied: already.includes('PETLOVER15') },
    ];
}

function handleRemoveAvatar() {
    if (!state.loggedUser) { showLoginRequired(); return; }
    const profile = getProfileFromStorage() || {};
    saveProfileToStorage({ ...profile, avatarDataUrl: '' });
    showToast('Foto removida! ✅', true);
    renderProfilePage();
}

function handleSaveProfile() {
    if (!state.loggedUser) { showLoginRequired(); return; }

    const read = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const fileInput = document.getElementById('profile-avatar-input');
    const file = fileInput?.files?.[0] || null;
    const base = getProfileFromStorage() || {};

    const update = {
        ...base,
        name:         read('profile-name') || state.loggedUser.name || '',
        cpf:          read('profile-cpf'),
        cep:          read('profile-cep'),
        rua:          read('profile-rua'),
        numero:       read('profile-numero'),
        complemento:  read('profile-complemento'),
        bairro:       read('profile-bairro'),
        cidade:       read('profile-cidade'),
        appliedCoupons: Array.isArray(base.appliedCoupons) ? base.appliedCoupons : [],
    };

    const finalize = (avatarDataUrl) => {
        if (avatarDataUrl) update.avatarDataUrl = avatarDataUrl;
        saveProfileToStorage(update);
        showToast('Perfil atualizado! ✅', true);
        renderProfilePage();
    };

    if (!file) { finalize(update.avatarDataUrl || ''); return; }

    const reader = new FileReader();
    reader.onload = () => finalize(reader.result);
    reader.onerror = () => { showToast('Não foi possível ler a imagem.', false); finalize(update.avatarDataUrl || ''); };
    reader.readAsDataURL(file);
}

window.applyCouponFromProfile = function(code) {
    if (!state.loggedUser) { showLoginRequired(); return; }
    const profile = getProfileFromStorage() || {};
    const list = Array.isArray(profile.appliedCoupons) ? profile.appliedCoupons : [];
    if (!list.includes(code)) list.push(code);
    saveProfileToStorage({ ...profile, name: profile.name || state.loggedUser.name || '', appliedCoupons: list });
    try { localStorage.setItem('calopsite_active_coupon', code); } catch {}
    showToast(`Cupom ${code} aplicado! 🏷️`, true);
    renderProfilePage();
};

window.__onFinalizePix = async function() {
    try {
        const holder = document.getElementById('pix-qr-holder');
        const total = getCartTotal();
        if (typeof window.renderPixQR === 'function' && holder) {
            await window.renderPixQR({ container: holder, amount: total });
        }
        showToast('Pagamento confirmado! ✅', true);
        const btn = document.querySelector('.btn-finalizar');
        if (btn) { btn.disabled = true; btn.textContent = 'Pagamento confirmado ✅'; }
    } catch (e) {
        console.error(e);
        showToast('Não foi possível finalizar o Pix. (exemplo)', false);
    }
};

