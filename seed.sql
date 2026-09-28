INSERT OR IGNORE INTO products (id, category, name, subtitle, face, price, list_price, badge, sort, active) VALUES
  ('us-5',    'us', 'App Store 礼品卡 $5',   '适用于美区 App Store / iTunes / iCloud 消费', '$5',    3800,  4200, '',     10, 1),
  ('us-10',   'us', 'App Store 礼品卡 $10',  '适用于美区 App Store / iTunes / iCloud 消费', '$10',   7500,  8200, '热卖', 20, 1),
  ('us-15',   'us', 'App Store 礼品卡 $15',  '适用于美区 App Store / iTunes / iCloud 消费', '$15',  10800, 11800, '',     30, 1),
  ('us-25',   'us', 'App Store 礼品卡 $25',  '适用于美区 App Store / iTunes / iCloud 消费', '$25',  17800, 19500, '热卖', 40, 1),
  ('us-50',   'us', 'App Store 礼品卡 $50',  '适用于美区 App Store / iTunes / iCloud 消费', '$50',  34900, 38000, '',     50, 1),
  ('us-100',  'us', 'App Store 礼品卡 $100', '适用于美区 App Store / iTunes / iCloud 消费', '$100', 68800, 75000, '',     60, 1),
  ('jp-1500', 'jp', 'App Store 礼品卡 ¥1,500',  '适用于日区 App Store / iTunes / iCloud 消费', '¥1,500',  7800,  8600, '',   110, 1),
  ('jp-3000', 'jp', 'App Store 礼品卡 ¥3,000',  '适用于日区 App Store / iTunes / iCloud 消费', '¥3,000',  14900, 16500, '热卖', 120, 1),
  ('jp-5000', 'jp', 'App Store 礼品卡 ¥5,000',  '适用于日区 App Store / iTunes / iCloud 消费', '¥5,000',  24500, 27000, '',   130, 1),
  ('jp-10000','jp', 'App Store 礼品卡 ¥10,000', '适用于日区 App Store / iTunes / iCloud 消费', '¥10,000', 48500, 54000, '',   140, 1),
  ('hk-100',  'hk', 'App Store 礼品卡 HK$100',  '适用于港区 App Store / iTunes / iCloud 消费', 'HK$100',   9500, 10500, '',   210, 1),
  ('hk-200',  'hk', 'App Store 礼品卡 HK$200',  '适用于港区 App Store / iTunes / iCloud 消费', 'HK$200',  18500, 20000, '',   220, 1),
  ('hk-500',  'hk', 'App Store 礼品卡 HK$500',  '适用于港区 App Store / iTunes / iCloud 消费', 'HK$500',  45800, 50000, '热卖', 230, 1),
  ('hk-1000', 'hk', 'App Store 礼品卡 HK$1000', '适用于港区 App Store / iTunes / iCloud 消费', 'HK$1000', 89500, 97000, '',   240, 1);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('notice', '全场现货：付款核实后自动发卡，营业时间内一般 5-30 分钟到账。'),
  ('contact_wechat', 'agc-service'),
  ('service_time', '每天 9:00 - 23:00'),
  ('wechat_qr', ''),
  ('alipay_qr', '');
