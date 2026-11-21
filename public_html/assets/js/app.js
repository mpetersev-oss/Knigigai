import { h, clear, toast, debounce, rub } from './dom.js';
import { api, loadCatalog, myBooks } from './api.js';
import { figure, cropFigure, newHero, setGender, randomize, hasOutfit, HAIR_COLORS } from './hero.js';
import { renderCover } from './cover.js';
import { renderPage, fillText, defaultPages, availableTemplates, templateById, defaultText, bookSpreads, cleanPages, defaultCloud } from './pages.js';

const root = document.getElementById('app');
const state = { catalog: null, book: null };

const OCCASIONS = [
  ['День Рождения', 'День рождения', 'Праздник, который бывает раз в году'],
  ['наш праздник', 'Наш праздник', 'Годовщина, первое свидание, просто так'],
  ['свадьба', 'Свадьба', 'Главный день — и всё, что было до него'],
  ['8 марта', '8 Марта', 'Для самой любимой'],
  ['выпускной', 'Выпускной', 'Новая глава начинается'],
];
const RELATIONS = [
  ['partner', 'Любимый человек'], ['spouse', 'Муж или жена'], ['friend', 'Друг или подруга'],
  ['mom', 'Мама'], ['dad', 'Папа'], ['sibling', 'Брат или сестра'], ['child', 'Ребёнок'], ['other', 'Кто-то особенный'],
];
const ROLE = {
  giver: { title: 'Автор', who: 'Это вы', ask: 'Как вас зовут?' },
  receiver: { title: 'Получатель', who: 'Тот, кому дарите', ask: 'Как зовут того, кому дарите книгу?' },
};

// Герои для витрины на главной
const DEMO = {
  giver: { name: 'Аня', gender: 'female', tone: '1', face: 3, hairColor: 'brown', hairStyle: 2, eyes: 'female-eyes-1', nose: 'nose-1', mouth: 'mouth-2', beard: null, top: 'top-6', jacket: null, bodice: null, pants: 'pants-4', shoes: 'shoe-3', glasses: null, hat: null },
  receiver: { name: 'Миша', gender: 'male', tone: '2', face: 1, hairColor: 'dark-blonde', hairStyle: 5, eyes: 'male-eyes-2', nose: 'nose-2', mouth: 'mouth-1', beard: 'beard-2', top: 'top-1', jacket: 'top-19', bodice: null, pants: 'pants-1', shoes: 'shoe-1', glasses: null, hat: null },
};

// ---------------- Роутер ----------------
export function go(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  if (url.pathname === location.pathname && url.hash) {
    document.querySelector(url.hash)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  go(url.pathname + url.hash);
});
window.addEventListener('popstate', render);

let leaveHooks = [];
function onLeave(fn) { leaveHooks.push(fn); }

async function render() {
  for (const fn of leaveHooks.splice(0)) { try { fn(); } catch { /* ignore */ } }
  document.body.classList.remove('no-scroll');
  const path = location.pathname.replace(/\/+$/, '') || '/';
  let m;
  try {
    if (!state.catalog) {
      if (path !== '/') showLoading();
      state.catalog = await loadCatalog();
    }
    if (path === '/') return pageHome();
    if (path === '/create') return createBook();
    if (path === '/books') return pageMyBooks();
    if (path === '/terms') return pageTerms();
    if ((m = path.match(/^\/order\/([a-zA-Z0-9]+)$/))) return pageOrder(m[1]);
    if ((m = path.match(/^\/print\/order\/([a-zA-Z0-9]+)\/(block|cover)$/))) {
      const snap = await api.orderSnapshot(m[1]);
      return pagePrint({ token: snap.order.book, data: snap.data }, m[2], `Заказ №${snap.order.number}`);
    }
    if ((m = path.match(/^\/b\/([a-zA-Z0-9]+)(?:\/(.*))?$/))) {
      const book = await loadBook(m[1]);
      const sub = m[2] || '';
      if (sub === '') return pageSummary(book);
      if (sub === 'heroes') return pageHeroes(book);
      if (sub === 'hero/giver' || sub === 'hero/receiver') return pageBuilder(book, sub.split('/')[1]);
      if (sub === 'occasion') return pageOccasion(book);
      if (sub === 'cover') return pageCovers(book);
      if (sub === 'pages') return pagePages(book);
      if (sub === 'order') return pageCheckout(book);
      if (sub === 'print/block' || sub === 'print/cover') return pagePrint(book, sub.split('/')[1], 'Черновик');
    }
    pageNotFound();
  } catch (err) {
    pageError(err);
  }
}

async function loadBook(token) {
  if (state.book && state.book.token === token) return state.book;
  state.book = await api.getBook(token);
  myBooks.add(token);
  return state.book;
}

async function saveBook(patch) {
  const b = await api.patchBook(state.book.token, patch);
  state.book = b;
  return b;
}

function showLoading() {
  clear(root).appendChild(h('div', { class: 'loading-screen' }, h('div', { class: 'spinner' }), h('p', null, 'Загружаем…')));
}

// ---------------- Общие куски ----------------
function logo() {
  return h('a', { href: '/', 'data-link': true, class: 'logo', 'aria-label': 'Книгигай — на главную' }, 'книгигай');
}

function nav(opts = {}) {
  const links = opts.home ? [
    ['#how', 'Как это работает'], ['#covers', 'Обложки'], ['#inside', 'Внутри'], ['#book', 'Книга'], ['#faq', 'Вопросы'],
  ] : [];
  return h('header', { class: 'nav' },
    h('div', { class: 'nav-pill' },
      logo(),
      h('nav', { class: 'nav-links' }, links.map(([href, t]) => h('a', { href: href, 'data-link': true }, t))),
      myBooks.list().length ? h('a', { href: '/books', 'data-link': true, class: 'nav-my' }, 'Мои книги') : null,
      opts.cta === false ? null : h('a', { href: '/create', 'data-link': true, class: 'btn btn-dark btn-sm' }, 'Создать книгу'),
    ));
}

function stepper(book, active) {
  const d = book.data;
  const steps = [
    ['heroes', 'Герои', !!(d.heroes.giver && d.heroes.receiver)],
    ['occasion', 'Повод', !!d.occasion],
    ['cover', 'Обложка', !!d.cover],
    ['pages', 'Страницы', !!(d.pages && d.pages.items.length)],
    ['order', 'Заказ', !!book.order && book.order.status !== 'new' && book.order.status !== 'pending' && book.order.status !== 'canceled'],
  ];
  return h('ol', { class: 'stepper' }, steps.map(([s, t, done], i) => {
    const cls = `step ${s === active ? 'is-active' : ''} ${done ? 'is-done' : ''}`;
    const inner = [h('span', { class: 'step-n' }, done ? '✓' : String(i + 1)), h('span', null, t)];
    return h('li', { class: cls }, s ? h('a', { href: `/b/${book.token}/${s}`, 'data-link': true }, inner) : h('span', { class: 'step-soon' }, inner));
  }));
}

function flowHeader(book, active) {
  return h('header', { class: 'flow-head' },
    h('div', { class: 'flow-head-in' },
      logo(),
      stepper(book, active),
      h('a', { href: `/b/${book.token}`, 'data-link': true, class: 'flow-save', title: 'Книга сохраняется автоматически' }, h('span', { class: 'dot' }), 'Сохранено'),
    ));
}

function page(...children) {
  clear(root);
  const el = h('main', { class: 'page' }, children);
  root.appendChild(el);
  window.scrollTo(0, 0);
  return el;
}

function heroTile(hero, opts = {}) {
  const c = state.catalog;
  return h('div', { class: `tile ${opts.small ? 'tile-sm' : ''}` },
    h('div', { class: 'tile-stage' }, cropFigure(c, hero || ghostHero(opts.gender), 'full', {})),
  );
}

function ghostHero(gender = 'female') {
  // Силуэт для пустого места: тело без одежды и волос
  return { name: '', gender, tone: '1', face: 1, hairColor: 'black', hairStyle: null, eyes: gender === 'male' ? 'male-eyes-2' : 'female-eyes-1', nose: 'nose-1', mouth: 'mouth-1', top: null, pants: null, shoes: null };
}

