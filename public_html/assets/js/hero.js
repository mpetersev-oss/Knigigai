// Сборка персонажа из слоёв.
// Все картинки нарисованы в одном кадре 2855×3305, поэтому каждая вещь
// ставится по своим координатам внутри кадра — ничего не «прыгает».

export const Z = {
  body: 0, underwear: 1, shoes: 4, shoesOver: 6.5, pants: 6, top: 7, bodice: 8, jacket: 8.5,
  face: 9, mouth: 10, nose: 11, eyes: 12, eyebrows: 12.5, beard: 13, hair: 14, arms: 14.5, glasses: 15, hat: 16,
};

// Какой слой рук нужен поверх одежды в позах, где руки лежат перед телом:
// без рукавов — руки целиком, короткий рукав — предплечья, длинный — только кисти.
const ARMS_BY_SLEEVE = { none: 'top', short: 'shirt', long: 'jacket' };

function sleeveOf(hero, catalog) {
  if (hero.jacket || hero.bodice) return 'long';
  const t = catalog && (catalog.items.tops || []).find((i) => i.key === hero.top);
  return (t && t.sleeve) || 'long';
}

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
    // Новый герой — в нижнем белье: одежду пользователь выбирает сам
    top: null, jacket: null, bodice: null, pants: null, shoes: null,
    glasses: null, hat: null,
  };
}

/** Переключение пола: подставляем подходящие глаза и верх, убираем бороду. */
export function setGender(hero, gender, catalog) {
  const h = { ...hero, gender };
  const d = DEFAULTS[gender];
  if (!h.eyes || !h.eyes.startsWith(gender + '-')) h.eyes = d.eyes;
  const okTop = (catalog.items.tops || []).some((t) => t.key === h.top && (t.gender === 'any' || t.gender === gender));
  if (h.top && !okTop) h.top = null;
  if (gender === 'male') h.bodice = null;
  if (gender === 'female') h.beard = null;
  return h;
}

// Высокая обувь (сапоги, ботинки) надевается поверх штанов — кроме широких брюк, которые её закрывают
const BOOTS = new Set(['shoe-8', 'shoe-9', 'shoe-10', 'shoe-11', 'shoe-27']);
const WIDE_PANTS = new Set(['pants-4', 'pants-5', 'pants-14', 'pants-15']);
function shoesOverPants(hero) {
  return BOOTS.has(hero.shoes) && !WIDE_PANTS.has(hero.pants);
}

/** Одет ли герой: верх, низ и обувь (ступни нарисованы только в обуви). Без этого на обложку нельзя. */
export function hasOutfit(hero) {
  return !!(hero && (hero.top || hero.jacket || hero.bodice) && hero.pants && hero.shoes);
}

function outfitFallback(hero) {
  const d = DEFAULTS[hero.gender] || DEFAULTS.female;
  return { top: hero.top || (hero.jacket || hero.bodice ? null : d.top), pants: hero.pants || d.pants, shoes: hero.shoes || d.shoes };
}

/**
 * Список слоёв персонажа: [{key, z}].
 * pose = номер позы (обложки, страницы) или null — стоячий персонаж из редактора.
 */
