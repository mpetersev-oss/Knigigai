// Админка: вход, статистика, синхронизация картинок, список книг.
import { h, clear } from './dom.js';

const root = document.getElementById('app');

async function call(method, url, body, isForm = false) {
  const res = await fetch(url, {
    method,
    headers: { 'X-Requested-With': 'kg', ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* */ }
  if (!res.ok) throw new Error((data && data.error) || `Ошибка ${res.status}`);
  return data;
}

async function start() {
  const me = await call('GET', '/api/admin/me');
  if (!me.logged) return loginView();
  dashboard();
}

function loginView(msg = '') {
  const pass = h('input', { class: 'input', type: 'password', placeholder: 'Пароль', autocomplete: 'current-password' });
  const err = h('p', { class: 'form-err' }, msg);
  clear(root).appendChild(h('div', { class: 'adm', style: { maxWidth: '420px', paddingTop: '15vh' } },
    h('h1', null, 'Админка'),
    h('form', { class: 'adm-card', onsubmit: async (e) => {
      e.preventDefault();
      try {
        await call('POST', '/api/admin/login', { password: pass.value });
        dashboard();
      } catch (ex) { err.textContent = ex.message.includes('401') || ex.message.startsWith('Ошибка') ? 'Неверный пароль' : ex.message; }
    } }, pass, err, h('button', { class: 'btn btn-dark btn-block', type: 'submit' }, 'Войти')),
  ));
  pass.focus();
}

async function dashboard() {
  const box = h('div', { class: 'adm' });
  clear(root).appendChild(box);
  let s;
  try { s = await call('GET', '/api/admin/stats'); } catch (e) { return loginView(e.message); }

  const poseDone = Object.keys(s.poses || {}).map(Number);
  box.append(
    h('div', { class: 'adm-row', style: { justifyContent: 'space-between' } },
      h('h1', null, 'Книгигай · админка'),
      h('div', { class: 'adm-row' },
        h('a', { href: '/', class: 'btn btn-soft btn-sm' }, 'На сайт'),
        h('button', { class: 'btn btn-soft btn-sm', onclick: async () => { await call('POST', '/api/admin/logout'); loginView(); } }, 'Выйти'),
      ),
    ),
    h('div', { class: 'adm-card' },
      h('h2', null, 'Состояние'),
      h('div', { class: 'adm-stats' },
        stat(`${s.editor[0]} / ${s.editor[1]}`, 'картинок редактора'),
        stat(`${poseDone.length} / ${s.allPoses.length}`, 'поз синхронизировано'),
        stat(s.assets, 'файлов в медиатеке'),
        stat(`${s.mediaMb} МБ`, 'занято на диске'),
        stat(s.books, 'книг создано'),
      ),
    ),
    syncCard(s, poseDone),
    await booksCard(),
  );
}

function stat(v, label) { return h('div', { class: 'adm-stat' }, h('b', null, String(v)), h('span', null, label)); }

function syncCard(s, poseDone) {
  const log = h('div', { class: 'adm-log' }, 'Готово к синхронизации.\n');
  const bar = h('i');
  const status = h('span', { class: 'small' });
  const onlyMissing = h('input', { type: 'checkbox', checked: true });
  const write = (t) => { log.textContent += t + '\n'; log.scrollTop = log.scrollHeight; };
  let running = false;

  const run = async (scope, poses = []) => {
    if (running) return;
    running = true;
    root.querySelectorAll('.sync-btn').forEach((b) => (b.disabled = true));
    try {
      write(`— ${new Date().toLocaleTimeString()} — раздел: ${scope}${poses.length ? ' (позы ' + poses.join(', ') + ')' : ''}`);
      const { jobs } = await call('POST', '/api/admin/plan', { scope, poses, onlyMissing: onlyMissing.checked });
      write(`Задач: ${jobs.length}`);
      let done = 0, failed = 0, bytes = 0;
      const queue = jobs.slice();
      const worker = async () => {
        while (queue.length) {
          const job = queue.shift();
          try {
            bytes += await convertAndUpload(job);
          } catch (e) {
            failed++;
            write(`✗ ${job.key}: ${e.message}`);
          }
          done++;
          bar.style.width = `${(done / Math.max(1, jobs.length)) * 100}%`;
          status.textContent = `${done} / ${jobs.length} · ${(bytes / 1048576).toFixed(1)} МБ`;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      await call('POST', '/api/admin/rebuild');
      write(`Готово: ${done - failed} успешно, ${failed} с ошибками.`);
    } catch (e) {
      write('Ошибка: ' + e.message);
    } finally {
      running = false;
      root.querySelectorAll('.sync-btn').forEach((b) => (b.disabled = false));
    }
  };

  const poseInput = h('input', { class: 'input input-sm', style: { maxWidth: '260px' }, placeholder: 'номера поз через запятую', value: s.coverPoses.join(', ') });
  return h('div', { class: 'adm-card' },
    h('h2', null, 'Синхронизация картинок'),
    h('p', { class: 'small' }, 'Картинки скачиваются из Webflow и Airtable, сжимаются в WebP прямо в этом браузере и сохраняются на хостинге. Не закрывайте вкладку, пока идёт процесс.'),
    h('div', { class: 'adm-row' }, h('label', null, onlyMissing, 'Только недостающие')),
    h('div', { class: 'adm-row' },
      h('button', { class: 'btn btn-dark btn-sm sync-btn', onclick: () => run('editor') }, '1. Редактор персонажей'),
      h('button', { class: 'btn btn-dark btn-sm sync-btn', onclick: () => run('covers') }, '2. Обложки'),
    ),
    h('div', { class: 'adm-row' },
      poseInput,
      h('button', { class: 'btn btn-dark btn-sm sync-btn', disabled: !s.airtable, onclick: () => run('poses', poseInput.value.split(/[^\d]+/).filter(Boolean).map(Number)) }, '3. Позы из Airtable'),
      s.airtable ? null : h('span', { class: 'small' }, 'нужен airtable_token в config.php'),
    ),
    h('p', { class: 'small' }, `Позы на обложках: ${s.coverPoses.join(', ')}. Уже есть: ${poseDone.join(', ') || '—'}.`),
    h('div', { class: 'progress' }, bar), status, log,
  );
}

const FRAME_SCALE = 0.45; // доля от кадра 2855×3305 — хватает для экрана с ретиной
const COVER_WIDTH = 900;

async function convertAndUpload(job) {
  const res = await fetch('/api/admin/proxy?u=' + encodeURIComponent(job.src), { headers: { 'X-Requested-With': 'kg' } });
  if (!res.ok) throw new Error(`скачивание: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || 2855, nh = img.naturalHeight || 3305;
    let out, meta;
    if (job.cover) {
      const w = Math.min(COVER_WIDTH, nw);
      const hgt = Math.round((nh / nw) * w);
      const cv = canvas(w, hgt);
      cv.getContext('2d').drawImage(img, 0, 0, w, hgt);
      out = cv;
      meta = { fw: nw, fh: nh, x: 0, y: 0, w: 1, h: 1 };
    } else {
      const s = FRAME_SCALE * (2855 / nw);
      const W = Math.round(nw * s), H = Math.round(nh * s);
      const cv = canvas(W, H);
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const b = bbox(ctx, W, H);
      if (!b) throw new Error('пустая картинка');
      const pad = 2;
      const x0 = Math.max(0, b[0] - pad), y0 = Math.max(0, b[1] - pad);
      const x1 = Math.min(W, b[2] + pad), y1 = Math.min(H, b[3] + pad);
      out = canvas(x1 - x0, y1 - y0);
      out.getContext('2d').drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
      // координаты в пикселях исходного кадра
      meta = { fw: nw, fh: nh, x: x0 / s, y: y0 / s, w: (x1 - x0) / s, h: (y1 - y0) / s };
    }
    const webp = await new Promise((r) => out.toBlob(r, 'image/webp', 0.86));
    if (!webp || webp.type !== 'image/webp') throw new Error('браузер не умеет WebP — используйте Chrome');
    const fd = new FormData();
    fd.append('key', job.key);
    fd.append('src', job.src.slice(0, 180));
    for (const [k, v] of Object.entries(meta)) fd.append(k, String(Math.round(v)));
    fd.append('file', webp, 'a.webp');
    await call('POST', '/api/admin/asset', fd, true);
    return webp.size;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvas(w, hgt) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, hgt);
  return c;
}

/** Границы непрозрачной части картинки [x0, y0, x1, y1]. */
function bbox(ctx, W, H) {
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (d[row + x * 4 + 3] > 6) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

async function booksCard() {
  let books = [];
  try { books = (await call('GET', '/api/admin/books')).books; } catch { /* */ }
  return h('div', { class: 'adm-card' },
    h('h2', null, 'Последние книги'),
    books.length ? h('table', null,
      h('tr', null, h('th', null, 'Герои'), h('th', null, 'Повод'), h('th', null, 'Обложка'), h('th', null, 'Почта'), h('th', null, 'Изменена')),
      books.map((b) => {
        const d = b.data;
        return h('tr', null,
          h('td', null, h('a', { href: `/b/${b.token}`, target: '_blank' }, d.heroes.giver ? d.heroes.giver.name : '—', ' & ', d.heroes.receiver ? d.heroes.receiver.name : '—')),
          h('td', null, d.occasion || '—'),
          h('td', null, d.cover ? d.cover.id : '—'),
          h('td', null, b.email || ''),
          h('td', null, b.updatedAt),
        );
      }),
    ) : h('p', { class: 'small' }, 'Пока нет книг.'),
  );
}

start().catch((e) => { clear(root).appendChild(h('div', { class: 'adm' }, h('h1', null, 'Ошибка'), h('p', null, e.message))); });