// ---------------- Главная ----------------
function pageHome() {
  const c = state.catalog;
  const demoCovers = pickDemoCovers(c);

  const hero = h('section', { class: 'home-hero' },
    h('div', { class: 'home-hero-text' },
      h('p', { class: 'eyebrow' }, 'Персональная книга-подарок'),
      h('h1', { class: 'display' }, 'Книга, в которой ', h('em', null, 'главные герои'), ' — вы'),
      h('p', { class: 'lead' }, 'Создайте персонажей, похожих на вас и близкого человека, выберите обложку — и мы напечатаем книгу о вашей истории в твёрдом переплёте.'),
      h('div', { class: 'btn-row' },
        h('a', { href: '/create', 'data-link': true, class: 'btn btn-dark btn-lg' }, 'Создать книгу'),
        h('a', { href: '#how', 'data-link': true, class: 'btn btn-soft btn-lg' }, 'Как это работает'),
      ),
      h('p', { class: 'hero-note' }, `${rub(c.price)} · бесплатная доставка · 15 минут на создание`),
    ),
    h('div', { class: 'home-hero-art' },
      h('div', { class: 'art-orb' }),
      h('div', { class: 'art-duo' },
        h('div', { class: 'art-fig art-fig-a' }, cropFigure(c, DEMO.giver, 'full')),
        h('div', { class: 'art-fig art-fig-b' }, cropFigure(c, DEMO.receiver, 'full')),
      ),
      demoCovers[0] ? h('div', { class: 'art-cover' }, renderCover(c, demoCovers[0], DEMO)) : null,
      h('div', { class: 'art-tag' }, h('span', null, 'Твёрдый переплёт'), h('b', null, '215 × 140 мм')),
    ),
  );

  const marquee = h('div', { class: 'marquee', 'aria-hidden': 'true' },
    h('div', { class: 'marquee-track' }, [...Array(2)].map(() =>
      ['День рождения', 'Годовщина', 'Свадьба', '8 Марта', 'Выпускной', 'Просто так', 'Для мамы', 'Для лучшей подруги'].map((t) => h('span', null, t, h('i', null, '✦'))))),
  );

  const how = h('section', { class: 'section', id: 'how' },
    h('div', { class: 'section-head' },
      h('p', { class: 'eyebrow' }, 'Как это работает'),
      h('h2', { class: 'h2' }, 'Три шага до книги, которую будут перечитывать'),
    ),
    h('div', { class: 'cards3' },
      howCard('01', 'Создайте героев', 'Цвет кожи, причёска, глаза, одежда, очки — соберите персонажей, в которых узнают вас обоих.', cropFigure(c, DEMO.giver, 'head')),
      howCard('02', 'Выберите повод и обложку', 'День рождения, годовщина, свадьба — ваши герои сразу появляются на обложках.', demoCovers[1] ? renderCover(c, demoCovers[1], DEMO, {}, { lazy: true }) : null),
      howCard('03', 'Напишите страницы и получите книгу', 'Выберите сцены, добавьте свои слова — мы напечатаем книгу в твёрдом переплёте и бесплатно доставим.', h('div', { class: 'how-book' }, h('span', null, '215'), h('i', null, '×'), h('span', null, '140'))),
    ),
  );

  const coversSection = h('section', { class: 'section section-tint', id: 'covers' },
    h('div', { class: 'section-head' },
      h('p', { class: 'eyebrow' }, 'Обложки'),
      h('h2', { class: 'h2' }, 'На любой повод — с вашими героями'),
      h('p', { class: 'muted' }, 'Пока это наши герои-примеры. Создайте своих — и они займут их место.'),
    ),
    h('div', { class: 'cover-rail' }, demoCovers.slice(0, 8).map((cv) => h('figure', { class: 'cover-card' },
      renderCover(c, cv, DEMO, {}, { lazy: true }),
      h('figcaption', null, occasionLabel(cv.occasion)),
    ))),
    h('div', { class: 'center' }, h('a', { href: '/create', 'data-link': true, class: 'btn btn-dark' }, 'Собрать свою обложку')),
  );

  const duo = c.book ? availableTemplates(c).filter((t) => t.receiver) : [];
  const tplA = duo.find((t) => t.id === 'travel-8') || duo[0];
  const tplB = duo.find((t) => t.id === 'home-24') || duo[1];
  const inside = tplA && tplB ? h('section', { class: 'section', id: 'inside' },
    h('div', { class: 'inside' },
      h('div', { class: 'inside-spread reveal' },
        h('div', null, renderPage(c, { kind: 'scene', item: { t: tplA.id, text: tplA.text } }, DEMO, { lazy: true, number: 4 })),
        h('div', null, renderPage(c, { kind: 'scene', item: { t: tplB.id, text: tplB.text } }, DEMO, { lazy: true, number: 5 })),
      ),
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Внутри книги'),
        h('h2', { class: 'h2' }, 'Каждая страница — ', h('em', null, 'про\u00a0вас')),
        h('ul', { class: 'inside-list' },
          h('li', null, `${availableTemplates(c).length} готовых сцен: дом, путешествия, кафе, спорт, праздники, музеи и СПА`),
          h('li', null, 'Свои слова на каждой странице — или наши готовые тексты'),
          h('li', null, `От ${c.pageLimits[0] + 2} до ${c.pageLimits[1] + 2} страниц, посвящение и финал`),
        ),
        h('a', { href: '/create', 'data-link': true, class: 'btn btn-dark' }, 'Собрать свою книгу'),
      ),
    ),
  ) : null;

  const reasons = [
    ['Это про вас двоих', 'Не открытка «для всех», а история с вашими лицами, именами и шутками.'],
    ['Выглядит дорого', 'Твёрдый переплёт, плотная мелованная бумага 200 г, яркая печать.'],
    ['Делается за вечер', 'Около 15 минут в конструкторе — сохранять можно в любой момент.'],
    ['Остаётся надолго', 'Книгу не выбрасывают — её ставят на полку и показывают гостям.'],
  ];
  const why = h('section', { class: 'section', id: 'book' },
    h('div', { class: 'why' },
      h('div', { class: 'why-card' },
        h('p', { class: 'serif-sm' }, 'Почему это лучший подарок'),
        h('ul', { class: 'why-list' }, reasons.map(([t, d], i) => h('li', { class: i === 0 ? 'is-on' : '', 'data-i': i }, h('span', null, t), h('small', null, d)))),
      ),
      h('div', { class: 'spec-card' },
        h('div', { class: 'spec-book' }, demoCovers[2] ? renderCover(c, demoCovers[2], DEMO, {}, { lazy: true }) : null),
        h('dl', { class: 'spec' },
          specRow('Формат', '215 × 140 мм'),
          specRow('Переплёт', 'Твёрдый, 220 × 145 мм'),
          specRow('Бумага', 'Мелованная, 200 г/м²'),
          specRow('Доставка', 'Бесплатно, ~5 рабочих дней'),
        ),
        h('div', { class: 'spec-price' }, h('span', null, 'Стоимость'), h('b', null, rub(c.price))),
      ),
    ),
  );

  const faq = h('section', { class: 'section', id: 'faq' },
    h('div', { class: 'section-head' }, h('p', { class: 'eyebrow' }, 'Вопросы'), h('h2', { class: 'h2' }, 'Коротко о главном')),
    h('div', { class: 'faq' }, [
      ['Сколько времени занимает создание?', 'Обычно 15–20 минут. Всё сохраняется автоматически — можно закрыть страницу и вернуться по ссылке.'],
      ['Нужна ли регистрация?', 'Нет. У каждой книги своя секретная ссылка. Чтобы не потерять её, оставьте почту на странице книги.'],
      ['Сколько идёт доставка?', 'Около 5 рабочих дней после оформления заказа. Доставка бесплатная.'],
      ['Доставляете за границу?', 'Да, по запросу — напишите нам, и мы рассчитаем стоимость.'],
      ['Можно поменять героев после выбора обложки?', 'Да, в любой момент до заказа. Изменения сразу появятся на обложке.'],
      ['Можно написать свои тексты?', 'Да. На каждой странице есть готовый текст — его можно оставить, поправить или написать полностью свой.'],
      ['Как оплатить?', 'Онлайн: картой, через СБП, SberPay или ЮMoney на защищённой странице ЮKassa. Чек придёт на почту.'],
    ].map(([q, a]) => h('details', { class: 'faq-item' }, h('summary', null, q, h('i', null)), h('p', null, a)))),
  );

  const footer = h('footer', { class: 'footer' },
    h('div', { class: 'footer-in' },
      h('div', null, logo(), h('p', { class: 'muted' }, 'Персональные книги-подарки')),
      h('div', { class: 'footer-cols' },
        h('div', null, h('b', null, 'Помощь'), c.contactEmail ? h('a', { href: `mailto:${c.contactEmail}` }, c.contactEmail) : null, h('a', { href: '/terms', 'data-link': true }, 'Условия заказа')),
        h('div', null, h('b', null, 'Книга'), h('a', { href: '/create', 'data-link': true }, 'Создать книгу'), h('a', { href: '/books', 'data-link': true }, 'Мои книги')),
      ),
    ),
    h('p', { class: 'footer-legal' }, `© ${new Date().getFullYear()} ООО «Книгигай»`),
  );

  const sticky = h('a', { href: '/create', 'data-link': true, class: 'sticky-cta' }, 'Создать книгу', h('span', null, rub(c.price)));

  page(nav({ home: true }), hero, marquee, how, coversSection, inside, why, faq, footer, sticky);
  root.querySelector('.page').classList.add('page-home');
  wireWhyList();
  wireReveal();
}

function howCard(n, title, text, art) {
  return h('article', { class: 'how-card reveal' },
    h('div', { class: 'how-art' }, art),
    h('span', { class: 'how-n' }, n),
    h('h3', null, title),
    h('p', null, text),
  );
}

function specRow(k, v) { return [h('dt', null, k), h('dd', null, v)]; }

function occasionLabel(o) { return (OCCASIONS.find((x) => x[0] === o) || [o, o])[1]; }

function pickDemoCovers(c) {
  const duo = c.covers.filter((cv) => cv.receiver);
  const solo = c.covers.filter((cv) => !cv.receiver);
  return [...duo, ...solo];
}

function wireWhyList() {
  const items = [...root.querySelectorAll('.why-list li')];
  if (!items.length) return;
  let i = 0;
  const t = setInterval(() => {
    if (!document.body.contains(items[0])) return clearInterval(t);
    items.forEach((li) => li.classList.remove('is-on'));
    i = (i + 1) % items.length;
    items[i].classList.add('is-on');
  }, 2600);
  items.forEach((li, j) => li.addEventListener('mouseenter', () => { items.forEach((x) => x.classList.remove('is-on')); li.classList.add('is-on'); i = j; }));
  onLeave(() => clearInterval(t));
}

function wireReveal() {
  const els = root.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
  onLeave(() => io.disconnect());
}

// ---------------- Создание книги ----------------
async function createBook() {
  showLoading();
  const book = await api.createBook();
  state.book = book;
  myBooks.add(book.token);
  go(`/b/${book.token}/heroes`, true);
}