export function layersFor(hero, pose = null, catalog = null) {
  const p = pose ? `p${pose}:` : 'e:';
  const L = [];
  const add = (key, z) => key && L.push({ key: p + key, z });
  const face = pose && Number(hero.face) === 6 ? 5 : hero.face; // в позах нет 6-й формы лица
  const dressed = hasOutfit(hero);
  // Белья в позах нет: если герой не одет, на обложке надеваем базовый комплект
  if (pose && !dressed) hero = { ...hero, ...outfitFallback(hero) };

  // Тело нарисовано без одежды; в редакторе, пока вещь не выбрана, показываем бельё
  add(`body-${hero.tone}`, Z.body);
  if (!pose) {
    if (!hero.pants) add('underwear-bottom', Z.underwear);
    if (hero.gender === 'female' && !hero.top && !hero.jacket && !hero.bodice) add('underwear-bra', Z.underwear);
  }
  // В некоторых позах обувь уже нарисована на теле (коньки) — обычную обувь не надеваем
  const builtinShoes = pose && catalog && (catalog.builtinShoes || []).includes(Number(pose));
  if (!builtinShoes) add(hero.shoes, shoesOverPants(hero) ? Z.shoesOver : Z.shoes);
  add(hero.pants, Z.pants);
  add(hero.top, Z.top);
  add(hero.bodice, Z.bodice);
  add(hero.jacket, Z.jacket);
  add(`skin_tone_${hero.tone}_face_${face}`, Z.face);
  const faceKey = p + `skin_tone_${hero.tone}_face_${face}`;
  add(hero.mouth, Z.mouth);
  add(hero.nose, Z.nose);
  add(hero.eyes, Z.eyes);
  add(`${hero.gender}-eyebrows-${BROW[hero.hairColor] || 4}`, Z.eyebrows);
  // Борода нарисована под одну форму лица — обрезаем её по контуру выбранного лица, чтобы не вылезала
  if (hero.gender === 'male' && hero.beard) L.push({ key: p + hero.beard, z: Z.beard, clipTo: faceKey });
  if (hero.hairStyle) add(`${hero.hairColor}-${hero.hairStyle}`, Z.hair);
  if (pose) add(`top-arms-${ARMS_BY_SLEEVE[sleeveOf(hero, catalog)]}-tone-${hero.tone}`, Z.arms);
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
  const box = (x, y, w, h) => `left:${(x / FW) * 100}%;top:${(y / FH) * 100}%;width:${(w / FW) * 100}%;height:${(h / FH) * 100}%;`;
  // Персонаж показывается целиком, когда загрузились все слои (а не по кусочкам)
  let pending = 0;
  const done = () => { if (--pending <= 0) el.classList.remove('is-loading'); };
  const mkImg = (url) => {
    const img = document.createElement('img');
    pending++;
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', () => { img.style.display = 'none'; done(); }, { once: true });
    img.alt = '';
    img.decoding = 'async';
    if (opts.lazy) img.loading = 'lazy';
    img.draggable = false;
    img.src = url;
    return img;
  };
  for (const { key, z, clipTo } of layersFor(hero, pose, catalog)) {
    const a = catalog.assets[key];
    if (!a) continue;
    const [url, x, y, w, h] = a;
    const m = clipTo && catalog.assets[clipTo];
    if (m && m[0].startsWith('/')) {
      // Слой видим только внутри силуэта другого слоя (борода — внутри лица)
      const [mu, mx, my, mw, mh] = m;
      const wrap = document.createElement('div');
      wrap.className = 'fig-mask';
      wrap.style.cssText = box(mx, my, mw, mh) + `z-index:${Math.round(z * 10)};` +
        `-webkit-mask:url("${mu}") 0 0/100% 100% no-repeat;mask:url("${mu}") 0 0/100% 100% no-repeat`;
      const img = mkImg(url);
      img.style.cssText = `left:${((x - mx) / mw) * 100}%;top:${((y - my) / mh) * 100}%;width:${(w / mw) * 100}%;height:${(h / mh) * 100}%`;
      wrap.appendChild(img);
      el.appendChild(wrap);
      continue;
    }
    const img = mkImg(url);
    img.style.cssText = box(x, y, w, h) + `z-index:${Math.round(z * 10)}`;
    el.appendChild(img);
  }
  // Если всё уже в кеше браузера (редактор при переключении вещей), показываем сразу, без мигания
  if (pending && [...el.querySelectorAll('img')].some((i) => !i.complete)) {
    el.classList.add('is-loading');
    setTimeout(() => el.classList.remove('is-loading'), 6000); // на случай очень медленной сети
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
