-- ShopSure demo store schema (PostgreSQL 13+).
-- Applied automatically by the demo server when DATABASE_URL is set,
-- or manually with: npm run db:setup

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY,
  sku          TEXT        NOT NULL UNIQUE,
  name         TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  price_cents  INTEGER     NOT NULL CHECK (price_cents > 0),
  in_stock     BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orders (
  id                UUID        PRIMARY KEY,
  user_id           UUID        NOT NULL,
  username          TEXT        NOT NULL,
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  email             TEXT        NOT NULL,
  postal_code       TEXT        NOT NULL,
  subtotal_cents    INTEGER     NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents         INTEGER     NOT NULL CHECK (tax_cents >= 0),
  shipping_cents    INTEGER     NOT NULL CHECK (shipping_cents >= 0),
  total_cents       INTEGER     NOT NULL CHECK (total_cents >= 0),
  status            TEXT        NOT NULL CHECK (status IN ('PLACED', 'CANCELLED')),
  created_at        TIMESTAMPTZ NOT NULL
);

-- Order lines snapshot the product name and price at purchase time, so there is
-- deliberately no foreign key to products.
CREATE TABLE IF NOT EXISTS order_items (
  order_id          UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_no           INTEGER NOT NULL,
  product_id        INTEGER NOT NULL,
  product_name      TEXT    NOT NULL,
  unit_price_cents  INTEGER NOT NULL CHECK (unit_price_cents > 0),
  quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  line_total_cents  INTEGER NOT NULL,
  PRIMARY KEY (order_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