// ---------------- Герои ----------------
function pageHeroes(book) {
  const c = state.catalog;
  const d = book.data;
  const card = (role) => {
    const hero = d.heroes[role];
    return h('a', { href: `/b/${book.token}/hero/${role}`, 'data-link': true, class: `hero-card ${hero ? 'is-done' : ''}` },
      h('div', { class: 'hero-card-stage' }, cropFigure(c, hero || ghostHero(role === 'giver' ? 'female' : 'male'), 'full'), hero ? null : h('div', { class: 'hero-card-plus' }, '+')),
      h('div', { class: 'hero-card-meta' },
        h('p', { class: 'eyebrow' }, ROLE[role].title),
        h('h3', null, hero ? hero.name : ROLE[role].who),
        h('span', { class: `btn ${hero ? 'btn-soft' : 'btn-dark'} btn-sm` }, hero ? 'Изменить' : 'Создать'),
      ),
    );
  };
  const ready = hasOutfit(d.heroes.giver) && hasOutfit(d.heroes.receiver);
  page(
    flowHeader(book, 'heroes'),
    h('section', { class: 'flow' },
      h('div', { class: 'flow-title' },
        h('h1', { class: 'h1' }, 'Начнём с главного — ', h('em', null, 'героев')),
        h('p', { class: 'muted' }, 'Создайте двух персонажей: себя и того, кому дарите книгу.'),
      ),
      h('div', { class: 'hero-cards' }, card('giver'), h('div', { class: 'hero-and' }, '&'), card('receiver')),
      h('div', { class: 'flow-actions' },
        h('a', { href: `/b/${book.token}/occasion`, 'data-link': true, class: `btn btn-dark btn-lg ${ready ? '' : 'is-disabled'}`, 'aria-disabled': ready ? null : 'true', onclick: (e) => { if (!ready) { e.preventDefault(); e.stopPropagation(); toast('Сначала создайте и оденьте обоих героев'); } } }, 'Дальше: повод'),
      ),
    ),
  );
}

// ---------------- Конструктор ----------------
const TABS = [
  { id: 'tone', label: 'Кожа', region: 'head' },
  { id: 'face', label: 'Лицо', region: 'head' },
  { id: 'hair', label: 'Волосы', region: 'hair' },
  { id: 'eyes', label: 'Глаза', field: 'eyes', cat: 'eyes', region: 'face' },
  { id: 'nose', label: 'Нос', field: 'nose', cat: 'nose', region: 'face' },
  { id: 'mouth', label: 'Губы', field: 'mouth', cat: 'mouth', region: 'face' },
  { id: 'beard', label: 'Борода', field: 'beard', cat: 'beard', region: 'head', optional: true, only: 'male' },
  { id: 'top', label: 'Верх', field: 'top', cat: 'tops', region: 'torso', optional: true },
  { id: 'jacket', label: 'Куртки', field: 'jacket', cat: 'jackets', region: 'torso', optional: true, clears: 'bodice' },
  { id: 'bodice', label: 'Жакеты', field: 'bodice', cat: 'bodice', region: 'torso', optional: true, clears: 'jacket', only: 'female' },
  { id: 'pants', label: 'Низ', field: 'pants', cat: 'pants', region: 'legs', optional: true },
  { id: 'shoes', label: 'Обувь', field: 'shoes', cat: 'shoes', region: 'feet' },
  { id: 'glasses', label: 'Очки', field: 'glasses', cat: 'glasses', region: 'head', optional: true },
  { id: 'hat', label: 'Шапки', field: 'hat', cat: 'hats', region: 'hair', optional: true },
];

function pageBuilder(book, role) {
  const c = state.catalog;
  let hero = book.data.heroes[role] ? { ...book.data.heroes[role] } : null;
  if (!hero) return askNameGender(book, role, null);

  let tab = 'tone';
  let saving = false;
  const status = h('span', { class: 'b-status' }, 'Сохранено');
  const stage = h('div', { class: 'b-stage-fig' });
  const tabsEl = h('div', { class: 'b-tabs', role: 'tablist' });
  const grid = h('div', { class: 'b-grid' });
  const nameBtn = h('button', { class: 'b-name', type: 'button', onclick: () => askNameGender(book, role, hero) });

  const save = debounce(async () => {
    saving = true;
    status.textContent = 'Сохраняем…';
    status.classList.add('is-busy');
    try {
      await saveBook({ heroes: { [role]: hero } });
      status.textContent = 'Сохранено';
    } catch (e) {
      status.textContent = 'Не сохранено';
      toast(e.message, 'error');
    } finally {
      saving = false;
      status.classList.remove('is-busy');
    }
  }, 600);
  onLeave(() => save.flush());

  const set = (patch) => {
    hero = { ...hero, ...patch };
    drawStage();
    drawGrid();
    save();
  };

  function drawStage() {
    clear(stage).appendChild(cropFigure(c, hero, 'full'));
    nameBtn.textContent = hero.name;
    nameBtn.appendChild(h('i', { class: 'pen' }, '✎'));
  }

  function visibleTabs() {
    return TABS.filter((t) => !t.only || t.only === hero.gender);
  }

  // Вкладки не пересоздаются при выборе — иначе полоса прокрутки прыгает в начало
  function drawTabs() {
    const keep = tabsEl.scrollLeft;
    clear(tabsEl);
    for (const t of visibleTabs()) {
      tabsEl.appendChild(h('button', {
        type: 'button', role: 'tab', class: `b-tab ${t.id === tab ? 'is-on' : ''}`, 'aria-selected': t.id === tab ? 'true' : 'false',
        'data-tab': t.id,
        onclick: (e) => { tab = t.id; markTabs(); drawGrid(); grid.scrollTop = 0; revealTab(e.currentTarget); },
      }, t.label));
    }
    tabsEl.scrollLeft = keep;
    revealTab(tabsEl.querySelector('.is-on'));
  }
  function markTabs() {
    for (const b of tabsEl.children) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }
  function revealTab(b) {
    if (!b) return;
    const l = b.offsetLeft, r = l + b.offsetWidth;
    if (l < tabsEl.scrollLeft + 8) tabsEl.scrollTo({ left: Math.max(0, l - 24), behavior: 'smooth' });
    else if (r > tabsEl.scrollLeft + tabsEl.clientWidth - 8) tabsEl.scrollTo({ left: r - tabsEl.clientWidth + 24, behavior: 'smooth' });
  }

  function option(selected, label, thumb, onPick) {
    return h('button', { type: 'button', class: `opt ${selected ? 'is-on' : ''}`, 'aria-pressed': selected ? 'true' : 'false', 'aria-label': label, title: label, onclick: onPick }, thumb);
  }

  function drawGrid() {
    clear(grid);
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    grid.className = 'b-grid';
    if (t.id === 'tone') {
      grid.classList.add('b-grid-sw');
      c.tones.forEach((tn, i) => grid.appendChild(h('button', {
        type: 'button', class: `swatch-lg ${hero.tone === tn.key ? 'is-on' : ''}`, style: { '--sw': tn.color }, 'aria-label': `Тон кожи ${i + 1}`,
        onclick: () => set({ tone: tn.key }),
      }, h('span'), cropFigure(c, { ...hero, tone: tn.key }, 'head'))));
      return;
    }
    if (t.id === 'face') {
      for (let f = 1; f <= 7; f++) grid.appendChild(option(hero.face === f, `Форма лица ${f}`, cropFigure(c, { ...hero, face: f, hat: null }, 'head'), () => set({ face: f })));
      return;
    }
    if (t.id === 'hair') {
      grid.appendChild(h('div', { class: 'b-colors' }, HAIR_COLORS.map(([key, label, color]) => h('button', {
        type: 'button', class: `swatch ${hero.hairColor === key ? 'is-on' : ''}`, style: { '--sw': color }, title: label, 'aria-label': label,
        onclick: () => set({ hairColor: key, hairStyle: hero.hairStyle || 1 }),
      }))));
      grid.appendChild(option(!hero.hairStyle, 'Без волос', cropFigure(c, { ...hero, hairStyle: null, hat: null }, 'hair'), () => set({ hairStyle: null })));
      for (let s = 1; s <= 11; s++) grid.appendChild(option(hero.hairStyle === s, `Причёска ${s}`, cropFigure(c, { ...hero, hairStyle: s, hat: null }, 'hair'), () => set({ hairStyle: s })));
      return;
    }
    const list = (c.items[t.cat] || []).filter((it) => !it.gender || it.gender === 'any' || it.gender === hero.gender);
    if (t.optional) {
      grid.appendChild(option(!hero[t.field], 'Без', h('div', { class: 'opt-none' }, cropFigure(c, { ...hero, [t.field]: null }, t.region), h('span', null, 'Без')), () => set({ [t.field]: null })));
    }
    for (const it of list) {
      const patch = { [t.field]: it.key };
      if (t.clears) patch[t.clears] = null;
      grid.appendChild(option(hero[t.field] === it.key, it.key, cropFigure(c, { ...hero, ...patch }, t.region), () => set(patch)));
    }
  }

  const other = role === 'giver' ? 'receiver' : 'giver';
  const done = async () => {
    if (!hasOutfit(hero)) {
      tab = !(hero.top || hero.jacket || hero.bodice) ? 'top' : !hero.pants ? 'pants' : 'shoes';
      drawTabs(); drawGrid();
      toast('Оденьте героя: выберите верх, низ и обувь — в белье он не попадёт в книгу');
      return;
    }
    await save.flush();
    while (saving) await new Promise((r) => setTimeout(r, 100));
    const d = state.book.data;
    if (!d.heroes[other]) go(`/b/${book.token}/hero/${other}`);
    else go(`/b/${book.token}/heroes`);
  };

  page(
    h('div', { class: 'builder' },
      h('header', { class: 'b-top' },
        h('a', { href: `/b/${book.token}/heroes`, 'data-link': true, class: 'b-back', 'aria-label': 'Назад к героям' }, '←'),
        h('div', { class: 'b-who' }, h('p', { class: 'eyebrow' }, ROLE[role].title), nameBtn),
        h('div', { class: 'b-top-r' }, status, h('button', { type: 'button', class: 'btn btn-dark btn-sm', onclick: done }, 'Готово')),
      ),
      h('div', { class: 'b-body' },
        h('div', { class: 'b-stage' },
          h('div', { class: 'b-orb' }),
          stage,
          h('button', { type: 'button', class: 'b-dice', onclick: () => set(randomize(hero, c)) }, '⚄ Удиви меня'),
        ),
        h('div', { class: 'b-panel' }, tabsEl, grid),
      ),
    ),
  );
  document.body.classList.add('no-scroll');
  drawStage();
  drawTabs();
  drawGrid();
}

