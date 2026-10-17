-- Named, parameterized queries used by database/DatabaseClient.ts.
-- Each query starts with a "-- name: <key>" line. Parameters use $1, $2, ...
-- Never concatenate values into these strings.

-- name: findOrderById
SELECT id, username, first_name, last_name, email, postal_code,
       subtotal_cents, tax_cents, shipping_cents, total_cents, status, created_at
FROM orders
WHERE id = $1;

-- name: findOrderItems
SELECT line_no, product_id, product_name, unit_price_cents, quantity, line_total_cents
FROM order_items
WHERE order_id = $1
ORDER BY line_no;

-- name: findItemsWithCatalogPrice
SELECT oi.product_id, oi.unit_price_cents, p.price_cents AS catalog_price_cents
FROM order_items oi
JOIN products p ON p.id = oi.product_id
WHERE oi.order_id = $1
ORDER BY oi.line_no;

-- name: sumOrderItems
SELECT COALESCE(SUM(line_total_cents), 0)::INTEGER AS items_total_cents,
       COALESCE(SUM(quantity), 0)::INTEGER        AS item_count
FROM order_items
WHERE order_id = $1;

-- name: countOrdersForUsername
SELECT COUNT(*)::INTEGER AS order_count
FROM orders
WHERE username = $1;

-- name: deleteOrdersForUsername
DELETE FROM orders
WHERE username = $1;
