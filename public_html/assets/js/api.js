// Обращения к серверу

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) throw new Error((data && data.error) || `Ошибка ${res.status}`);
  return data;
}

let catalogPromise = null;
export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = request('GET', '/api/catalog').catch((e) => { catalogPromise = null; throw e; });
  }
  return catalogPromise;
}

export const api = {
  createBook: () => request('POST', '/api/books'),
  getBook: (token) => request('GET', `/api/books/${encodeURIComponent(token)}`),
  patchBook: (token, patch) => request('PATCH', `/api/books/${encodeURIComponent(token)}`, patch),
  createOrder: (token, form) => request('POST', `/api/books/${encodeURIComponent(token)}/order`, form),
  getOrder: (token) => request('GET', `/api/orders/${encodeURIComponent(token)}`),
  payOrder: (token) => request('POST', `/api/orders/${encodeURIComponent(token)}/pay`, {}),
  orderSnapshot: (token) => request('GET', `/api/orders/${encodeURIComponent(token)}/print`),
};

// «Мои книги» — список токенов на этом устройстве
const KEY = 'kg_books';
export const myBooks = {
  list() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  },
  add(token) {
    try {
      const l = myBooks.list().filter((t) => t !== token);
      l.unshift(token);
      localStorage.setItem(KEY, JSON.stringify(l.slice(0, 20)));
    } catch { /* приватный режим */ }
  },
};
