// ===== КОНФІГУРАЦІЯ =====
// ПІСЛЯ ДЕПЛОЮ APPS SCRIPT — встав сюди URL Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbwjbVuTxZZkm0EWxjrPhmBeqmzewEb5Cfr5jKebJevqXHjlc4t8rDIsY1fCuh4-Fvo5/exec';

// ===== STATE =====
const state = {
  email: null,
  pin: null,
  judgeName: null,
  isAdmin: false,
  adminPassword: null,
  artworks: [],
  adminData: null,
  filters: { search: '', myLikedOnly: false },
  // навігація по папках: null = верхній рівень (вікові категорії)
  nav: { category: null, technique: null }
};

// мітки для робіт без заповненого поля
const NO_CATEGORY = 'Без категорії';
const NO_TECHNIQUE = 'Інше';
function artCategory(a) { return (a.category && a.category.trim()) || NO_CATEGORY; }

// ---- НОРМАЛІЗАЦІЯ ТЕХНІК ----
// Сирі значення з форми дуже різні (регістр, пунктуація, розміри, матеріали).
// Зводимо їх до канонічного набору технік за ключовими словами.
// Порядок правил важливий: перше співпадіння виграє.
const TECHNIQUE_RULES = [
  { name: 'Ткацтво (гобелен)',     match: /гобелен|ткацтв/i },
  { name: 'Валяння',               match: /валянн/i },
  { name: 'Кераміка',              match: /керамік|ліпк/i },
  { name: 'Малярство на склі',     match: /скл/i },
  { name: 'Петриківський розпис',  match: /петриків/i },
  { name: 'Косівський розпис',     match: /косівськ/i },
  { name: 'Колаж',                 match: /колаж/i },
  { name: 'Бісер / метал',         match: /бісер|метал/i },
  { name: 'Змішана техніка',       match: /змішан/i },
  { name: 'Графіка',               match: /графік|олівец|олівц|ручк|гелев|маркер/i },
  { name: 'Живопис',               match: /живопис|гуаш|акварел|акрил|темпер|папір/i },
];

