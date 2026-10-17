// Client-side product listing. Fetches /api/products so tests can exercise
// network interception, empty results and API failure handling in the UI.
(function () {
  'use strict';

  const form = document.querySelector('[data-testid="product-filters"]');
  const search = document.getElementById('q');
  const category = document.getElementById('category');
  const sort = document.getElementById('sort');
  const list = document.querySelector('[data-testid="product-list"]');
  const count = document.querySelector('[data-testid="results-count"]');
  const errorBox = document.querySelector('[data-testid="products-error"]');
  const empty = document.querySelector('[data-testid="empty-state"]');
  const retry = document.querySelector('[data-testid="retry-button"]');
  const toast = document.querySelector('[data-testid="toast"]');
  const badge = document.querySelector('[data-testid="cart-count"]');

  const money = (n) => '$' + Number(n).toFixed(2);

  // Restore filters from the URL so a refresh keeps the user's place.
  const params = new URLSearchParams(window.location.search);
  search.value = params.get('q') || '';
  category.value = params.get('category') || '';
  sort.value = params.get('sort') || 'relevance';

  function syncUrl() {
    const next = new URLSearchParams();
    if (search.value.trim()) next.set('q', search.value.trim());
    if (category.value) next.set('category', category.value);
    if (sort.value !== 'relevance') next.set('sort', sort.value);
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
  }

  function card(product) {
    const li = document.createElement('li');
    li.className = 'product-card';
    li.setAttribute('data-testid', 'product-card');
    li.dataset.productId = String(product.id);

    const h2 = document.createElement('h2');
    const link = document.createElement('a');
    link.href = '/products/' + product.id;
    link.textContent = product.name;
    h2.appendChild(link);

    const price = document.createElement('p');
    price.className = 'price';
    price.setAttribute('data-testid', 'product-price');
    price.textContent = money(product.price);

    const cat = document.createElement('p');
    cat.className = 'muted';
    cat.textContent = product.category.charAt(0).toUpperCase() + product.category.slice(1);

    const button = document.createElement('button');
    button.type = 'button';
    if (product.inStock) {
      button.textContent = 'Add to cart';
      button.setAttribute('aria-label', 'Add to cart: ' + product.name);
      button.addEventListener('click', () => addToCart(product, button));
    } else {
      button.textContent = 'Out of stock';
      button.disabled = true;
    }

    li.append(h2, price, cat, button);
    return li;
  }

  async function load() {
    errorBox.hidden = true;
    empty.hidden = true;
    count.textContent = 'Loading products…';
    list.replaceChildren();
    const query = new URLSearchParams({ limit: '50', sort: sort.value });
    if (search.value.trim()) query.set('q', search.value.trim());
    if (category.value) query.set('category', category.value);
    try {
      const response = await fetch('/api/products?' + query.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.json();
      if (!body || !Array.isArray(body.data)) throw new Error('Malformed response');
      list.replaceChildren(...body.data.map(card));
      const total =
        body.pagination && typeof body.pagination.total === 'number'
          ? body.pagination.total
          : body.data.length;
      count.textContent = total === 1 ? '1 product' : total + ' products';
      empty.hidden = body.data.length > 0;
    } catch (err) {
      count.textContent = '';
      errorBox.hidden = false;
    }
  }

  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.textContent = '';
    }, 4000);
  }

  async function addToCart(product, button) {
    button.disabled = true;
    try {
      const response = await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        showToast((body && body.error && body.error.message) || 'Could not add item to cart');
        return;
      }
      badge.textContent = String(body.itemCount);
      showToast('Added ' + product.name + ' to cart');
    } catch (err) {
      showToast('Network error. Please try again.');
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    syncUrl();
    load();
  });
  category.addEventListener('change', () => {
    syncUrl();
    load();
  });
  sort.addEventListener('change', () => {
    syncUrl();
    load();
  });
  retry.addEventListener('click', load);

  load();
})();
