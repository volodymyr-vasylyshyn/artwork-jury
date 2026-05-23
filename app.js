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
  filters: { category: '', technique: '', search: '', myLikedOnly: false }
};

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
  populateFilters();
  renderCatalog();
}

function populateFilters() {
  const cats = new Set();
  const techs = new Set();
  state.artworks.forEach(a => {
    if (a.category) cats.add(a.category);
    if (a.technique) techs.add(a.technique);
  });
  const catSel = document.getElementById('filterCategory');
  const techSel = document.getElementById('filterTechnique');
  // зберігаємо плейсхолдер
  catSel.innerHTML = '<option value="">Усі категорії</option>';
  techSel.innerHTML = '<option value="">Усі техніки</option>';
  [...cats].sort().forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });
  [...techs].sort().forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    techSel.appendChild(o);
  });
}

function filterArtworks() {
  const { category, technique, search, myLikedOnly } = state.filters;
  const s = search.trim().toLowerCase();
  return state.artworks.filter(a => {
    if (category && a.category !== category) return false;
    if (technique && a.technique !== technique) return false;
    if (myLikedOnly && !a.my_liked) return false;
    if (s) {
      const hay = `${a.author} ${a.title} ${a.school} ${a.teacher} ${a.city}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
}

function renderCatalog() {
  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('catalogEmpty');
  const stats = document.getElementById('catalogStats');
  const filtered = filterArtworks();
  const myLikes = state.artworks.filter(a => a.my_liked).length;

  stats.innerHTML = `Робіт: <strong>${filtered.length}</strong> із ${state.artworks.length} · Моїх лайків: <strong>${myLikes}</strong>`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map(a => tileHtml(a)).join('');

  // bind events
  grid.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', onLikeClick);
  });
  grid.querySelectorAll('.tile-img[data-fileid]').forEach(el => {
    el.addEventListener('click', () => openLightbox(el.dataset.fileid, el.dataset.caption));
  });
}

function tileHtml(a) {
  const img = a.file_id
    ? `<div class="tile-img" data-fileid="${a.file_id}" data-caption="${escAttr(a.author + ' — ' + a.title)}">
         <img loading="lazy" src="${driveImgUrl(a.file_id, 600)}" alt="${escAttr(a.title)}" onerror="this.parentElement.classList.add('no-image'); this.parentElement.innerHTML='Зображення недоступне'" />
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
['filterCategory', 'filterTechnique'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => {
    state.filters[id === 'filterCategory' ? 'category' : 'technique'] = e.target.value;
    renderCatalog();
  });
});
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

function openLightbox(fileId, caption) {
  lightboxImg.src = driveImgUrl(fileId, 1600);
  lightboxCap.textContent = caption || '';
  lightbox.classList.remove('hidden');
}
function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox();
});

// ===== ADMIN =====
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
      ? `<img class="thumb" src="${driveImgUrl(a.file_id, 120)}" alt="" onerror="this.style.display='none'" />`
      : '<span class="muted">—</span>';
    return `<tr class="${cls}">
      <td>${rank}</td>
      <td>${thumb}</td>
      <td>${esc(a.author)}</td>
      <td>${esc(a.title)}</td>
      <td>${esc(a.category)}</td>
      <td>${esc(a.technique)}</td>
      <td>${esc(a.school)}</td>
      <td><strong>${a.likes}</strong></td>
    </tr>`;
  }).join('');

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