function normalizeTechnique(raw) {
  const s = String(raw || '').trim();
  if (!s) return NO_TECHNIQUE;
  for (const rule of TECHNIQUE_RULES) {
    if (rule.match.test(s)) return rule.name;
  }
  // якщо нічого не підійшло — хоча б приводимо регістр/пробіли до спільного вигляду
  const clean = s.replace(/\s+/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function artTechnique(a) { return normalizeTechnique(a.technique); }

// ===== API HELPERS =====
async function callApi(action, params = {}) {
  // GET з query params — щоб уникнути CORS preflight для POST
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  try {
    const resp = await fetch(url.toString(), { method: 'GET' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } catch (err) {
    return { ok: false, error: 'Помилка з\'єднання: ' + err.message };
  }
}

// ===== DRIVE IMAGES =====
function driveImgUrl(fileId, width = 800) {
  if (!fileId) return null;
  // lh3.googleusercontent.com — стабільніший за uc?id для embed
  return `https://lh3.googleusercontent.com/d/${fileId}=w${width}`;
}

// нормалізований кут + inline-стиль для повороту зображення
function normRot(rot) { return ((parseInt(rot, 10) || 0) % 360 + 360) % 360; }
function rotStyle(rot) {
  const r = normRot(rot);
  return r ? ` style="transform: rotate(${r}deg)"` : '';
}

// ===== VIEWS =====
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(name + 'View').classList.remove('hidden');
  document.getElementById('nav').classList.toggle('hidden', name === 'login');
}

function setNavUser(text) {
  document.getElementById('navUser').textContent = text;
}

// ===== PIN INPUT (OTP-style) =====
const pinCells = Array.from(document.querySelectorAll('#pinInputs .pin-cell'));

function getPinValue() {
  return pinCells.map(c => c.value).join('');
}

function setPinValue(str) {
  const digits = String(str || '').replace(/\D/g, '').slice(0, pinCells.length);
  pinCells.forEach((c, i) => {
    c.value = digits[i] || '';
    c.classList.toggle('filled', !!digits[i]);
  });
  // фокус на наступну порожню або останню
  const nextEmpty = pinCells.findIndex(c => !c.value);
  (nextEmpty === -1 ? pinCells[pinCells.length - 1] : pinCells[nextEmpty]).focus();
}

function clearPin() {
  pinCells.forEach(c => { c.value = ''; c.classList.remove('filled'); });
  pinCells[0].focus();
}

pinCells.forEach((cell, idx) => {
  cell.addEventListener('input', (e) => {
    // фільтруємо нецифри
    const v = e.target.value.replace(/\D/g, '');
    e.target.value = v.slice(0, 1);
    e.target.classList.toggle('filled', !!e.target.value);

    // якщо ввели цифру і це не останній — перейти далі
    if (e.target.value && idx < pinCells.length - 1) {
      pinCells[idx + 1].focus();
      pinCells[idx + 1].select();
    }

    // якщо всі заповнені — сабмітимо форму
    if (idx === pinCells.length - 1 && getPinValue().length === pinCells.length) {
      document.getElementById('loginForm').requestSubmit();
    }
  });

  cell.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      if (cell.value) {
        // просто чистимо поточну
        cell.value = '';
        cell.classList.remove('filled');
      } else if (idx > 0) {
        // переходимо назад і чистимо там
        pinCells[idx - 1].focus();
        pinCells[idx - 1].value = '';
        pinCells[idx - 1].classList.remove('filled');
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      pinCells[idx - 1].focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && idx < pinCells.length - 1) {
      pinCells[idx + 1].focus();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      // даємо формі сабмітитись
    }
  });

  cell.addEventListener('focus', () => cell.select());

  cell.addEventListener('paste', (e) => {
    e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData('text');
    setPinValue(txt);
  });
});

// ===== LOGIN =====
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pin = getPinValue();
  const errEl = document.getElementById('loginError');
  const btn = e.target.querySelector('button[type=submit]');
  errEl.textContent = '';

  if (!email) {
    errEl.textContent = 'Введіть email';
    return;
  }
  if (!/^\d{6}$/.test(pin)) {
    errEl.textContent = 'PIN має складатись з 6 цифр';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Перевіряю...';

  const res = await callApi('check_judge', { email, pin });
  if (!res.ok) {
    errEl.textContent = res.error || 'Помилка входу';
    btn.disabled = false;
    btn.textContent = 'Увійти';
    clearPin();
    return;
  }

  state.email = email;
  state.pin = pin;
  state.judgeName = (res.judge && res.judge.name) || email;
  localStorage.setItem('jury_email', email);
  localStorage.setItem('jury_pin', pin);
  localStorage.setItem('jury_name', state.judgeName);
  await enterCatalog();
});

document.getElementById('adminForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('adminPassword').value;
  const errEl = document.getElementById('adminError');
  const btn = e.target.querySelector('button[type=submit]');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Перевіряю...';

  const res = await callApi('admin_ranking', { password });
  if (!res.ok) {
    errEl.textContent = res.error || 'Помилка';
    btn.disabled = false;
    btn.textContent = 'Увійти як адмін';
    return;
  }

  state.isAdmin = true;
  state.adminPassword = password;
  state.adminData = res;
  sessionStorage.setItem('admin_pwd', password);
  setNavUser('Адмін');
  renderAdmin();
  showView('admin');
  btn.disabled = false;
  btn.textContent = 'Увійти як адмін';
});

document.getElementById('navLogout').addEventListener('click', () => {
  localStorage.removeItem('jury_email');
  localStorage.removeItem('jury_pin');
  localStorage.removeItem('jury_name');
  sessionStorage.removeItem('admin_pwd');
  state.email = null;
  state.pin = null;
  state.isAdmin = false;
  state.adminPassword = null;
  showView('login');
  document.getElementById('loginEmail').value = '';
  document.getElementById('adminPassword').value = '';
  clearPin();
});