/** Окно «имя и пол» — при первом создании героя и при переименовании. */
function askNameGender(book, role, hero) {
  const c = state.catalog;
  let gender = hero ? hero.gender : (role === 'giver' ? 'female' : 'male');
  const input = h('input', { class: 'input', type: 'text', maxlength: 30, placeholder: 'Имя', value: hero ? hero.name : '', autocomplete: 'off', 'aria-label': 'Имя героя' });
  const err = h('p', { class: 'form-err', role: 'alert' });
  const preview = h('div', { class: 'modal-fig' });
  const drawPreview = () => clear(preview).appendChild(cropFigure(c, hero ? setGender(hero, gender, c) : newHero('', gender), 'full'));
  const gBtn = (g, label) => h('button', { type: 'button', class: `chip ${gender === g ? 'is-on' : ''}`, 'data-g': g, onclick: (e) => {
    gender = g;
    e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.toggle('is-on', b.dataset.g === g));
    drawPreview();
  } }, label);

  const submit = async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) { err.textContent = 'Напишите имя — оно будет на страницах книги'; input.focus(); return; }
    const next = hero ? { ...setGender(hero, gender, c), name } : newHero(name, gender);
    btn.disabled = true;
    try {
      await saveBook({ heroes: { [role]: next } });
      close();
      if (hero) render(); else go(`/b/${book.token}/hero/${role}`, true);
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  };
  const btn = h('button', { type: 'submit', class: 'btn btn-dark btn-lg btn-block' }, hero ? 'Сохранить' : 'Продолжить');
  const overlay = h('div', { class: 'modal-wrap', role: 'dialog', 'aria-modal': 'true' },
    h('form', { class: 'modal', onsubmit: submit },
      preview,
      h('p', { class: 'eyebrow' }, ROLE[role].title),
      h('h2', { class: 'h3' }, ROLE[role].ask),
      input,
      h('div', { class: 'chips' }, gBtn('female', 'Женский'), gBtn('male', 'Мужской')),
      err,
      btn,
      h('button', { type: 'button', class: 'link-btn', onclick: () => { close(); if (!hero) go(`/b/${book.token}/heroes`, true); } }, 'Отмена'),
    ),
  );
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); if (!hero) go(`/b/${book.token}/heroes`, true); } };
  document.addEventListener('keydown', onKey);
  if (!hero) page(flowHeader(book, 'heroes'));
  document.body.appendChild(overlay);
  drawPreview();
  setTimeout(() => input.focus(), 50);
  onLeave(close);
}

// ---------------- Повод ----------------
function pageOccasion(book) {
  const d = book.data;
  if (!d.heroes.giver || !d.heroes.receiver) return go(`/b/${book.token}/heroes`, true);
  let occasion = d.occasion;
  let relation = d.relation;
  const next = h('button', { type: 'button', class: 'btn btn-dark btn-lg' }, 'Выбрать обложку');
  const refresh = () => {
    root.querySelectorAll('[data-occ]').forEach((b) => b.classList.toggle('is-on', b.dataset.occ === occasion));
    root.querySelectorAll('[data-rel]').forEach((b) => b.classList.toggle('is-on', b.dataset.rel === relation));
    next.classList.toggle('is-disabled', !(occasion && relation));
  };
  next.addEventListener('click', async () => {
    if (!occasion || !relation) { toast('Выберите повод и кем вам приходится получатель'); return; }
    next.disabled = true;
    try {
      await saveBook({ occasion, relation });
      go(`/b/${book.token}/cover`);
    } catch (e) { toast(e.message, 'error'); next.disabled = false; }
  });
  page(
    flowHeader(book, 'occasion'),
    h('section', { class: 'flow' },
      h('div', { class: 'flow-title' },
        h('h1', { class: 'h1' }, 'Какой ', h('em', null, 'повод'), '?'),
        h('p', { class: 'muted' }, `Подберём обложки, на которых ${d.heroes.giver.name} и ${d.heroes.receiver.name} будут смотреться лучше всего.`),
      ),
      h('div', { class: 'occ-grid' }, OCCASIONS.map(([key, title, sub]) => h('button', {
        type: 'button', class: 'occ', 'data-occ': key, onclick: () => { occasion = key; refresh(); },
      }, h('b', null, title), h('span', null, sub)))),
      h('h2', { class: 'h3 mt' }, `Кем вам приходится ${d.heroes.receiver.name}?`),
      h('div', { class: 'chips chips-wrap' }, RELATIONS.map(([key, label]) => h('button', {
        type: 'button', class: 'chip', 'data-rel': key, onclick: () => { relation = key; refresh(); },
      }, label))),
      h('div', { class: 'flow-actions' }, next),
    ),
  );
  refresh();
}

// ---------------- Обложки ----------------
function pageCovers(book) {
  const c = state.catalog;
  const d = book.data;
  if (!d.heroes.giver || !d.heroes.receiver) return go(`/b/${book.token}/heroes`, true);
  if (!d.occasion) return go(`/b/${book.token}/occasion`, true);
  let filter = d.occasion;
  const grid = h('div', { class: 'cover-grid' });
  const chips = h('div', { class: 'chips chips-wrap chips-center' });

  const drawChips = () => {
    clear(chips);
    for (const [key, title] of [['all', 'Все'], ...OCCASIONS]) {
      chips.appendChild(h('button', { type: 'button', class: `chip ${filter === key ? 'is-on' : ''}`, onclick: () => { filter = key; drawChips(); drawGrid(); } }, title));
    }
  };
  const drawGrid = () => {
    clear(grid);
    const list = c.covers.filter((cv) => filter === 'all' || cv.occasion === filter);
    for (const cv of list) {
      const chosen = d.cover && d.cover.id === cv.id;
      const choice = chosen ? d.cover : {};
      grid.appendChild(h('button', { type: 'button', class: `cover-pick ${chosen ? 'is-on' : ''}`, onclick: () => openCoverEditor(book, cv) },
        renderCover(c, cv, d.heroes, choice, { lazy: true }),
        chosen ? h('span', { class: 'badge' }, 'Выбрана') : null,
      ));
    }
    if (!list.length) grid.appendChild(h('p', { class: 'muted center' }, 'Для этого повода обложки скоро появятся — посмотрите «Все».'));
  };

  page(
    flowHeader(book, 'cover'),
    h('section', { class: 'flow flow-wide' },
      h('div', { class: 'flow-title' },
        h('h1', { class: 'h1' }, 'Выберите ', h('em', null, 'обложку')),
        h('p', { class: 'muted' }, 'Ваши герои уже на месте. Нажмите на обложку, чтобы изменить название.'),
      ),
      chips, grid,
    ),
  );
  drawChips();
  drawGrid();
}

function openCoverEditor(book, cv) {
  const c = state.catalog;
  const d = book.data;
  const prev = d.cover && d.cover.id === cv.id ? d.cover : null;
  const choice = { id: cv.id, text: prev ? prev.text : cv.text, swap: prev ? prev.swap : false, solo: prev ? prev.solo : 'giver' };
  const holder = h('div', { class: 'ce-cover' });
  const draw = () => clear(holder).appendChild(renderCover(c, cv, d.heroes, choice));
  const input = h('input', { class: 'input', type: 'text', maxlength: 60, value: choice.text, 'aria-label': 'Название на обложке', oninput: (e) => { choice.text = e.target.value; draw(); } });

  const controls = cv.receiver
    ? h('button', { type: 'button', class: 'btn btn-soft', onclick: () => { choice.swap = !choice.swap; draw(); } }, '⇄ Поменять героев местами')
    : h('div', { class: 'chips' }, ['giver', 'receiver'].map((r) => h('button', {
      type: 'button', class: `chip ${choice.solo === r ? 'is-on' : ''}`, 'data-solo': r,
      onclick: (e) => { choice.solo = r; e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.toggle('is-on', b.dataset.solo === r)); draw(); },
    }, `На обложке: ${d.heroes[r].name}`)));

  const save = h('button', { type: 'button', class: 'btn btn-dark btn-lg btn-block' }, 'Выбрать эту обложку');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await saveBook({ cover: { ...choice, text: choice.text.trim() } });
      close();
      go(`/b/${book.token}`);
      toast('Обложка сохранена');
    } catch (e) { toast(e.message, 'error'); save.disabled = false; }
  });

  const overlay = h('div', { class: 'modal-wrap', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal modal-cover' },
      h('button', { type: 'button', class: 'modal-x', 'aria-label': 'Закрыть', onclick: () => close() }, '×'),
      holder,
      h('div', { class: 'ce-side' },
        h('p', { class: 'eyebrow' }, occasionLabel(cv.occasion)),
        h('h2', { class: 'h3' }, 'Название на обложке'),
        input,
        h('button', { type: 'button', class: 'link-btn left', onclick: () => { choice.text = cv.text; input.value = cv.text; draw(); } }, 'Вернуть исходное'),
        controls,
        save,
      ),
    ),
  );
  const close = () => { overlay.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.classList.add('no-scroll');
  document.body.appendChild(overlay);
  draw();
  onLeave(close);
}

