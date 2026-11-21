// Страницы книги: сцена с героями в позах + текст.
// Координаты героев — в тех же единицах, что и на обложках (ширина страницы 174.8),
// поэтому страница одинаково выглядит в миниатюре, в просмотре и в макете для печати.
import { figure } from './hero.js';
import { renderCover } from './cover.js';

const W = 174.8;

/** Подставляет имена: {g} {r} и формы по полу {g?он|она}. */
export function fillText(text, heroes) {
  const g = heroes.giver || {}, r = heroes.receiver || {};
  return String(text || '')
    .replace(/\{([gr])\?([^|}]*)\|([^}]*)\}/g, (_, who, m, f) => ((who === 'g' ? g : r).gender === 'male' ? m : f))
    .replace(/\{g\}/g, g.name || '')
    .replace(/\{r\}/g, r.name || '');
}

/** Сцены, для которых картинки поз уже загружены полностью (~250 слоёв: вся одежда и причёски). */
export function availableTemplates(catalog) {
  const full = (n) => ((catalog.sync && catalog.sync.poses && catalog.sync.poses[n]) || 0) >= 200;
  return catalog.book.scenes.filter((t) => [t.giver, t.receiver].every((s) => !s || full(s.pose)));
}

export function templateById(catalog, id) {
  return catalog.book.scenes.find((t) => t.id === id) || null;
}

const romantic = (relation) => !relation || relation === 'partner' || relation === 'spouse';

/** Текст сцены по умолчанию. */
export function defaultText(tpl) {
  return (tpl && tpl.text) || '';
}

/** Страницы по умолчанию: посвящение под повод, 12 сцен из разных разделов (сначала — где оба героя), финал. */
export function defaultPages(catalog, data) {
  const b = catalog.book;
  const list = availableTemplates(catalog).filter((t) => !/мам|пап/i.test(t.text));
  const byCat = {};
  for (const t of list) (byCat[t.cat] = byCat[t.cat] || []).push(t);
  for (const k of Object.keys(byCat)) byCat[k].sort((x, y) => (y.receiver ? 1 : 0) - (x.receiver ? 1 : 0));
  const order = ['outside', 'travel', 'home', 'restaurants', 'hobby', 'celebration', 'sport', 'museum', 'spa', 'transport', 'stage', 'shop', 'work', 'school'];
  const picked = [];
  for (let round = 0; picked.length < 12 && round < 4; round++) {
    for (const cat of order) {
      const t = (byCat[cat] || [])[round];
      if (t && picked.length < 12) picked.push(t);
    }
  }
  const rom = romantic(data.relation);
  const ded = b.dedication[data.occasion] || b.dedication['наш праздник'];
  return {
    dedication: rom ? ded[0] : ded[1],
    final: rom ? b.final[0] : b.final[1],
    items: [
      ...picked.map((t) => ({ t: t.id, text: t.text, swap: false, clouds: [] })),
      // Последней — страница-письмо со своими словами
      ...(b.scenes.some((t) => t.id === 'frame-1') ? [{ t: 'frame-1', text: b.noteText, swap: false, clouds: [] }] : []),
    ],
  };
}

/** Убирает страницы со сценами, которых больше нет в каталоге. */
export function cleanPages(catalog, pages) {
  if (!pages) return pages;
  return { ...pages, items: pages.items.filter((it) => templateById(catalog, it.t)) };
}

/** Все страницы блока по порядку: посвящение, сюжетные, финал. */
export function bookSpreads(catalog, data) {
  const p = data.pages;
  if (!p) return [];
  const out = [{ kind: 'dedication', text: p.dedication }];
  p.items.forEach((it, i) => { if (templateById(catalog, it.t)) out.push({ kind: 'scene', item: it, index: i }); });
  out.push({ kind: 'final', text: p.final });
  return out;
}

/**
 * Рисует одну страницу.
 * page: { kind: 'dedication' | 'scene' | 'final', item?, text? }
 */
