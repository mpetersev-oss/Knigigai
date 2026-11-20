// Сборка персонажа из слоёв.
// Все картинки нарисованы в одном кадре 2855×3305, поэтому каждая вещь
// ставится по своим координатам внутри кадра — ничего не «прыгает».

export const Z = {
  body: 0, shoes: 4, pants: 6, top: 7, bodice: 8, jacket: 8.5,
  face: 9, mouth: 10, nose: 11, eyes: 12, eyebrows: 12.5, beard: 13, hair: 14, glasses: 15, hat: 16,
};

// Номер бровей зависит от цвета волос (так нарисованы исходники)
export const BROW = { brown: 1, 'light-blonde': 2, 'dark-blonde': 3, black: 4, silver: 5, ginger: 6 };

export const HAIR_COLORS = [
  ['black', 'Чёрные', '#1f1b1a'], ['brown', 'Каштановые', '#6b3f26'], ['dark-blonde', 'Русые', '#a97c4f'],
  ['light-blonde', 'Блонд', '#e6c88f'], ['ginger', 'Рыжие', '#c2562b'], ['silver', 'Седые', '#c9c9cf'],
];

const DEFAULTS = {
  female: { eyes: 'female-eyes-1', nose: 'nose-1', mouth: 'mouth-1', hairColor: 'black', hairStyle: 2, top: 'top-4', pants: 'pants-4', shoes: 'shoe-3' },
  male: { eyes: 'male-eyes-2', nose: 'nose-1', mouth: 'mouth-1', hairColor: 'black', hairStyle: 5, top: 'top-1', pants: 'pants-1', shoes: 'shoe-1' },
};

export function newHero(name, gender) {
  const d = DEFAULTS[gender] || DEFAULTS.female;
  return {
    name, gender, tone: '1', face: 1,
    hairColor: d.hairColor, hairStyle: d.hairStyle,
    eyes: d.eyes, nose: d.nose, mouth: d.mouth, beard: null,
    top: d.top, jacket: null, bodice: null, pants: d.pants, shoes: d.shoes,
    glasses: null, hat: null,
  };
}

/** Переключение пола: подставляем подходящие глаза и верх, убираем бороду. */
export function setGender(hero, gender, catalog) {
  const h = { ...hero, gender };
  const d = DEFAULTS[gender];
  if (!h.eyes || !h.eyes.startsWith(gender + '-')) h.eyes = d.eyes;
  const okTop = (catalog.items.tops || []).some((t) => t.key === h.top && (t.gender === 'any' || t.gender === gender));
  if (!okTop) h.top = d.top;
  if (gender === 'female') h.beard = null;
  return h;
}

/**
 * Список слоёв персонажа: [{key, z}].
 * pose = номер позы (обложки, страницы) или null — стоячий персонаж из редактора.
 */
export function layersFor(hero, pose = null) {
  const p = pose ? `p${pose}:` : 'e:';
  const L = [];
  const add = (key, z) => key && L.push({ key: p + key, z });
  const face = pose && Number(hero.face) === 6 ? 5 : hero.face; // в позах нет 6-й формы лица

  // Тело уже нарисовано в белье, поэтому отдельные слои белья не нужны
  add(`body-${hero.tone}`, Z.body);
  add(hero.shoes, Z.shoes);
  add(hero.pants, Z.pants);
  add(hero.top, Z.top);
  add(hero.bodice, Z.bodice);
  add(hero.jacket, Z.jacket);
  add(`skin_tone_${hero.tone}_face_${face}`, Z.face);
  add(hero.mouth, Z.mouth);
  add(hero.nose, Z.nose);
  add(hero.eyes, Z.eyes);
  add(`${hero.gender}-eyebrows-${BROW[hero.hairColor] || 4}`, Z.eyebrows);
  if (hero.gender === 'male') add(hero.beard, Z.beard);
  if (hero.hairStyle) add(`${hero.hairColor}-${hero.hairStyle}`, Z.hair);
  add(hero.glasses, Z.glasses);
  add(hero.hat, Z.hat);
  return L;
}

/** Есть ли у позы синхронизированные слои; иначе рисуем стоячего персонажа. */
export function poseReady(catalog, pose) {
  return !!(pose && catalog.sync && catalog.sync.poses && catalog.sync.poses[pose] > 0);
}

/**
 * Рисует персонажа. Возвращает элемент .fig с соотношением сторон кадра.
 * opts: { pose, lazy }
 */
export function figure(catalog, hero, opts = {}) {
  const { w: FW, h: FH } = catalog.frame;
  const pose = opts.pose && poseReady(catalog, opts.pose) ? opts.pose : null;
  const el = document.createElement('div');
  el.className = 'fig';
  el.style.aspectRatio = `${FW} / ${FH}`;
  if (!hero) return el;
  for (const { key, z } of layersFor(hero, pose)) {
    const a = catalog.assets[key];
    if (!a) continue;
    const [url, x, y, w, h] = a;
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    if (opts.lazy) img.loading = 'lazy';
    img.draggable = false;
    img.src = url;
    img.style.cssText = `left:${(x / FW) * 100}%;top:${(y / FH) * 100}%;width:${(w / FW) * 100}%;height:${(h / FH) * 100}%;z-index:${Math.round(z * 10)}`;
    el.appendChild(img);
  }
  return el;
}

// Области кадра для миниатюр (в пикселях кадра 2855×3305)
export const REGIONS = {
  full: [760, 260, 1340, 2760],
  hair: [930, 280, 1000, 1180],
  head: [1020, 300, 820, 900],
  face: [1150, 680, 560, 520],
  torso: [870, 1020, 1120, 1240],
  legs: [1000, 1580, 860, 1180],
  feet: [960, 2480, 940, 480],
};

/** Миниатюра: персонаж, обрезанный до нужной области. */
export function cropFigure(catalog, hero, region, opts = {}) {
  const { w: FW } = catalog.frame;
  const [rx, ry, rw, rh] = typeof region === 'string' ? REGIONS[region] : region;
  const box = document.createElement('div');
  box.className = 'crop';
  box.style.aspectRatio = `${rw} / ${rh}`;
  const fig = figure(catalog, hero, { lazy: true, ...opts });
  fig.style.position = 'absolute';
  fig.style.width = `${(FW / rw) * 100}%`;
  fig.style.left = `${(-rx / rw) * 100}%`;
  fig.style.top = `${(-ry / rh) * 100}%`;
  box.appendChild(fig);
  return box;
}

/** Случайный персонаж (кнопка «Удиви меня»). */
export function randomize(hero, catalog) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const g = hero.gender;
  const of = (cat) => (catalog.items[cat] || []).filter((i) => !i.gender || i.gender === g || i.gender === 'any').map((i) => i.key);
  const h = { ...hero };
  h.tone = pick(catalog.tones).key;
  h.face = 1 + Math.floor(Math.random() * 7);
  h.hairColor = pick(HAIR_COLORS)[0];
  h.hairStyle = 1 + Math.floor(Math.random() * 11);
  h.eyes = pick(of('eyes'));
  h.nose = pick(of('nose'));
  h.mouth = pick(of('mouth'));
  h.top = pick(of('tops'));
  h.jacket = Math.random() < 0.3 ? pick(of('jackets')) : null;
  h.bodice = null;
  h.pants = pick(of('pants'));
  h.shoes = pick(of('shoes'));
  h.glasses = Math.random() < 0.25 ? pick(of('glasses')) : null;
  h.hat = Math.random() < 0.2 ? pick(of('hats')) : null;
  h.beard = g === 'male' && Math.random() < 0.4 ? pick(of('beard')) : null;
  return h;
}