// ---------------- Страница книги ----------------
function pageSummary(book) {
  const c = state.catalog;
  const d = book.data;
  const cv = d.cover && c.covers.find((x) => x.id === d.cover.id);
  const hasPages = !!(d.pages && d.pages.items.length);
  const nextStep = !(d.heroes.giver && d.heroes.receiver) ? 'heroes' : !d.occasion ? 'occasion' : !d.cover ? 'cover' : !hasPages ? 'pages' : 'order';
  const ordered = book.status !== 'draft';
  const link = `${location.origin}/b/${book.token}`;
  const email = h('input', { class: 'input', type: 'email', placeholder: 'почта@пример.ru', value: book.email || '', 'aria-label': 'Почта' });
  const label = { heroes: 'Продолжить: герои', occasion: 'Продолжить: повод', cover: 'Выбрать обложку', pages: 'Собрать страницы', order: `Оформить заказ · ${rub(c.price)}` }[nextStep];

  page(
    flowHeader(book, ''),
    h('section', { class: 'flow' },
      h('div', { class: 'summary' },
        h('div', { class: 'summary-cover' }, cv ? renderCover(c, cv, d.heroes, d.cover) : h('div', { class: 'cover cover-empty', style: { aspectRatio: `${c.coverRef.w} / ${c.coverRef.h}` } }, h('span', null, 'Здесь будет обложка'))),
        h('div', { class: 'summary-side' },
          h('p', { class: 'eyebrow' }, ordered ? 'Книга заказана' : 'Ваша книга'),
          h('h1', { class: 'h1' }, d.heroes.giver && d.heroes.receiver ? [d.heroes.giver.name, h('em', null, ' & '), d.heroes.receiver.name] : 'Черновик книги'),
          h('ul', { class: 'checklist' },
            checkItem(!!(d.heroes.giver && d.heroes.receiver), 'Герои', `/b/${book.token}/heroes`),
            checkItem(!!d.occasion, d.occasion ? `Повод: ${occasionLabel(d.occasion)}` : 'Повод', `/b/${book.token}/occasion`),
            checkItem(!!d.cover, 'Обложка', `/b/${book.token}/cover`),
            checkItem(hasPages, hasPages ? `Страницы: ${d.pages.items.length + 2}` : 'Страницы книги', `/b/${book.token}/pages`),
            book.order ? checkItem(ordered, `Заказ: ${orderStatusText(book.order.status)}`, `/order/${book.order.token}`) : null,
          ),
          ordered
            ? h('div', { class: 'btn-row' },
              h('a', { href: `/order/${book.order.token}`, 'data-link': true, class: 'btn btn-dark btn-lg' }, 'Статус заказа'),
              hasPages ? h('button', { type: 'button', class: 'btn btn-soft btn-lg', onclick: () => openViewer(book) }, 'Листать книгу') : null)
            : h('div', { class: 'btn-row' },
              h('a', { href: `/b/${book.token}/${nextStep}`, 'data-link': true, class: 'btn btn-dark btn-lg' }, label),
              hasPages ? h('button', { type: 'button', class: 'btn btn-soft btn-lg', onclick: () => openViewer(book) }, 'Листать книгу') : null),
          h('div', { class: 'save-link' },
            h('p', { class: 'small' }, 'Ссылка на вашу книгу — по ней можно вернуться с любого устройства:'),
            h('div', { class: 'copy-row' },
              h('input', { class: 'input input-sm', readonly: true, value: link, 'aria-label': 'Ссылка на книгу', onfocus: (e) => e.target.select() }),
              h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); } catch { toast('Выделите ссылку и скопируйте вручную'); } } }, 'Копировать'),
            ),
            ordered ? null : h('form', { class: 'copy-row', onsubmit: async (e) => { e.preventDefault(); try { await saveBook({ email: email.value }); toast('Почта сохранена'); } catch (ex) { toast(ex.message, 'error'); } } },
              email, h('button', { type: 'submit', class: 'btn btn-soft btn-sm' }, 'Сохранить'),
            ),
          ),
        ),
      ),
    ),
  );
}

function checkItem(done, label, href) {
  return h('li', { class: done ? 'is-done' : '' }, h('span', { class: 'ck' }, done ? '✓' : ''), h('a', { href, 'data-link': true }, label));
}

function orderStatusText(st) {
  return { new: 'принят', pending: 'ждёт оплаты', paid: 'оплачен', canceled: 'оплата отменена', printing: 'в печати', shipped: 'отправлен', done: 'доставлен' }[st] || st;
}