export function renderPage(catalog, page, heroes, opts = {}) {
  const b = catalog.book;
  const ref = b.ref;
  let tpl, text, swap = false;
  if (page.kind === 'scene') {
    // Сюжетная страница: фон, предметы, герои в позах и текст — как у обложки
    const sc = templateById(catalog, page.item.t) || b.scenes[0];
    const body = fillText(page.item.text, heroes);
    const el = renderCover(catalog, sc.note ? { ...sc, text: '' } : sc, heroes, { text: sc.note ? '' : (body || sc.text), swap: !!page.item.swap, solo: page.item.swap ? 'receiver' : 'giver' }, { lazy: opts.lazy });
    el.classList.add('is-page');
    if (sc.note) {
      // Страница-письмо: текст на «листе» в центре рамки
      el.classList.add('is-note');
      const t = document.createElement('div');
      t.className = 'note-text';
      const p = document.createElement('p');
      p.textContent = body;
      if (body.length > 260) p.classList.add('is-long');
      t.appendChild(p);
      el.appendChild(t);
    }
    (page.item.clouds || []).forEach((cl, i) => el.appendChild(cloudEl(catalog, cl, i, heroes)));
    if (opts.number) {
      const n = document.createElement('span');
      n.className = 'bp-num';
      n.textContent = String(opts.number);
      el.appendChild(n);
    }
    return el;
  } else {
    tpl = b.special[page.kind];
    text = page.text;
  }
  const el = document.createElement('div');
  el.className = `bpage th-${tpl.theme} is-${page.kind}`;
  el.style.aspectRatio = `${ref.w} / ${ref.h}`;

  const scene = document.createElement('div');
  scene.className = 'bp-scene';
  if (page.kind !== 'dedication') scene.style.height = `${(ref.scene / ref.h) * 100}%`;
  scene.innerHTML = decorSvg(tpl.decor, page.kind === 'dedication' ? ref.h : ref.scene, tpl);
  el.appendChild(scene);

  const slots = [[tpl.g, swap ? heroes.receiver : heroes.giver], [tpl.r, swap ? heroes.giver : heroes.receiver]];
  for (const [slot, hero] of slots) {
    if (!slot || !hero) continue;
    const [sw] = catalog.coverRef.sizes[slot.size] || catalog.coverRef.sizes.medium;
    const wrap = document.createElement('div');
    wrap.className = 'bp-hero';
    wrap.style.left = `${(slot.x / W) * 100}%`;
    wrap.style.top = `calc(${(slot.y / W) * 100} * var(--cw))`;
    wrap.style.width = `${(sw / W) * 100}%`;
    if (slot.flip) wrap.style.transform = 'scaleX(-1)';
    wrap.appendChild(figure(catalog, hero, { pose: slot.pose, lazy: opts.lazy }));
    scene.appendChild(wrap);
  }

  const box = document.createElement('div');
  box.className = 'bp-text';
  if (page.kind === 'dedication') {
    const k = document.createElement('p');
    k.className = 'bp-kicker';
    k.textContent = 'Для';
    const n = document.createElement('p');
    n.className = 'bp-name';
    n.textContent = (heroes.receiver && heroes.receiver.name) || '';
    box.append(k, n);
  }
  const t = document.createElement('p');
  t.className = 'bp-body';
  t.textContent = fillText(text, heroes);
  box.appendChild(t);
  if (page.kind === 'dedication' && heroes.giver) {
    const s = document.createElement('p');
    s.className = 'bp-sign';
    s.textContent = `— ${heroes.giver.name}`;
    box.appendChild(s);
  }
  el.appendChild(box);
  if (opts.number) {
    const n = document.createElement('span');
    n.className = 'bp-num';
    n.textContent = String(opts.number);
    el.appendChild(n);
  }
  return el;
}

/** Облако-реплика героя: картинка облака и текст внутри. Координаты — в единицах страницы. */
export function cloudEl(catalog, cl, i, heroes) {
  const keys = catalog.book.clouds || [];
  const a = catalog.assets[keys[cl.s] || keys[0]];
  const d = document.createElement('div');
  d.className = 'pg-cloud';
  d.dataset.i = String(i);
  d.style.left = `${(cl.x / W) * 100}%`;
  d.style.top = `calc(${(cl.y / W) * 100} * var(--cw))`;
  d.style.width = `${(cl.w / W) * 100}%`;
  d.style.setProperty('--fs', `calc(${(cl.w * 0.105 / W) * 100} * var(--cw))`);
  if (a) {
    const img = document.createElement('img');
    img.src = a[0];
    img.alt = '';
    img.draggable = false;
    d.appendChild(img);
  }
  const t = document.createElement('span');
  t.textContent = fillText(cl.text, heroes || {});
  d.appendChild(t);
  return d;
}

