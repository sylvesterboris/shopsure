# BUG-002: PATCH /api/products/:id silently resets `description` and `inStock`

> **Real defect.** Found by this test suite in the bundled ShopSure demo store (`demo-app/`)
> during framework development, reproduced manually with curl, then fixed.

| Field               | Value                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Bug ID**          | BUG-002                                                                                                                        |
| **Summary**         | A partial update overwrites fields that were not in the request body                                                           |
| **Status**          | Fixed (regression test passing)                                                                                                |
| **Severity**        | High: silent data loss; out-of-stock products become purchasable                                                               |
| **Priority**        | P1                                                                                                                             |
| **Reproducibility** | Always                                                                                                                         |
| **Found by**        | `tests/api/products/products-admin.spec.ts` › "PATCH with an empty body or unknown fields is rejected" (expected 400, got 200) |

## Environment

- Application: ShopSure demo store, `demo-app/validation.ts` before the fix
- Endpoint: `PATCH http://127.0.0.1:4173/api/products/:id`
- Client: Playwright APIRequestContext and curl
- OS: Linux, Node 22

## Preconditions

- Admin bearer token.
- A non-seed product with a description and `inStock: false`.

## Steps to reproduce

1. `POST /api/products` with
   `{"sku":"BUG-002","name":"Repro Item","description":"Original description","category":"home","price":10,"inStock":false}`.
2. `PATCH /api/products/<id>` with `{"price":12.5}`.
3. Compare the response with the product created in step 1.

## Expected result

Only `price` changes. `description` stays "Original description" and `inStock` stays `false`.

## Actual result

```
CREATE: {"id":13,...,"description":"Original description",...,"price":10,...,"inStock":false}
PATCH:  {"id":13,...,"description":"",...,"price":12.5,...,"inStock":true}
```

`description` is wiped and `inStock` flips to `true`. Additionally, `PATCH` with an empty body `{}`
returned 200 (and reset the same fields) instead of 400.

## Supporting evidence

- curl reproduction output above.
- Test output: `unexpected status, body: {"id":22,...,"description":"",...,"inStock":true}` with Expected 400, Received 200.

## Notes

- **Root cause:** the PATCH schema was derived with `productInputSchema.partial()`. The input
  schema gives `description` and `inStock` default values, and Zod still applies those defaults
  to missing keys after `.partial()`, so every PATCH body was filled with them. The
  "at least one field" check therefore never saw an empty object.
- **Fix:** PATCH is now built from the field rules without defaults (`productFields`).
- **Test gap closed:** the original PATCH test only checked `name`, `sku` and `category`. It now
  creates a product with a description and `inStock: false` and asserts the _entire_ product
  is unchanged apart from the patched field, both in the response and on a fresh GET.