// ---------------- Страницы книги ----------------
function pagePages(book) {
  const c = state.catalog;
  const d = book.data;
  if (!d.heroes.giver || !d.heroes.receiver) return go(`/b/${book.token}/heroes`, true);
  if (!d.cover) return go(`/b/${book.token}/cover`, true);
  if (book.status !== 'draft') return go(`/b/${book.token}`, true);
  const [MIN, MAX] = c.pageLimits;
  const TEXT_MAX = 220;
  let pages = d.pages ? cleanPages(c, JSON.parse(JSON.stringify(d.pages))) : null;
  const fresh = !pages || pages.items.length < MIN;
  if (fresh) pages = { ...defaultPages(c, d), ...(pages ? { dedication: pages.dedication, final: pages.final } : {}) };
  let cur = 0; // 0 — посвящение, 1..n — сцены, n+1 — финал
  const status = h('span', { class: 'small muted' }, 'Сохранено');

  const save = debounce(async () => {
    status.textContent = 'Сохраняем…';
    try { await saveBook({ pages }); status.textContent = 'Сохранено'; } catch (e) { status.textContent = 'Не сохранено'; toast(e.message, 'error'); }
  }, 700);
  onLeave(() => save.flush());
  if (fresh || pages.items.length !== d.pages.items.length) save();

  const total = () => pages.items.length + 2;
  const pageAt = (i) => (i === 0 ? { kind: 'dedication', text: pages.dedication } : i === total() - 1 ? { kind: 'final', text: pages.final } : { kind: 'scene', item: pages.items[i - 1] });

  const bookEl = h('div', { class: 'pg-book' });
  const counter = h('span');
  const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предыдущая страница', onclick: () => select(cur - 1) }, '←');
  const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следующая страница', onclick: () => select(cur + 1) }, '→');
  const side = h('div', { class: 'pg-side' });
  const thumbs = h('div', { class: 'thumbs' });

  function drawPreview() {
    clear(bookEl).appendChild(renderPage(c, pageAt(cur), d.heroes, { number: cur + 1 }));
    counter.textContent = `Страница ${cur + 1} из ${total()}`;
    prev.disabled = cur === 0;
    next.disabled = cur === total() - 1;
  }

  function drawThumbs() {
    clear(thumbs);
    for (let i = 0; i < total(); i++) {
      thumbs.appendChild(h('button', { type: 'button', class: `thumb ${i === cur ? 'is-on' : ''}`, 'aria-label': `Страница ${i + 1}`, onclick: () => select(i) },
        renderPage(c, pageAt(i), d.heroes, { lazy: true }), h('i', null, String(i + 1))));
      if (i === total() - 2 && pages.items.length < MAX) {
        thumbs.appendChild(h('button', { type: 'button', class: 'thumb-add', 'aria-label': 'Добавить страницу', title: 'Добавить страницу', onclick: () => pickScene(null) }, '+'));
      }
    }
  }

  function select(i) {
    cur = Math.max(0, Math.min(total() - 1, i));
    drawPreview();
    drawSide();
    [...thumbs.children].forEach((t) => t.classList && t.classList.toggle('is-on', t.getAttribute('aria-label') === `Страница ${cur + 1}`));
    thumbs.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  const changed = (full = false) => { drawPreview(); if (full) drawThumbs(); else refreshThumb(); save(); };
  const refreshThumb = debounce(() => drawThumbs(), 500);

  function textArea(value, onInput, max = TEXT_MAX, rows = 4) {
    const ta = h('textarea', { class: 'textarea', maxlength: max, rows, 'aria-label': 'Текст страницы' });
    ta.value = value;
    const cnt = h('div', { class: 'counter' });
    const upd = () => { cnt.textContent = `${ta.value.length} / ${max}`; };
    ta.addEventListener('input', () => { upd(); onInput(ta.value); });
    upd();
    return [ta, cnt];
  }

  /** Облака с мыслями героев: до двух на странице. */
  function cloudEditor(it, tpl) {
    it.clouds = it.clouds || [];
    const box = h('div', { class: 'cloud-ed' }, h('b', null, 'Облака с мыслями'),
      h('p', { class: 'hint' }, 'Добавьте облако над героем и впишите, о чём он думает. Облако можно перетащить прямо на странице.'));
    it.clouds.forEach((cl, i) => {
      const [ta, cnt] = textArea(fillText(cl.text, d.heroes), (v) => { cl.text = v; changed(); }, 90, 2);
      ta.placeholder = 'О чём думает герой?';
      box.append(h('div', { class: 'cloud-ed' },
        h('div', { class: 'row' },
          ...(c.book.clouds || []).map((k, s) => h('button', { type: 'button', class: `cloud-shape ${cl.s === s ? 'is-on' : ''}`, title: 'Форма облака', onclick: () => { cl.s = s; drawSide(); changed(true); } },
            c.assets[k] ? h('img', { src: c.assets[k][0], alt: '' }) : String(s + 1))),
          h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: () => { it.clouds.splice(i, 1); drawSide(); changed(true); } }, 'Убрать'),
        ),
        ta, cnt,
        h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Размер'),
          h('input', { type: 'range', min: 34, max: 120, value: cl.w, oninput: (e) => { cl.w = Number(e.target.value); changed(); } })),
        h('div', { class: 'idea-chips' }, (c.book.cloudIdeas || []).slice(0, 6).map((t) => h('button', { type: 'button', onclick: () => { cl.text = t; drawSide(); changed(); } }, t))),
      ));
    });
    if (it.clouds.length < 2) {
      const roles = tpl.receiver ? ['giver', 'receiver'] : [it.swap ? 'receiver' : 'giver'];
      box.append(h('div', { class: 'pg-tools' }, roles.map((r) => h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: () => {
        const nc = defaultCloud(c, tpl, tpl.receiver ? r : 'giver', tpl.receiver ? it.swap : false);
        // Второе облако не ложится на первое: отодвигаем его в сторону
        const o = it.clouds[0];
        if (o && Math.abs(o.x - nc.x) < o.w * 0.8 && Math.abs(o.y - nc.y) < o.w * 0.5) {
          if (nc.x <= o.x) { nc.x = Math.max(2, o.x - nc.w - 3); nc.s = 0; } else { nc.x = Math.min(174.8 - nc.w - 2, o.x + o.w + 3); nc.s = 1; }
        }
        it.clouds.push(nc);
        drawSide(); changed(true);
      } }, `+ Облако: ${d.heroes[r].name}`))));
    }
    return box;
  }

  // Перетаскивание облаков прямо на превью страницы
  bookEl.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.pg-cloud');
    const p = pageAt(cur);
    if (!el || p.kind !== 'scene') return;
    const cl = (p.item.clouds || [])[Number(el.dataset.i)];
    if (!cl) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-drag');
    const unit = 174.8 / bookEl.getBoundingClientRect().width;
    const x0 = e.clientX, y0 = e.clientY, cx = cl.x, cy = cl.y;
    const move = (ev) => {
      cl.x = Math.round(Math.max(-30, Math.min(160, cx + (ev.clientX - x0) * unit)) * 10) / 10;
      cl.y = Math.round(Math.max(-10, Math.min(230, cy + (ev.clientY - y0) * unit)) * 10) / 10;
      el.style.left = `${(cl.x / 174.8) * 100}%`;
      el.style.top = `calc(${(cl.y / 174.8) * 100} * var(--cw))`;
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.classList.remove('is-drag'); changed(true); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });

  function drawSide() {
    clear(side);
    const p = pageAt(cur);
    let card;
    if (p.kind === 'scene') {
      const it = p.item;
      const tpl = templateById(c, it.t);
      const idx = cur - 1;
      const note = !!(tpl && tpl.note);
      const [ta, cnt] = textArea(fillText(it.text, d.heroes), (v) => { it.text = v; changed(); }, note ? 700 : TEXT_MAX, note ? 9 : 4);
      card = h('div', { class: 'pg-card' },
        h('p', { class: 'eyebrow' }, `Страница ${cur + 1}`),
        h('h2', null, tpl ? (c.book.categories[tpl.cat] || 'Сцена') : 'Сцена'),
        note ? h('p', { class: 'hint' }, 'Страница для ваших слов: письмо, воспоминание, пожелание. Текст встанет в центр листа.') : null,
        tpl && !note && !tpl.receiver ? h('p', { class: 'hint' }, 'На этой странице один герой. Кнопка «Герои местами» выбирает, кто именно.') : null,
        ta, cnt,
        h('div', { class: 'pg-tools' },
          h('button', { type: 'button', class: 'btn btn-dark btn-sm', onclick: () => pickScene(idx) }, note ? 'Сменить рамку' : 'Сменить сцену'),
          note ? null : h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: () => { it.swap = !it.swap; changed(true); } }, '⇄ Герои местами'),
          note ? null : h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: () => { it.text = defaultText(tpl); drawSide(); changed(); } }, 'Текст по умолчанию'),
        ),
        note ? null : cloudEditor(it, tpl),
        h('div', { class: 'pg-tools' },
          h('button', { type: 'button', class: 'btn btn-soft btn-sm', disabled: idx === 0, onclick: () => move(idx, -1) }, '← Раньше'),
          h('button', { type: 'button', class: 'btn btn-soft btn-sm', disabled: idx === pages.items.length - 1, onclick: () => move(idx, 1) }, 'Позже →'),
          h('button', { type: 'button', class: 'btn btn-soft btn-sm', disabled: pages.items.length <= MIN, title: pages.items.length <= MIN ? `В книге должно быть не меньше ${MIN} страниц с героями` : '', onclick: () => remove(idx) }, 'Удалить'),
        ),
      );
    } else {
      const ded = p.kind === 'dedication';
      const [ta, cnt] = textArea(fillText(ded ? pages.dedication : pages.final, d.heroes), (v) => { if (ded) pages.dedication = v; else pages.final = v; changed(); });
      card = h('div', { class: 'pg-card' },
        h('p', { class: 'eyebrow' }, `Страница ${cur + 1}`),
        h('h2', null, ded ? 'Посвящение' : 'Последняя страница'),
        h('p', { class: 'hint' }, ded ? `Первая страница книги. Имя «${d.heroes.receiver.name}» уже стоит сверху, подпись — ваше имя.` : 'Тёплые слова на прощание — ими книга закончится.'),
        ta, cnt,
      );
    }
    side.append(card,
      h('div', { class: 'pg-card' },
        h('p', { class: 'hint' }, `Нажимайте на страницы внизу, чтобы их редактировать. Сцены можно менять, переставлять и добавлять — от ${MIN + 2} до ${MAX + 2} страниц.`),
        h('button', { type: 'button', class: 'btn btn-soft btn-block', onclick: async () => { await save.flush(); openViewer(state.book); } }, '📖 Листать книгу целиком'),
        status,
      ));
  }

  function move(idx, dir) {
    const [it] = pages.items.splice(idx, 1);
    pages.items.splice(idx + dir, 0, it);
    cur = idx + dir + 1;
    drawSide(); changed(true);
  }
  function remove(idx) {
    if (pages.items.length <= MIN) return;
    pages.items.splice(idx, 1);
    cur = Math.min(cur, total() - 2);
    drawSide(); changed(true);
  }

  /** Выбор сцены: для страницы idx или новой (idx = null — добавить после текущей). */
  function pickScene(idx) {
    const it = idx === null ? null : pages.items[idx];
    const all = availableTemplates(c);
    const cats = Object.keys(c.book.categories).filter((k) => all.some((t) => t.cat === k));
    let cat = (it && templateById(c, it.t) && templateById(c, it.t).cat) || cats[0];
    let onlyDuo = false;
    const chips = h('div', { class: 'chips chips-wrap' });
    const grid = h('div', { class: 'scene-grid' });
    const choose = (tpl) => {
      if (it) {
        const old = templateById(c, it.t);
        const untouched = !old || it.text === old.text;
        it.t = tpl.id;
        if (untouched || tpl.note !== !!(old && old.note)) it.text = tpl.note ? c.book.noteText : defaultText(tpl);
        if (tpl.note) it.clouds = [];
      } else {
        const at = Math.max(0, Math.min(pages.items.length, cur));
        pages.items.splice(at, 0, { t: tpl.id, text: tpl.note ? c.book.noteText : defaultText(tpl), swap: false, clouds: [] });
        cur = at + 1;
      }
      close();
      drawSide(); changed(true); select(cur);
    };
    const drawChips = () => {
      clear(chips);
      for (const k of cats) chips.appendChild(h('button', { type: 'button', class: `chip ${k === cat ? 'is-on' : ''}`, onclick: () => { cat = k; drawChips(); drawGrid(); } }, `${c.book.categories[k]} · ${all.filter((t) => t.cat === k).length}`));
      chips.appendChild(h('button', { type: 'button', class: `chip ${onlyDuo ? 'is-on' : ''}`, onclick: () => { onlyDuo = !onlyDuo; drawChips(); drawGrid(); } }, 'Только вдвоём'));
    };
    const drawGrid = () => {
      clear(grid);
      for (const tpl of all.filter((t) => t.cat === cat && (!onlyDuo || t.receiver))) {
        grid.appendChild(h('button', { type: 'button', class: `scene-pick ${it && it.t === tpl.id ? 'is-on' : ''}`, onclick: () => choose(tpl) },
          renderPage(c, { kind: 'scene', item: { t: tpl.id, text: tpl.note ? c.book.noteText : tpl.text, swap: it ? it.swap : false } }, d.heroes, { lazy: true }),
          h('span', null, tpl.note ? 'Письмо' : tpl.receiver ? 'Вдвоём' : 'Один герой')));
      }
    };
    const overlay = h('div', { class: 'modal-wrap', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === overlay) close(); } },
      h('div', { class: 'modal modal-scenes' },
        h('button', { type: 'button', class: 'modal-x', 'aria-label': 'Закрыть', onclick: () => close() }, '×'),
        h('h2', { class: 'h3' }, it ? 'Выберите сцену' : 'Новая страница'),
        h('p', { class: 'muted' }, `${all.length} сцен с вашими героями. Текст на странице можно будет поменять.`),
        chips, grid));
    const close = () => { overlay.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    document.body.appendChild(overlay);
    onLeave(close);
    drawChips(); drawGrid();
  }

  const toOrder = h('a', { href: `/b/${book.token}/order`, 'data-link': true, class: 'btn btn-dark', onclick: () => save.flush() }, `Оформить заказ · ${rub(c.price)}`);
  page(
    flowHeader(book, 'pages'),
    h('div', { class: 'pg' },
      h('div', { class: 'pg-stage' }, bookEl, h('div', { class: 'pg-nav' }, prev, counter, next)),
      side,
    ),
    h('div', { class: 'strip' }, h('div', { class: 'strip-in' }, thumbs, h('div', { class: 'strip-cta' }, toOrder))),
  );
  const onKey = (e) => {
    if (e.target.closest('textarea, input') || document.querySelector('.modal-wrap, .viewer')) return;
    if (e.key === 'ArrowLeft') select(cur - 1);
    if (e.key === 'ArrowRight') select(cur + 1);
  };
  document.addEventListener('keydown', onKey);
  onLeave(() => document.removeEventListener('keydown', onKey));
  drawPreview(); drawSide(); drawThumbs();
}

