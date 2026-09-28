CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  face TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  list_price INTEGER NOT NULL DEFAULT 0,
  badge TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  code TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  order_id TEXT,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_codes_code ON codes(code);
CREATE INDEX IF NOT EXISTS idx_codes_product ON codes(product_id, used);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  lookup TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  face TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  contact TEXT NOT NULL,
  pay_method TEXT NOT NULL DEFAULT 'wechat',
  status TEXT NOT NULL DEFAULT 'pending',
  codes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  delivered_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