/** Облако по умолчанию — над головой героя на этой странице. */
export function defaultCloud(catalog, scene, role, swap) {
  const slotRole = swap ? (role === 'giver' ? 'receiver' : 'giver') : role;
  const slot = scene[slotRole] || scene.giver;
  const [sw, sh] = (slot && catalog.coverRef.sizes[slot.size]) || catalog.coverRef.sizes.medium;
  const cx = slot ? slot.x + sw * 0.5 : 87;
  const top = slot ? slot.y + sh * 0.06 : 40;
  const w = 62;
  // Хвостик облака смотрит к голове героя: у первого облака он справа, у второго — слева
  const right = cx > 87;
  return { s: right ? 0 : 1, text: '', w, x: Math.max(2, Math.min(W - w - 2, cx - (right ? w * 0.8 : w * 0.2))), y: Math.max(4, top - w * 0.66) };
}

// ---------- Декор сцен (простые векторные элементы в цветах темы) ----------
const heart = (x, y, s, o = 1) => `<path transform="translate(${x} ${y}) scale(${s})" opacity="${o}" d="M0-2.6C-1.6-5.6-6-4.6-6-1.2-6 2 -2.4 4.2 0 6.2 2.4 4.2 6 2 6-1.2 6-4.6 1.6-5.6 0-2.6Z"/>`;
const spark = (x, y, s, o = 1) => `<path transform="translate(${x} ${y}) scale(${s})" opacity="${o}" d="M0-6C.6-1.6 1.6-.6 6 0 1.6.6.6 1.6 0 6-.6 1.6-1.6.6-6 0-1.6-.6-.6-1.6 0-6Z"/>`;
const dot = (x, y, r, o = 1) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}"/>`;
const cloud = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity=".9" d="M-14 6h28a7 7 0 0 0 0-14 9 9 0 0 0-17-3 7 7 0 0 0-11 7 5 5 0 0 0 0 10Z"/>`;

function arch(h) {
  return `<path class="dc-arch" d="M24 ${h}V82a63.4 63.4 0 0 1 126.8 0V${h}Z"/>`;
}

function decorSvg(kind, h, tpl = {}) {
  let ground = `<ellipse class="dc-ground" cx="87.4" cy="${h - 7}" rx="66" ry="5"/>`;
  // Скамейка для сидячих поз: сиденье на высоте tpl.bench (в единицах страницы)
  if (tpl.bench) {
    const y = tpl.bench;
    ground += `<g class="dc-bench"><rect x="14" y="${y + 4}" width="4" height="${h - 9 - y - 4}" rx="1.5"/><rect x="156.8" y="${y + 4}" width="4" height="${h - 9 - y - 4}" rx="1.5"/><rect x="6" y="${y}" width="162.8" height="6" rx="3"/></g>`;
  }
  if (tpl.bed) {
    const y = tpl.bed;
    ground += `<g><rect x="6" y="${y}" width="162.8" height="${h - 8 - y}" rx="6" fill="#fff" opacity=".9"/><rect x="6" y="${y}" width="162.8" height="7" rx="3.5" class="dc-solid" opacity=".35"/><rect x="62" y="${y - 10}" width="50" height="12" rx="6" fill="#fff"/></g>`;
  }
  let fg = '';
  switch (kind) {
    case 'hearts':
      fg = heart(22, 30, 1.3, .9) + heart(150, 44, 1.6) + heart(140, 18, .8, .6) + heart(34, 70, .7, .5) + heart(160, 96, .9, .7) + heart(14, 118, .8, .5);
      break;
    case 'clouds':
      fg = cloud(36, 34, 1.2) + cloud(138, 24, .9) + cloud(152, 70, .7) + spark(90, 18, .7, .7);
      break;
    case 'sun':
      fg = `<circle class="dc-solid" cx="140" cy="36" r="14"/>` +
        [...Array(10)].map((_, i) => { const a = (i * Math.PI) / 5; return `<line class="dc-line" x1="${140 + Math.cos(a) * 19}" y1="${36 + Math.sin(a) * 19}" x2="${140 + Math.cos(a) * 25}" y2="${36 + Math.sin(a) * 25}"/>`; }).join('') +
        cloud(34, 44, .9);
      break;
    case 'ice':
      fg = `<ellipse cx="87.4" cy="${h - 16}" rx="92" ry="26" fill="#fff" opacity=".7"/>` +
        `<path class="dc-line" fill="none" opacity=".6" d="M40 ${h - 18}c18-14 38-14 47.4 0 9.4-14 29.4-14 47.4 0-12 10-30 12-47.4 4-17.4 8-35.4 6-47.4-4Z"/>` +
        spark(30, 30, .9) + spark(150, 46, 1.1) + spark(120, 18, .6, .7) + dot(60, 22, 1.2, .7) + dot(160, 90, 1, .6);
      break;
    case 'bubbles':
      fg = `<path fill="#fff" opacity=".45" d="M0 ${h - 26}c20-8 40 8 58 0s40-8 58 0 40 8 58.8 0V${h}H0Z"/>` +
        [[24, 40, 4], [32, 58, 2.4], [150, 36, 5], [140, 60, 2.6], [158, 80, 1.8], [18, 90, 2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" class="dc-stroke"/>`).join('');
      break;
    case 'confetti':
      fg = [[20, 28, 20], [44, 14, -30], [150, 26, 45], [132, 52, 10], [160, 84, -20], [16, 76, 60], [70, 20, -10], [108, 14, 30]]
        .map(([x, y, a], i) => `<rect x="${x}" y="${y}" width="5" height="2.4" rx="1" transform="rotate(${a} ${x} ${y})" class="${i % 2 ? 'dc-solid' : 'dc-alt'}"/>`).join('') +
        dot(96, 34, 1.6) + dot(30, 50, 1.2, .7) + dot(146, 102, 1.4, .7);
      break;
    case 'notes':
      fg = ['♪', '♫', '♪', '♬'].map((n, i) => `<text x="${[22, 146, 136, 30][i]}" y="${[34, 30, 72, 82][i]}" font-size="${[14, 16, 10, 10][i]}" class="dc-solid" font-family="serif">${n}</text>`).join('') +
        spark(88, 20, .7, .6);
      break;
    case 'leaves':
      fg = [[20, 40, -30], [154, 34, 30], [150, 80, 60], [26, 92, -60]].map(([x, y, a]) =>
        `<path transform="translate(${x} ${y}) rotate(${a}) scale(1.3)" class="dc-solid" d="M0 8C-6 2-5-6 0-10 5-6 6 2 0 8Z"/><path transform="translate(${x} ${y}) rotate(${a}) scale(1.3)" stroke="#fff" stroke-width=".5" fill="none" d="M0 8V-8"/>`).join('');
      break;
    case 'question':
      fg = ['?', '?', '!', '?'].map((n, i) => `<text x="${[20, 148, 138, 34][i]}" y="${[40, 36, 80, 86][i]}" font-size="${[20, 24, 12, 12][i]}" class="dc-solid" font-family="EB Garamond, serif" font-style="italic">${n}</text>`).join('');
      break;
    case 'rain':
      fg = cloud(42, 26, 1.1) + [[34, 40], [44, 46], [54, 40], [38, 54]].map(([x, y]) => `<path class="dc-solid" d="M${x} ${y}c-1.4 2.2-1.6 3.6 0 4.2 1.6-.6 1.4-2 0-4.2Z"/>`).join('') +
        `<circle class="dc-alt" cx="142" cy="32" r="10"/>` + heart(150, 74, 1.1);
      break;
    case 'moon':
      fg = `<path fill="#f6e3a6" d="M146 18a16 16 0 1 0 12 26 13 13 0 1 1-12-26Z"/>` +
        [[24, 24, .8], [56, 14, .5], [98, 26, .6], [20, 70, .5], [122, 60, .4], [164, 86, .5], [70, 44, .35]].map(([x, y, s]) => spark(x, y, s, .9)).join('');
      break;
    case 'stars':
      fg = spark(24, 30, 1.1) + spark(150, 26, .9) + spark(140, 72, .6, .7) + spark(32, 84, .6, .7) + dot(96, 18, 1.3, .7) + dot(64, 30, 1, .5);
      break;
    case 'frame':
      return `<svg class="bp-svg" viewBox="0 0 174.8 ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
        `<rect x="8" y="8" width="158.8" height="${h - 16}" rx="4" fill="none" class="dc-stroke"/>` +
        `<ellipse class="dc-ground" cx="87.4" cy="${h - 52}" rx="44" ry="3.6"/><g class="dc">${heart(87.4, 22, .8)}</g></svg>`;
    case 'sparkles':
    default:
      fg = spark(24, 34, 1) + spark(150, 30, 1.2) + spark(140, 76, .6, .7) + spark(30, 84, .7, .7) + dot(96, 20, 1.2, .6);
  }
  return `<svg class="bp-svg" viewBox="0 0 174.8 ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${arch(h)}${ground}<g class="dc">${fg}</g></svg>`;
}