// ---------------- Просмотр книги ----------------
function openViewer(book) {
  const c = state.catalog;
  const d = book.data;
  const cv = d.cover && c.covers.find((x) => x.id === d.cover.id);
  const pages = bookSpreads(c, d);
  const narrow = matchMedia('(max-width: 700px)').matches;
  // Развороты: обложка отдельно, дальше страницы по две (первая страница — справа, как в настоящей книге)
  const views = [];
  if (cv) views.push([{ cover: true }]);
  if (narrow) pages.forEach((p, i) => views.push([{ p, n: i + 1 }]));
  else {
    const seq = [null, ...pages.map((p, i) => ({ p, n: i + 1 }))];
    if (seq.length % 2) seq.push(null);
    for (let i = 0; i < seq.length; i += 2) views.push([seq[i], seq[i + 1]]);
  }
  let at = 0;
  const stage = h('div', { class: 'viewer-stage' });
  const info = h('span');
  const prev = h('button', { type: 'button', class: 'viewer-arrow prev', 'aria-label': 'Назад', onclick: () => show(at - 1) }, '←');
  const next = h('button', { type: 'button', class: 'viewer-arrow next', 'aria-label': 'Вперёд', onclick: () => show(at + 1) }, '→');
  const part = (x) => {
    if (!x) return h('div', { class: 'spread-blank' });
    if (x.cover) return h('div', null, renderCover(c, cv, d.heroes, d.cover));
    return h('div', null, renderPage(c, x.p, d.heroes, { number: x.n }));
  };
  function show(i) {
    at = Math.max(0, Math.min(views.length - 1, i));
    const v = views[at];
    clear(stage).appendChild(h('div', { class: `spread ${v.length === 1 ? 'is-single' : ''}` }, v.map(part)));
    prev.disabled = at === 0;
    next.disabled = at === views.length - 1;
    info.textContent = at === 0 && cv ? 'Обложка' : `${at + (cv ? 0 : 1)} / ${views.length - (cv ? 1 : 0)}`;
  }
  const overlay = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'viewer-top' }, info, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => close() }, 'Закрыть')),
    stage, prev, next,
    h('div', { class: 'viewer-bottom' }));
  let x0 = null;
  overlay.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1)); x0 = null; });
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') show(at + 1); if (e.key === 'ArrowLeft') show(at - 1); };
  const close = () => { overlay.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  document.body.classList.add('no-scroll');
  document.body.appendChild(overlay);
  onLeave(close);
  show(0);
}

// ---------------- Оформление заказа ----------------
const ORDER_FORM_KEY = 'kg_order_form';
function pageCheckout(book) {
  const c = state.catalog;
  const d = book.data;
  if (book.status !== 'draft' && book.order) return go(`/order/${book.order.token}`, true);
  if (!d.pages || !d.pages.items.length) return go(`/b/${book.token}/pages`, true);
  const cv = d.cover && c.covers.find((x) => x.id === d.cover.id);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(ORDER_FORM_KEY) || '{}'); } catch { /* */ }
  const form = { name: '', phone: '', email: book.email || '', city: '', address: '', zip: '', comment: '', delivery: 'courier', ...saved, qty: 1 };
  const err = h('p', { class: 'form-err', role: 'alert' });
  const field = (key, label, attrs = {}, wide = false) => {
    const input = h(attrs.multiline ? 'textarea' : 'input', { class: attrs.multiline ? 'textarea' : 'input', name: key, value: attrs.multiline ? null : form[key], ...attrs, multiline: null, oninput: (e) => { form[key] = e.target.value; } });
    if (attrs.multiline) input.value = form[key];
    return h('label', { class: `field ${wide ? 'wide' : ''}` }, h('span', null, label), input);
  };
  const qtyEl = h('span', null, '1');
  const totalEl = h('b');
  const lineEl = h('span');
  const updTotal = () => { qtyEl.textContent = String(form.qty); lineEl.textContent = rub(c.price * form.qty); totalEl.textContent = rub(c.price * form.qty); };
  const segBtn = (key, title, sub) => h('button', { type: 'button', class: `seg-opt ${form.delivery === key ? 'is-on' : ''}`, 'data-d': key, onclick: (e) => {
    form.delivery = key;
    e.currentTarget.parentElement.querySelectorAll('.seg-opt').forEach((b) => b.classList.toggle('is-on', b.dataset.d === key));
    addrLabel.textContent = key === 'pickup' ? 'Адрес пункта выдачи (СДЭК, Boxberry, Почта)' : 'Улица, дом, квартира';
  } }, h('b', null, title), h('span', null, sub));
  const addrField = field('address', '', { autocomplete: 'street-address', required: true }, true);
  const addrLabel = addrField.querySelector('span');
  addrLabel.textContent = form.delivery === 'pickup' ? 'Адрес пункта выдачи (СДЭК, Boxberry, Почта)' : 'Улица, дом, квартира';
  const agree = h('input', { type: 'checkbox', checked: true });
  const payBtn = h('button', { type: 'submit', class: 'btn btn-dark btn-lg btn-block' }, c.payOnline ? 'Перейти к оплате' : 'Оформить заказ');

  const submit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!agree.checked) { err.textContent = 'Подтвердите согласие с условиями заказа'; return; }
    payBtn.disabled = true;
    payBtn.textContent = c.payOnline ? 'Готовим оплату…' : 'Оформляем…';
    try {
      const { qty, ...remember } = form;
      try { localStorage.setItem(ORDER_FORM_KEY, JSON.stringify({ ...remember, comment: '' })); } catch { /* */ }
      const res = await api.createOrder(book.token, form);
      try { localStorage.setItem('kg_last_order', res.order.token); } catch { /* */ }
      state.book = null;
      if (res.payUrl) { location.href = res.payUrl; return; }
      go(`/order/${res.order.token}`);
    } catch (ex) {
      err.textContent = ex.message;
      payBtn.disabled = false;
      payBtn.textContent = c.payOnline ? 'Перейти к оплате' : 'Оформить заказ';
    }
  };

  page(
    flowHeader(book, 'order'),
    h('section', { class: 'flow-title', style: { paddingTop: '36px' } },
      h('h1', { class: 'h1' }, 'Оформление ', h('em', null, 'заказа')),
      h('p', { class: 'muted' }, 'Напечатаем книгу в твёрдом переплёте и бесплатно доставим.')),
    h('form', { class: 'checkout', onsubmit: submit, novalidate: true },
      h('div', { class: 'co-form' },
        h('div', { class: 'co-block' },
          h('h2', null, 'Получатель'),
          h('div', { class: 'fields' },
            field('name', 'Имя и фамилия', { autocomplete: 'name', required: true }, true),
            field('phone', 'Телефон', { type: 'tel', autocomplete: 'tel', placeholder: '+7', required: true }),
            field('email', 'Почта — пришлём чек и статус', { type: 'email', autocomplete: 'email', required: true }),
          ),
        ),
        h('div', { class: 'co-block' },
          h('h2', null, 'Доставка'),
          h('div', { class: 'seg' }, segBtn('courier', 'Курьером', 'До двери, бесплатно'), segBtn('pickup', 'Пункт выдачи', 'Рядом с домом, бесплатно')),
          h('div', { class: 'fields' },
            field('city', 'Город', { autocomplete: 'address-level2', required: true }),
            field('zip', 'Индекс', { autocomplete: 'postal-code', inputmode: 'numeric' }),
            addrField,
            field('comment', 'Комментарий к заказу (необязательно)', { multiline: true, maxlength: 500 }, true),
          ),
        ),
      ),
      h('aside', { class: 'co-sum' },
        h('div', { class: 'co-book' },
          cv ? renderCover(c, cv, d.heroes, d.cover) : h('div'),
          h('div', null, h('b', null, `${d.heroes.giver.name} & ${d.heroes.receiver.name}`), h('span', { class: 'small muted' }, `${d.pages.items.length + 2} страниц · твёрдый переплёт`),
            h('button', { type: 'button', class: 'link-btn left', onclick: () => openViewer(book) }, 'Листать книгу')),
        ),
        h('div', { class: 'co-lines' },
          h('div', null, h('span', null, 'Количество'), h('div', { class: 'qty' },
            h('button', { type: 'button', 'aria-label': 'Меньше', onclick: () => { form.qty = Math.max(1, form.qty - 1); updTotal(); } }, '−'), qtyEl,
            h('button', { type: 'button', 'aria-label': 'Больше', onclick: () => { form.qty = Math.min(10, form.qty + 1); updTotal(); } }, '+'))),
          h('div', null, h('span', null, 'Книга'), lineEl),
          h('div', null, h('span', null, 'Доставка'), h('span', null, 'Бесплатно')),
        ),
        h('div', { class: 'co-lines co-total' }, h('div', null, h('span', null, 'Итого'), totalEl)),
        h('label', { class: 'small', style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, agree, h('span', null, 'Соглашаюсь с ', h('a', { href: '/terms', target: '_blank' }, 'условиями заказа и обработкой данных'))),
        err, payBtn,
        c.payOnline
          ? h('div', { class: 'pay-badges' }, ['Карты', 'СБП', 'SberPay', 'ЮMoney', 'T-Pay'].map((t) => h('span', null, t)))
          : h('p', { class: 'small-print' }, 'После оформления мы свяжемся с вами, чтобы подтвердить заказ и отправить ссылку на оплату.'),
        h('p', { class: 'small-print' }, 'Оплата через ЮKassa. После оплаты книгу нельзя будет изменить — проверьте имена и тексты.'),
      ),
    ),
  );
  updTotal();
}

