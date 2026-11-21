// Обложка: фон + персонажи в позах + декоративные слои + название.
// Координаты в данных заданы в пикселях для обложки шириной 174.8px (так было на старом сайте),
// здесь они пересчитываются в доли ширины — обложка одинаково выглядит в любом размере.
import { figure } from './hero.js';

/** Какой герой стоит в каком месте обложки с учётом «поменять местами» и «кто один на обложке». */
export function slotsFor(cover, heroes, choice = {}) {
  const g = heroes.giver, r = heroes.receiver;
  if (!cover.receiver) {
    const who = choice.solo === 'receiver' ? r : g;
    return [{ slot: cover.giver, hero: who }];
  }
  const swap = !!choice.swap;
  return [
    { slot: cover.giver, hero: swap ? r : g },
    { slot: cover.receiver, hero: swap ? g : r },
  ];
}

// Кисть вытянутой руки в позе 6 (объятие за талию), координаты кадра 2855×3305 без отражения
const HUG_HAND = [560, 1630, 220, 240];

function slotRole(cover, slot) {
  return slot === cover.giver ? 'giver' : 'receiver';
}

export function coverText(cover, heroes, choice = {}) {
  if (choice.text) return choice.text;
  return cover.text || '';
}

export function renderCover(catalog, cover, heroes, choice = {}, opts = {}) {
  const ref = catalog.coverRef;
  const W = ref.w;
  const el = document.createElement('div');
  el.className = 'cover';
  el.style.aspectRatio = `${ref.w} / ${ref.h}`;

  const bg = catalog.assets[cover.bg];
  if (bg) {
    const img = document.createElement('img');
    img.className = 'cover-bg';
    img.alt = '';
    img.src = bg[0];
    if (opts.lazy) img.loading = 'lazy';
    el.appendChild(img);
  }
  const heroWraps = [];
  for (const { slot, hero } of slotsFor(cover, heroes, choice)) {
    if (!slot || !hero) continue;
    const [sw] = ref.sizes[slot.size] || ref.sizes.original;
    const wrap = document.createElement('div');
    wrap.className = 'cover-hero';
    wrap.style.left = `${(slot.x / W) * 100}%`;
    wrap.style.top = `calc(${(slot.y / W) * 100} * var(--cw))`;
    wrap.style.width = `${(sw / W) * 100}%`;
    if (slot.flip) wrap.style.transform = 'scaleX(-1)';
    const extra = (cover.heroProps || {})[slotRole(cover, slot)] || [];
    wrap.appendChild(figure(catalog, hero, { pose: slot.pose, lazy: opts.lazy, extra }));
    el.appendChild(wrap);
    heroWraps.push({ wrap, slot, hero });
  }
  // Объятия (поза 6 у обоих): рука героя, стоящего позади, лежит на талии второго — показываем её поверх
  if (heroWraps.length === 2 && heroWraps.every((w) => w.slot.pose === 6)) {
    const back = heroWraps[0];
    const [hx, hy, hw, hh] = HUG_HAND;
    const { w: FW, h: FH } = catalog.frame;
    const hand = back.wrap.cloneNode(true);
    hand.classList.add('cover-hand');
    const left = hx / FW * 100; // отражение задано у обёртки, внутри фигура не отражена
    hand.firstChild.classList.remove('is-loading');
    hand.firstChild.style.clipPath = `inset(${hy / FH * 100}% ${100 - left - hw / FW * 100}% ${100 - (hy + hh) / FH * 100}% ${left}%)`;
    el.appendChild(hand);
  }
  for (const pr of cover.props || []) {
    const img = document.createElement('img');
    img.className = pr.layer === 'back' ? 'cover-stack is-back' : 'cover-stack';
    img.alt = '';
    img.src = pr.src;
    el.appendChild(img);
  }
  // Декоративные слои лежат ПОВЕРХ героев: облака, стрелки часов, яблоки, лук.
  // Для предметов «в руках» (зонт) задаётся stackFix: сдвиг {dx, dy} в % обложки и полосы front —
  // какие части (в % высоты слоя) рисуются поверх героев; остальное — позади, под рукой и головами.
  const fixes = catalog.stackFix || {};
  const stackImg = (k, cls, clip) => {
    const a = catalog.assets[k];
    if (!a) return;
    const f = fixes[k];
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.src = a[0];
    if (opts.lazy) img.loading = 'lazy';
    if (f && (f.dx || f.dy)) img.style.transform = `translate(${f.dx || 0}%, ${f.dy || 0}%)`;
    if (clip) img.style.clipPath = clip;
    el.appendChild(img);
  };
  for (const k of cover.stackables) {
    const f = fixes[k];
    if (!f) { stackImg(k, 'cover-stack'); continue; }
    stackImg(k, 'cover-stack is-back');
    for (const [a, b] of f.front || []) stackImg(k, 'cover-stack', `inset(${a}% 0 ${100 - b}% 0)`);
  }
  const text = coverText(cover, heroes, choice);
  if (text) {
    const t = document.createElement('div');
    t.className = 'cover-title';
    t.textContent = text;
    t.style.color = cover.color || '#fff';
    t.style.top = `calc(${(cover.textY / W) * 100} * var(--cw))`;
    if (cover.textX) t.style.marginLeft = `calc(${(cover.textX / W) * 100} * var(--cw))`;
    el.appendChild(t);
  }
  return el;
}
