import { h, clear, toast, debounce, rub } from './dom.js';
import { api, loadCatalog, myBooks } from './api.js';
import { figure, cropFigure, newHero, setGender, randomize, HAIR_COLORS } from './hero.js';
import { renderCover } from './cover.js';

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
    if ((m = path.match(/^\/b\/([a-zA-Z0-9]+)(?:\/(.*))?$/))) {
      const book = await loadBook(m[1]);
      const sub = m[2] || '';
      if (sub === '') return pageSummary(book);
      if (sub === 'heroes') return pageHeroes(book);
      if (sub === 'hero/giver' || sub === 'hero/receiver') return pageBuilder(book, sub.split('/')[1]);
      if (sub === 'occasion') return pageOccasion(book);
      if (sub === 'cover') return pageCovers(book);
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
    ['#how', 'Как это работает'], ['#covers', 'Обложки'], ['#book', 'Книга'], ['#faq', 'Вопросы'],
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
    ['', 'Книга', false],
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
      howCard('03', 'Получите книгу', 'Мы печатаем на плотной мелованной бумаге в твёрдом переплёте и бесплатно доставляем.', h('div', { class: 'how-book' }, h('span', null, '215'), h('i', null, '×'), h('span', null, '140'))),
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
    ].map(([q, a]) => h('details', { class: 'faq-item' }, h('summary', null, q, h('i', null)), h('p', null, a)))),
  );

  const footer = h('footer', { class: 'footer' },
    h('div', { class: 'footer-in' },
      h('div', null, logo(), h('p', { class: 'muted' }, 'Персональные книги-подарки')),
      h('div', { class: 'footer-cols' },
        h('div', null, h('b', null, 'Помощь'), h('a', { href: 'mailto:ship@knigagai.ru' }, 'ship@knigagai.ru')),
        h('div', null, h('b', null, 'Книга'), h('a', { href: '/create', 'data-link': true }, 'Создать книгу'), h('a', { href: '/books', 'data-link': true }, 'Мои книги')),
      ),
    ),
    h('p', { class: 'footer-legal' }, `© ${new Date().getFullYear()} ООО «Книгигай»`),
  );

  const sticky = h('a', { href: '/create', 'data-link': true, class: 'sticky-cta' }, 'Создать книгу', h('span', null, rub(c.price)));

  page(nav({ home: true }), hero, marquee, how, coversSection, why, faq, footer, sticky);
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
  const ready = d.heroes.giver && d.heroes.receiver;
  page(
    flowHeader(book, 'heroes'),
    h('section', { class: 'flow' },
      h('div', { class: 'flow-title' },
        h('h1', { class: 'h1' }, 'Начнём с главного — ', h('em', null, 'героев')),
        h('p', { class: 'muted' }, 'Создайте двух персонажей: себя и того, кому дарите книгу.'),
      ),
      h('div', { class: 'hero-cards' }, card('giver'), h('div', { class: 'hero-and' }, '&'), card('receiver')),
      h('div', { class: 'flow-actions' },
        h('a', { href: `/b/${book.token}/occasion`, 'data-link': true, class: `btn btn-dark btn-lg ${ready ? '' : 'is-disabled'}`, 'aria-disabled': ready ? null : 'true', onclick: (e) => { if (!ready) { e.preventDefault(); e.stopPropagation(); toast('Сначала создайте обоих героев'); } } }, 'Дальше: повод'),
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
  { id: 'top', label: 'Верх', field: 'top', cat: 'tops', region: 'torso' },
  { id: 'jacket', label: 'Куртки', field: 'jacket', cat: 'jackets', region: 'torso', optional: true, clears: 'bodice' },
  { id: 'bodice', label: 'Корсеты', field: 'bodice', cat: 'bodice', region: 'torso', optional: true, clears: 'jacket', only: 'female' },
  { id: 'pants', label: 'Низ', field: 'pants', cat: 'pants', region: 'legs' },
  { id: 'shoes', label: 'Обувь', field: 'shoes', cat: 'shoes', region: 'feet', optional: true },
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

  function drawTabs() {
    clear(tabsEl);
    for (const t of visibleTabs()) {
      tabsEl.appendChild(h('button', {
        type: 'button', role: 'tab', class: `b-tab ${t.id === tab ? 'is-on' : ''}`, 'aria-selected': t.id === tab ? 'true' : 'false',
        onclick: () => { tab = t.id; drawTabs(); drawGrid(); grid.scrollTop = 0; },
      }, t.label));
    }
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
  const nextStep = !(d.heroes.giver && d.heroes.receiver) ? 'heroes' : !d.occasion ? 'occasion' : !d.cover ? 'cover' : null;
  const link = `${location.origin}/b/${book.token}`;
  const email = h('input', { class: 'input', type: 'email', placeholder: 'почта@пример.ru', value: book.email || '', 'aria-label': 'Почта' });

  page(
    flowHeader(book, ''),
    h('section', { class: 'flow' },
      h('div', { class: 'summary' },
        h('div', { class: 'summary-cover' }, cv ? renderCover(c, cv, d.heroes, d.cover) : h('div', { class: 'cover cover-empty', style: { aspectRatio: `${c.coverRef.w} / ${c.coverRef.h}` } }, h('span', null, 'Здесь будет обложка'))),
        h('div', { class: 'summary-side' },
          h('p', { class: 'eyebrow' }, 'Ваша книга'),
          h('h1', { class: 'h1' }, d.heroes.giver && d.heroes.receiver ? [d.heroes.giver.name, h('em', null, ' & '), d.heroes.receiver.name] : 'Черновик книги'),
          h('ul', { class: 'checklist' },
            checkItem(!!(d.heroes.giver && d.heroes.receiver), 'Герои', `/b/${book.token}/heroes`),
            checkItem(!!d.occasion, d.occasion ? `Повод: ${occasionLabel(d.occasion)}` : 'Повод', `/b/${book.token}/occasion`),
            checkItem(!!d.cover, 'Обложка', `/b/${book.token}/cover`),
            h('li', { class: 'is-soon' }, h('span', { class: 'ck' }), h('span', null, 'Страницы книги и заказ'), h('small', null, 'скоро')),
          ),
          nextStep
            ? h('a', { href: `/b/${book.token}/${nextStep}`, 'data-link': true, class: 'btn btn-dark btn-lg' }, 'Продолжить')
            : h('div', { class: 'note' }, h('b', null, 'Обложка готова!'), ' Следующий шаг — страницы книги и оформление заказа. Мы откроем его совсем скоро, а ваша книга уже сохранена.'),
          h('div', { class: 'save-link' },
            h('p', { class: 'small' }, 'Ссылка на вашу книгу — по ней можно вернуться с любого устройства:'),
            h('div', { class: 'copy-row' },
              h('input', { class: 'input input-sm', readonly: true, value: link, 'aria-label': 'Ссылка на книгу', onfocus: (e) => e.target.select() }),
              h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); } catch { toast('Выделите ссылку и скопируйте вручную'); } } }, 'Копировать'),
            ),
            h('form', { class: 'copy-row', onsubmit: async (e) => { e.preventDefault(); try { await saveBook({ email: email.value }); toast('Почта сохранена'); } catch (ex) { toast(ex.message, 'error'); } } },
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