// ===== CATALOG =====
async function enterCatalog() {
  setNavUser(state.judgeName || state.email);
  showView('catalog');
  document.getElementById('catalogGrid').innerHTML = '<p class="muted centered">Завантажую роботи…</p>';
  const res = await callApi('list_artworks', { email: state.email, pin: state.pin });
  if (!res.ok) {
    document.getElementById('catalogGrid').innerHTML =
      `<p class="error centered">${res.error}</p>`;
    // якщо PIN протух/змінився — відправляємо на логін
    if (/PIN|email/i.test(res.error || '')) {
      setTimeout(() => {
        localStorage.removeItem('jury_email');
        localStorage.removeItem('jury_pin');
        localStorage.removeItem('jury_name');
        state.email = null; state.pin = null;
        showView('login');
      }, 1500);
    }
    return;
  }
  state.artworks = res.artworks;
  state.judgeName = (res.judge && res.judge.name) || state.email;
  setNavUser(state.judgeName);
  state.nav = { category: null, technique: null };
  renderCatalog();
}

// чи активний глобальний режим (пошук/мої лайки) — тоді показуємо плаский результат
function isSearchMode() {
  return state.filters.search.trim() !== '' || state.filters.myLikedOnly;
}

// застосувати глобальні фільтри (пошук + мої лайки) до набору робіт
function applyGlobalFilters(list) {
  const s = state.filters.search.trim().toLowerCase();
  const { myLikedOnly } = state.filters;
  return list.filter(a => {
    if (myLikedOnly && !a.my_liked) return false;
    if (s) {
      const hay = `${a.author} ${a.title} ${a.school} ${a.teacher} ${a.city}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
}

// згрупувати роботи за ключем (через функцію-екстрактор)
function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach(a => {
    const k = keyFn(a);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  });
  return map;
}

function renderCatalog() {
  const stats = document.getElementById('catalogStats');
  const myLikes = state.artworks.filter(a => a.my_liked).length;
  stats.innerHTML = `Усього робіт: <strong>${state.artworks.length}</strong> · Моїх лайків: <strong>${myLikes}</strong>`;

  if (isSearchMode()) {
    renderSearchResults();
  } else if (state.nav.category === null) {
    renderCategoryCards();
  } else {
    renderCategoryPage();
  }
}

// ---- хедер каталогу (замість хлібних крихт) ----
// back: { label, onClick } або null; title: рядок; sub: рядок-підпис або ''
function renderHeader(back, title, sub) {
  const h = document.getElementById('catalogHeader');
  if (!title && !back) { h.classList.add('hidden'); h.innerHTML = ''; return; }
  h.classList.remove('hidden');
  h.innerHTML = `
    ${back ? `<button class="back-btn" type="button"><span class="back-arrow">‹</span> ${esc(back.label)}</button>` : ''}
    <div class="catalog-header-title">
      <h2>${esc(title)}</h2>
      ${sub ? `<span class="catalog-header-sub">${esc(sub)}</span>` : ''}
    </div>`;
  if (back) h.querySelector('.back-btn').addEventListener('click', back.onClick);
}

// колаж-прев'ю для картки (до 4 зображень)
function folderPreviewHtml(items) {
  const imgs = items.filter(a => a.file_id).slice(0, 4);
  if (imgs.length === 0) return `<div class="folder-preview empty">🎨</div>`;
  const cells = imgs.map(a =>
    `<span style="background-image:url('${driveImgUrl(a.file_id, 300)}')"></span>`
  ).join('');
  return `<div class="folder-preview cells-${imgs.length}">${cells}</div>`;
}

function showSections({ folders = false, chips = false, grid = false }) {
  document.getElementById('folderGrid').classList.toggle('hidden', !folders);
  document.getElementById('chipRow').classList.toggle('hidden', !chips);
  document.getElementById('catalogGrid').classList.toggle('hidden', !grid);
}

// ---- рівень 1: вікові категорії як великі картки ----
function renderCategoryCards() {
  renderHeader(null, '', '');
  showSections({ folders: true });
  document.getElementById('catalogEmpty').classList.add('hidden');
  const fg = document.getElementById('folderGrid');

  const groups = [...groupBy(state.artworks, artCategory).entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'uk'));

  fg.innerHTML = groups.map(([cat, items]) => {
    const liked = items.filter(a => a.my_liked).length;
    return `
    <button class="category-card" data-cat="${escAttr(cat)}">
      ${folderPreviewHtml(items)}
      <div class="category-info">
        <div class="category-name">${esc(cat)}</div>
        <div class="category-meta">
          <span>${items.length} ${pluralWorks(items.length)}</span>
          ${liked ? `<span class="category-liked">♥ ${liked}</span>` : ''}
        </div>
      </div>
    </button>`;
  }).join('');

  fg.querySelectorAll('.category-card').forEach(btn => {
    btn.addEventListener('click', () => {
      state.nav = { category: btn.dataset.cat, technique: '' };
      renderCatalog();
    });
  });
}

function pluralWorks(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'робота';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'роботи';
  return 'робіт';
}

// ---- рівень 2: сторінка категорії — чипи технік + сітка робіт ----
function renderCategoryPage() {
  const cat = state.nav.category;
  const inCat = state.artworks.filter(a => artCategory(a) === cat);

  renderHeader(
    { label: 'Категорії', onClick: () => { state.nav = { category: null, technique: null }; renderCatalog(); } },
    cat,
    `${inCat.length} ${pluralWorks(inCat.length)}`
  );

  // чипи технік
  const techGroups = [...groupBy(inCat, artTechnique).entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'uk'));

  const active = state.nav.technique || '';
  const chips = [`<button class="chip ${active === '' ? 'active' : ''}" data-tech="">Усі <span class="chip-count">(${inCat.length})</span></button>`]
    .concat(techGroups.map(([tech, items]) =>
      `<button class="chip ${active === tech ? 'active' : ''}" data-tech="${escAttr(tech)}">${esc(tech)} <span class="chip-count">(${items.length})</span></button>`
    ));

  const chipRow = document.getElementById('chipRow');
  chipRow.innerHTML = chips.join('');
  chipRow.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.nav.technique = btn.dataset.tech;
      renderCatalog();
    });
  });

  showSections({ chips: true, grid: true });
  const items = active ? inCat.filter(a => artTechnique(a) === active) : inCat;
  paintGrid(items);
}

// ---- плаский результат пошуку/лайків ----
function renderSearchResults() {
  const items = applyGlobalFilters(state.artworks);
  const title = state.filters.myLikedOnly && state.filters.search.trim() === ''
    ? 'Мої лайки'
    : 'Результати пошуку';
  renderHeader(null, title, `${items.length} ${pluralWorks(items.length)}`);
  showSections({ grid: true });
  paintGrid(items);
}

// спільний рендер сітки робіт
function paintGrid(items) {
  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('catalogEmpty');

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = items.map(a => tileHtml(a)).join('');

  grid.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', onLikeClick);
  });
  grid.querySelectorAll('.tile-img[data-fileid]').forEach(el => {
    el.addEventListener('click', () => openLightbox(el.dataset.fileid, el.dataset.caption, el.dataset.rot));
  });
}

function tileHtml(a) {
  const img = a.file_id
    ? `<div class="tile-img" data-fileid="${a.file_id}" data-rot="${normRot(a.rotation)}" data-caption="${escAttr(a.author + ' — ' + a.title)}">
         <img loading="lazy" src="${driveImgUrl(a.file_id, 600)}" alt="${escAttr(a.title)}"${rotStyle(a.rotation)} onerror="this.parentElement.classList.add('no-image'); this.parentElement.innerHTML='Зображення недоступне'" />
       </div>`
    : `<div class="tile-img no-image">Немає зображення</div>`;

  return `
    <div class="tile" data-id="${escAttr(a.id)}">
      ${img}
      <div class="tile-body">
        <div class="tile-title">${esc(a.title) || '—'}</div>
        <div class="tile-author">${esc(a.author)}</div>
        <div class="tile-meta">
          ${a.category ? `<span>${esc(a.category)}</span>` : ''}
          ${a.technique ? `<span>${esc(a.technique)}</span>` : ''}
          ${a.school ? `<span>${esc(a.school)}</span>` : ''}
        </div>
      </div>
      <div class="tile-footer">
        <span class="muted" style="font-size:0.75rem;">${esc(a.city || '')}</span>
        <button class="like-btn ${a.my_liked ? 'liked' : ''}" data-id="${escAttr(a.id)}" title="${a.my_liked ? 'Забрати лайк' : 'Поставити лайк'}">
          <span class="heart"></span>
          <span class="like-label">${a.my_liked ? 'Лайкнуто' : 'Лайк'}</span>
        </button>
      </div>
    </div>
  `;
}

async function onLikeClick(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  btn.disabled = true;
  const res = await callApi('toggle_like', { email: state.email, pin: state.pin, artwork_id: id });
  btn.disabled = false;
  if (!res.ok) {
    alert(res.error || 'Помилка');
    return;
  }
  // update state
  const a = state.artworks.find(x => x.id === id);
  if (a) a.my_liked = res.liked;
  renderCatalog();
}

// Filters
document.getElementById('filterSearch').addEventListener('input', e => {
  state.filters.search = e.target.value;
  renderCatalog();
});
document.getElementById('filterMyLiked').addEventListener('change', e => {
  state.filters.myLikedOnly = e.target.checked;
  renderCatalog();
});

// ===== LIGHTBOX =====
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCap = document.getElementById('lightboxCaption');

function openLightbox(fileId, caption, rot) {
  lightboxImg.src = driveImgUrl(fileId, 1600);
  lightboxCap.textContent = caption || '';
  const r = normRot(rot);
  lightboxImg.style.transform = r ? `rotate(${r}deg)` : '';
  // для 90/270 міняємо обмеження сторін, щоб картинка не вилазила за екран
  lightboxImg.classList.toggle('rotated', r === 90 || r === 270);
  lightbox.classList.remove('hidden');
}
function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  lightboxImg.style.transform = '';
  lightboxImg.classList.remove('rotated');
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox();
});

// ===== ADMIN =====
// Повертає роботу на delta градусів, зберігає на бекенді (для всіх жюрі)
async function rotateArtwork(id, delta) {
  const a = state.adminData && state.adminData.ranking.find(x => x.id === id);
  if (!a) return;
  const prev = normRot(a.rotation);
  const next = normRot(prev + delta);
  // оптимістично оновлюємо UI
  a.rotation = next;
  renderAdmin();
  const res = await callApi('admin_set_rotation', {
    password: state.adminPassword,
    artwork_id: id,
    rotation: next
  });
  if (!res.ok) {
    a.rotation = prev; // відкат
    renderAdmin();
    alert(res.error || 'Не вдалося зберегти поворот');
  }
}

function renderAdmin() {
  const data = state.adminData;
  if (!data) return;

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-box"><div class="stat-num">${data.total_artworks}</div><div class="stat-label">Робіт</div></div>
    <div class="stat-box"><div class="stat-num">${data.total_judges}</div><div class="stat-label">Жюрі у списку</div></div>
    <div class="stat-box"><div class="stat-num">${data.total_votes}</div><div class="stat-label">Усього лайків</div></div>
    <div class="stat-box"><div class="stat-num">${data.judges.filter(j => j.votes_cast > 0).length}</div><div class="stat-label">Активних жюрі</div></div>
  `;

  // ranking table
  const tbody = document.getElementById('rankingBody');
  tbody.innerHTML = data.ranking.map((a, i) => {
    const rank = i + 1;
    const cls = rank <= 3 ? `rank-${rank}` : '';
    const thumb = a.file_id
      ? `<div class="thumb-wrap"><img class="thumb" src="${driveImgUrl(a.file_id, 120)}" alt=""${rotStyle(a.rotation)} onerror="this.style.display='none'" /></div>`
      : '<span class="muted">—</span>';
    const rotateCell = a.file_id
      ? `<div class="rotate-ctrls">
           <button class="rotate-btn" data-id="${escAttr(a.id)}" data-delta="-90" title="Повернути проти годинникової">↺</button>
           <button class="rotate-btn" data-id="${escAttr(a.id)}" data-delta="90" title="Повернути за годинниковою">↻</button>
         </div>`
      : '<span class="muted">—</span>';
    return `<tr class="${cls}">
      <td>${rank}</td>
      <td>${thumb}</td>
      <td>${rotateCell}</td>
      <td>${esc(a.author)}</td>
      <td>${esc(a.title)}</td>
      <td>${esc(a.category)}</td>
      <td>${esc(a.technique)}</td>
      <td>${esc(a.school)}</td>
      <td><strong>${a.likes}</strong></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.rotate-btn').forEach(btn => {
    btn.addEventListener('click', () => rotateArtwork(btn.dataset.id, parseInt(btn.dataset.delta, 10)));
  });

  // judges table
  const showPins = document.getElementById('togglePins').dataset.showing === '1';
  document.getElementById('judgesBody').innerHTML = data.judges.map(j => `
    <tr>
      <td>${esc(j.name || '—')}</td>
      <td>${esc(j.email)}</td>
      <td class="pin-col ${showPins ? '' : 'hidden'}"><code>${esc(j.pin || '—')}</code></td>
      <td>${j.votes_cast}</td>
    </tr>
  `).join('');
}

// Toggle PIN display
document.getElementById('togglePins').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const showing = btn.dataset.showing === '1';
  if (!showing) {
    // Завантажуємо PIN-и окремим запитом
    btn.disabled = true;
    btn.textContent = 'Завантажую...';
    const res = await callApi('admin_judges', { password: state.adminPassword });
    btn.disabled = false;
    if (!res.ok) { alert(res.error); btn.textContent = 'Показати PIN-и'; return; }
    // Об'єднуємо PIN-и з поточним списком жюрі
    const pinMap = {};
    res.judges.forEach(j => { pinMap[j.email] = j.pin; });
    state.adminData.judges.forEach(j => { j.pin = pinMap[j.email] || ''; });
    btn.dataset.showing = '1';
    btn.textContent = 'Сховати PIN-и';
    document.querySelectorAll('.pin-col').forEach(el => el.classList.remove('hidden'));
  } else {
    btn.dataset.showing = '0';
    btn.textContent = 'Показати PIN-и';
    document.querySelectorAll('.pin-col').forEach(el => el.classList.add('hidden'));
  }
  renderAdmin();
});

document.getElementById('reloadAdmin').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Оновлюю...';
  const res = await callApi('admin_ranking', { password: state.adminPassword });
  if (res.ok) {
    state.adminData = res;
    renderAdmin();
  } else {
    alert(res.error || 'Помилка');
  }
  e.target.disabled = false;
  e.target.textContent = 'Оновити';
});

// ===== RESULTS (по категоріях, за лайками) =====
function renderResults(ranking) {
  const wrap = document.getElementById('resultsContent');
  if (!ranking || !ranking.length) {
    wrap.innerHTML = '<p class="muted centered">Немає робіт для показу.</p>';
    return;
  }

  const groups = [...groupBy(ranking, artCategory).entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'uk'));

  wrap.innerHTML = groups.map(([cat, items]) => {
    const sorted = items.slice().sort((a, b) => b.likes - a.likes);
    const tiles = sorted.map((a, i) => {
      const rank = i + 1;
      const medal = rank <= 3 ? `medal-${rank}` : '';
      const img = a.file_id
        ? `<div class="tile-img" data-fileid="${a.file_id}" data-rot="${normRot(a.rotation)}" data-caption="${escAttr(a.author + ' — ' + a.title)}">
             <img loading="lazy" src="${driveImgUrl(a.file_id, 600)}" alt="${escAttr(a.title)}"${rotStyle(a.rotation)} onerror="this.parentElement.classList.add('no-image'); this.parentElement.innerHTML='Зображення недоступне'" />
             <span class="result-rank ${medal}">${rank}</span>
           </div>`
        : `<div class="tile-img no-image"><span class="result-rank ${medal}">${rank}</span>Немає зображення</div>`;
      return `
        <div class="tile">
          ${img}
          <div class="tile-body">
            <div class="tile-title">${esc(a.title) || '—'}</div>
            <div class="tile-author">${esc(a.author)}</div>
            <div class="tile-meta">
              ${a.technique ? `<span>${esc(a.technique)}</span>` : ''}
              ${a.teacher ? `<span>Вчитель: ${esc(a.teacher)}</span>` : ''}
              ${a.school ? `<span>${esc(a.school)}</span>` : ''}
            </div>
          </div>
          <div class="tile-footer">
            <span class="muted" style="font-size:0.75rem;">${esc(a.city || '')}</span>
            <span class="likes-badge">♥ ${a.likes}</span>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="result-category">
        <h3 class="result-cat-title">${esc(cat)} <span class="muted">· ${items.length} ${pluralWorks(items.length)}</span></h3>
        <div class="grid">${tiles}</div>
      </section>`;
  }).join('');

  // клік на зображення → лайтбокс
  wrap.querySelectorAll('.tile-img[data-fileid]').forEach(el => {
    el.addEventListener('click', () => openLightbox(el.dataset.fileid, el.dataset.caption, el.dataset.rot));
  });
}

// звідки відкрили результати — туди й повертаємось
function openResultsView(origin, ranking) {
  state.resultsOrigin = origin;
  document.querySelector('#resultsBack .back-label').textContent =
    origin === 'admin' ? 'До адмінки' : 'Назад';
  renderResults(ranking);
  showView('results');
}

// з адмінки — беремо вже завантажені дані
document.getElementById('openResults').addEventListener('click', () => {
  openResultsView('admin', state.adminData && state.adminData.ranking);
});

// публічно (зі сторінки входу) — окремий запит без пароля
document.getElementById('openResultsPublic').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Завантажую…';
  const res = await callApi('public_results');
  btn.disabled = false;
  btn.textContent = old;
  if (!res.ok) { alert(res.error || 'Не вдалося завантажити результати'); return; }
  openResultsView('login', res.ranking);
});

document.getElementById('resultsBack').addEventListener('click', () => {
  showView(state.resultsOrigin || 'login');
});

document.getElementById('exportCsv').addEventListener('click', async () => {
  const res = await callApi('admin_export', { password: state.adminPassword });
  if (!res.ok) { alert(res.error); return; }
  const blob = new Blob(['\uFEFF' + res.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rating_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ===== UTILS =====
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

// ===== INIT =====
(function init() {
  if (!API_URL || API_URL.startsWith('PASTE')) {
    document.body.innerHTML = `
      <div style="max-width: 700px; margin: 4rem auto; padding: 2rem; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; font-family: sans-serif;">
        <h2>⚠️ Не налаштовано API_URL</h2>
        <p>Відкрий <code>app.js</code> і встав URL свого Apps Script Web App у змінну <code>API_URL</code> на початку файлу.</p>
      </div>
    `;
    return;
  }

  const savedEmail = localStorage.getItem('jury_email');
  const savedPin = localStorage.getItem('jury_pin');
  if (savedEmail && savedPin) {
    state.email = savedEmail;
    state.pin = savedPin;
    state.judgeName = localStorage.getItem('jury_name') || savedEmail;
    enterCatalog();
  } else {
    showView('login');
  }
})();
