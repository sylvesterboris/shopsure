// Disable the submit button after the first click to discourage duplicate orders.
// The server is still the real guard: it de-duplicates by checkout token.
(function () {
  'use strict';
  const form = document.querySelector('[data-testid="checkout-form"]');
  if (!form) return;
  form.addEventListener('submit', () => {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Placing order…';
    }
  });
})();