// ---------------- Статус заказа ----------------
async function pageOrder(token) {
  showLoading();
  let o = await api.getOrder(token);
  let tries = 0;
  // Возврат с оплаты: платёж может подтвердиться не мгновенно — подождём немного
  while (o.status === 'pending' && tries < 6 && new URLSearchParams(location.search).get('wait') !== '0') {
    await new Promise((r) => setTimeout(r, 2500));
    o = await api.getOrder(token);
    tries++;
  }
  const c = state.catalog;
  let book = null;
  try { book = await api.getBook(o.book); myBooks.add(o.book); } catch { /* */ }
  const d = book && book.data;
  const cv = d && d.cover && c.covers.find((x) => x.id === d.cover.id);
  const paid = ['paid', 'printing', 'shipped', 'done'].includes(o.status);
  const steps = [['Заказ оформлен', true], ['Оплачен', paid], ['В печати', ['printing', 'shipped', 'done'].includes(o.status)], ['Отправлен', ['shipped', 'done'].includes(o.status)], ['Доставлен', o.status === 'done']];
  let ico, title, text, action = null;
  if (paid) { ico = ['ok', '✓']; title = 'Спасибо! Заказ оплачен'; text = `Заказ №${o.number} уже у нас. Проверим макет и передадим в печать — книга приедет примерно через 5 рабочих дней. Чек и статус отправили на ${o.email}.`; }
  else if (o.status === 'new') { ico = ['ok', '✓']; title = 'Заказ принят'; text = `Заказ №${o.number} на ${rub(o.amount)} оформлен. Мы свяжемся с вами в ближайшее время, чтобы подтвердить его и договориться об оплате.`; }
  else if (o.status === 'canceled') { ico = ['bad', '!']; title = 'Оплата не прошла'; text = 'Деньги не списаны. Можно попробовать ещё раз — другой картой или через СБП.'; }
  else { ico = ['wait', '…']; title = 'Ждём оплату'; text = 'Если вы уже оплатили, статус обновится через минуту. Если нет — нажмите кнопку ниже.'; }
  if ((o.status === 'pending' || o.status === 'canceled') && o.payOnline) {
    const btn = h('button', { type: 'button', class: 'btn btn-dark btn-lg' }, `Оплатить ${rub(o.amount)}`);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { const r = await api.payOrder(token); location.href = r.payUrl; } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
    });
    action = btn;
  }
  page(nav({ cta: false }), h('section', { class: 'flow' },
    h('div', { class: 'status-card' },
      h('div', { class: `status-ico ${ico[0]}` }, ico[1]),
      h('p', { class: 'eyebrow' }, `Заказ №${o.number}`),
      h('h1', { class: 'h2' }, title),
      h('p', { class: 'muted' }, text),
      action,
      cv ? h('div', { style: { width: '160px' } }, renderCover(c, cv, d.heroes, d.cover)) : null,
      h('ul', { class: 'timeline' }, steps.map(([t, done]) => h('li', { class: done ? 'is-done' : '' }, h('i', null, done ? '✓' : ''), t))),
      h('div', { class: 'btn-row center' },
        book ? h('button', { type: 'button', class: 'btn btn-soft', onclick: () => openViewer(book) }, 'Листать книгу') : null,
        h('a', { href: '/', 'data-link': true, class: 'btn btn-soft' }, 'На главную')),
      c.contactEmail ? h('p', { class: 'small muted' }, 'Вопросы по заказу: ', h('a', { href: `mailto:${c.contactEmail}` }, c.contactEmail)) : null,
    )));
}

// ---------------- Макет для печати ----------------
// Блок 140×215 мм, обложка 145×220 мм. Сохраняется через «Печать → Сохранить как PDF» в Chrome.
function pagePrint(book, part, label) {
  const c = state.catalog;
  const d = book.data;
  const params = new URLSearchParams(location.search);
  const bleed = Math.max(0, Math.min(5, Number(params.get('bleed') || 0)));
  const [tw, th] = part === 'cover' ? [145, 220] : [140, 215];
  const W = tw + bleed * 2, H = th + bleed * 2;
  document.body.classList.add('is-print');
  let style = document.getElementById('print-page-size');
  if (!style) { style = document.createElement('style'); style.id = 'print-page-size'; document.head.appendChild(style); }
  style.textContent = `@page { size: ${W}mm ${H}mm; margin: 0; } body.is-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .sheet { width: ${W}mm; height: ${H}mm; }`;
  onLeave(() => { style.remove(); document.body.classList.remove('is-print'); });

  // Картинка вписывается «под обрез»: заполняет лист с вылетами, лишнее уходит за край
  const fit = (el, ratio) => {
    let w = W, hh = W / ratio;
    if (hh < H) { hh = H; w = H * ratio; }
    el.style.width = `${w}mm`; el.style.height = `${hh}mm`;
    el.style.left = `${(W - w) / 2}mm`; el.style.top = `${(H - hh) / 2}mm`;
    return el;
  };
  const sheets = h('div', { class: 'print-sheets' });
  if (part === 'cover') {
    const cv = c.covers.find((x) => x.id === d.cover.id);
    sheets.appendChild(h('div', { class: 'sheet' }, fit(renderCover(c, cv, d.heroes, d.cover), c.coverRef.w / c.coverRef.h)));
  } else {
    const list = bookSpreads(c, d);
    list.forEach((p, i) => sheets.appendChild(h('div', { class: 'sheet' }, fit(renderPage(c, p, d.heroes, { number: i + 1 }), c.book.ref.w / c.book.ref.h))));
    if (list.length % 2) sheets.appendChild(h('div', { class: 'sheet' }));
  }
  const ready = h('span', null, 'Загружаем картинки…');
  const printBtn = h('button', { type: 'button', class: 'btn btn-sm', disabled: true, onclick: () => window.print() }, 'Сохранить PDF');
  const bleedSel = h('select', { class: 'input input-sm', style: { width: 'auto', height: '34px' }, onchange: (e) => { params.set('bleed', e.target.value); go(`${location.pathname}?${params}`, true); } },
    [0, 3, 5].map((v) => h('option', { value: v, selected: v === bleed }, v ? `вылеты ${v} мм` : 'без вылетов')));
  clear(root).append(
    h('div', { class: 'print-bar' },
      h('b', null, `${label} · ${part === 'cover' ? `обложка ${tw}×${th} мм` : `блок ${tw}×${th} мм, ${sheets.children.length} стр.`}`),
      bleedSel, ready, printBtn,
      h('span', { class: 'small', style: { opacity: '.7' } }, 'В окне печати: «Сохранить как PDF», поля — «Нет», включите «Фоновая графика».'),
    ),
    sheets,
  );
  const imgs = [...sheets.querySelectorAll('img')];
  imgs.forEach((i) => i.removeAttribute('loading'));
  Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => document.fonts.ready).then(() => {
    ready.textContent = `Готово: ${imgs.length} слоёв загружено`;
    printBtn.disabled = false;
  });
}

// ---------------- Условия ----------------
function pageTerms() {
  const c = state.catalog;
  const sec = (t, ...p) => h('div', { class: 'terms-sec' }, h('h2', { class: 'h3' }, t), p.map((x) => h('p', null, x)));
  page(nav({}), h('section', { class: 'flow terms' },
    h('div', { class: 'flow-title' }, h('h1', { class: 'h1' }, 'Условия ', h('em', null, 'заказа'))),
    sec('Что вы покупаете', `Персональную книгу в твёрдом переплёте: блок 215 × 140 мм, обложка 220 × 145 мм, мелованная бумага. Книга печатается по макету, который вы собрали на сайте. Стоимость — ${rub(c.price)} за экземпляр, доставка по России бесплатная.`),
    sec('Оплата', 'Оплата принимается онлайн через сервис ЮKassa: банковские карты, СБП, SberPay, ЮMoney. Данные карты вводятся на защищённой странице ЮKassa и нам не передаются. Электронный чек приходит на почту, указанную при заказе.'),
    sec('Изготовление и доставка', 'После оплаты мы проверяем макет и передаём книгу в печать. Обычно доставка занимает около 5 рабочих дней. Доставка курьером или в пункт выдачи — бесплатно. Статус заказа можно посмотреть по ссылке из письма.'),
    sec('Изменения и возврат', 'До оплаты книгу можно менять сколько угодно. После оплаты макет уходит в печать, поэтому изменить его нельзя. Книга изготавливается по индивидуальному заказу, поэтому книга надлежащего качества возврату не подлежит. Если книга пришла с браком печати или повреждённой — мы бесплатно напечатаем и пришлём новую или вернём деньги.'),
    sec('Персональные данные', 'Мы используем имя, телефон, почту и адрес только для изготовления и доставки заказа и не передаём их третьим лицам, кроме службы доставки и платёжного сервиса.'),
    c.contactEmail ? sec('Контакты', h('span', null, 'Почта: ', h('a', { href: `mailto:${c.contactEmail}` }, c.contactEmail))) : null,
  ));
}

// ---------------- Мои книги ----------------
async function pageMyBooks() {
  const c = state.catalog;
  const tokens = myBooks.list();
  const grid = h('div', { class: 'my-grid' });
  page(nav({}), h('section', { class: 'flow' },
    h('div', { class: 'flow-title' }, h('h1', { class: 'h1' }, 'Мои ', h('em', null, 'книги')), h('p', { class: 'muted' }, 'Книги, которые вы начинали на этом устройстве.')),
    grid,
    h('div', { class: 'flow-actions' }, h('a', { href: '/create', 'data-link': true, class: 'btn btn-dark btn-lg' }, 'Создать новую книгу')),
  ));
  if (!tokens.length) { grid.appendChild(h('p', { class: 'muted center' }, 'Пока пусто.')); return; }
  for (const t of tokens) {
    try {
      const b = await api.getBook(t);
      const d = b.data;
      const cv = d.cover && c.covers.find((x) => x.id === d.cover.id);
      grid.appendChild(h('a', { href: `/b/${t}`, 'data-link': true, class: 'my-card' },
        cv ? renderCover(c, cv, d.heroes, d.cover, { lazy: true }) : h('div', { class: 'cover cover-empty', style: { aspectRatio: `${c.coverRef.w} / ${c.coverRef.h}` } }, h('span', null, 'Без обложки')),
        h('b', null, d.heroes.giver && d.heroes.receiver ? `${d.heroes.giver.name} & ${d.heroes.receiver.name}` : 'Черновик'),
      ));
    } catch { /* книга удалена */ }
  }
}

// ---------------- Ошибки ----------------
function pageNotFound() {
  page(nav({}), h('section', { class: 'flow center' }, h('h1', { class: 'h1' }, 'Страница ', h('em', null, 'не найдена')), h('a', { href: '/', 'data-link': true, class: 'btn btn-dark' }, 'На главную')));
}

function pageError(err) {
  page(nav({}), h('section', { class: 'flow center' },
    h('h1', { class: 'h1' }, 'Что-то ', h('em', null, 'пошло не так')),
    h('p', { class: 'muted' }, err.message || 'Неизвестная ошибка'),
    h('div', { class: 'btn-row center' },
      h('button', { type: 'button', class: 'btn btn-dark', onclick: () => render() }, 'Попробовать ещё раз'),
      h('a', { href: '/', 'data-link': true, class: 'btn btn-soft' }, 'На главную'),
    ),
  ));
}

render();
