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
  for (const { slot, hero } of slotsFor(cover, heroes, choice)) {
    if (!slot || !hero) continue;
    const [sw] = ref.sizes[slot.size] || ref.sizes.original;
    const wrap = document.createElement('div');
    wrap.className = 'cover-hero';
    wrap.style.left = `${(slot.x / W) * 100}%`;
    wrap.style.top = `calc(${(slot.y / W) * 100} * var(--cw))`;
    wrap.style.width = `${(sw / W) * 100}%`;
    if (slot.flip) wrap.style.transform = 'scaleX(-1)';
    wrap.appendChild(figure(catalog, hero, { pose: slot.pose, lazy: opts.lazy }));
    el.appendChild(wrap);
  }
  // Декоративные слои лежат ПОВЕРХ героев: зонт, облака, стрелки часов, яблоки
  for (const k of cover.stackables) {
    const a = catalog.assets[k];
    if (!a) continue;
    const img = document.createElement('img');
    img.className = 'cover-stack';
    img.alt = '';
    img.src = a[0];
    if (opts.lazy) img.loading = 'lazy';
    el.appendChild(img);
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
