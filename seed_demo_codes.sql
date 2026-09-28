INSERT INTO codes (product_id, code, created_at)
SELECT p.id,
       'DEMO-' || upper(replace(p.id, '-', '')) || '-' || printf('%04d', seq.n),
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM products p
JOIN (
  WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 3)
  SELECT n FROM seq
) seq
WHERE NOT EXISTS (SELECT 1 FROM codes c WHERE c.product_id = p.id);
