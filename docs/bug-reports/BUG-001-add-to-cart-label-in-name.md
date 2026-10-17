# BUG-001: "Add to cart" buttons on the product list fail WCAG 2.5.3 (Label in Name)

> **Real defect.** Found by this test suite in the bundled ShopSure demo store (`demo-app/`)
> during framework development, then fixed. It is not a defect in any third-party product.

| Field               | Value                                                                               |
| ------------------- | ----------------------------------------------------------------------------------- |
| **Bug ID**          | BUG-001                                                                             |
| **Summary**         | The accessible name of each "Add to cart" button does not contain its visible label |
| **Status**          | Fixed (regression test passing)                                                     |
| **Severity**        | Medium: speech-input users cannot activate the button by saying what they see       |
| **Priority**        | P2                                                                                  |
| **Reproducibility** | Always (11 of 11 in-stock product cards)                                            |
| **Found by**        | `tests/ui/a11y/accessibility.spec.ts` › "product list and product detail pages"     |

## Environment

- Application: ShopSure demo store, `demo-app/public/products.js` before the fix
- URL: `http://127.0.0.1:4173/products`
- Browser: Chromium 141.0.7390.37 (Playwright 1.56.0), axe-core 4.14
- OS: Linux

## Preconditions

- Signed in as any customer.

## Steps to reproduce

1. Open `/products` and wait for the list to load.
2. Inspect any in-stock product card's button, e.g. for "Lumen Desk Lamp".
3. Or run: `npx playwright test --project=chromium --grep @a11y`.

## Expected result

The accessible name contains the visible text "Add to cart" (WCAG 2.1 SC 2.5.3), for example
`Add to cart: Lumen Desk Lamp`.

## Actual result

Visible text is "Add to cart", but `aria-label` was `Add Lumen Desk Lamp to cart`, which does
not contain the phrase "Add to cart". axe-core reported:

```
label-content-name-mismatch [serious]: Elements must have their visible text as part of their accessible name (11 node(s))
```

## Supporting evidence

- Failing assertion output from the run above (quoted in "Actual result").

## Notes

- Fix: `aria-label` changed to `Add to cart: <product name>`, which keeps buttons distinguishable
  for screen readers while starting with the visible label. `ProductsPage.addToCart()` was updated to match.
- The accessibility test now guards against regressions.
