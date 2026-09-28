const CATEGORIES = {
  us: '美区',
  jp: '日区',
  hk: '港区',
  uk: '英区',
  ca: '加区',
  other: '其他'
};

const PUBLIC_SETTINGS = ['notice', 'contact_wechat', 'service_time'];
const ADMIN_SETTINGS = ['notice', 'contact_wechat', 'service_time', 'wechat_qr', 'alipay_qr'];
const MAX_TEXT = 2000;
const MAX_QR_LEN = 500000;
const TOKEN_TTL = 7 * 24 * 3600 * 1000;
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    try {
      return await route(request, env, url);
    } catch (err) {
      console.error('api error:', err && err.stack ? err.stack : err);
      return json({ error: '服务器开小差了，请稍后再试' }, 500);
    }
  }
};

async function route(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/health') return json({ ok: true, time: Date.now() });
  if (pathname === '/api/config' && method === 'GET') return getConfig(env);
  if (pathname === '/api/pay' && method === 'GET') return getPayInfo(env);
  if (pathname === '/api/orders' && method === 'POST') return createOrder(request, env);

  let m = pathname.match(/^\/api\/orders\/([A-Za-z0-9-]{4,40})$/);
  if (m && method === 'GET') return getOrder(env, m[1], url.searchParams.get('key') || '');

  m = pathname.match(/^\/api\/orders\/([A-Za-z0-9-]{4,40})\/claim$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    return claimOrder(env, m[1], (body && body.key) || '');
  }

  if (pathname === '/api/admin/login' && method === 'POST') return adminLogin(request, env);

  if (pathname.startsWith('/api/admin/')) {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;

    if (pathname === '/api/admin/orders' && method === 'GET') return adminListOrders(env, url);
    if (pathname === '/api/admin/products' && method === 'GET') return adminListProducts(env);
    if (pathname === '/api/admin/products' && method === 'POST') return adminSaveProduct(request, env);
    if (pathname === '/api/admin/codes' && method === 'GET') return adminListCodes(env, url);
    if (pathname === '/api/admin/codes' && method === 'POST') return adminAddCodes(request, env);
    if (pathname === '/api/admin/settings' && method === 'GET') return adminGetSettings(env);
    if (pathname === '/api/admin/settings' && method === 'POST') return adminSaveSettings(request, env);

    m = pathname.match(/^\/api\/admin\/codes\/(\d+)$/);
    if (m && method === 'DELETE') return adminDeleteCode(env, m[1]);

    m = pathname.match(/^\/api\/admin\/orders\/([A-Za-z0-9-]{4,40})$/);
    if (m && method === 'GET') return adminGetOrder(env, m[1]);

    m = pathname.match(/^\/api\/admin\/orders\/([A-Za-z0-9-]{4,40})\/action$/);
    if (m && method === 'POST') return adminOrderAction(request, env, m[1]);

    return json({ error: '接口不存在' }, 404);
  }

  return json({ error: '接口不存在' }, 404);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function str(value, max = 200) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function int(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const row of results) out[row.key] = row.value;
  return out;
}

async function getConfig(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.category, p.name, p.subtitle, p.face, p.price, p.list_price AS listPrice,
            p.badge, p.sort,
            (SELECT COUNT(*) FROM codes c WHERE c.product_id = p.id AND c.used = 0) AS stock
     FROM products p
     WHERE p.active = 1
     ORDER BY p.sort ASC, p.price ASC`
  ).all();

  const settings = await getSettings(env);
  const pub = {};
  for (const key of PUBLIC_SETTINGS) pub[key] = settings[key] || '';

  return json({
    settings: pub,
    categories: CATEGORIES,
    products: results.map((p) => ({ ...p, categoryName: CATEGORIES[p.category] || p.category }))
  });
}

async function getPayInfo(env) {
  const settings = await getSettings(env);
  return json({
    wechatQr: settings.wechat_qr || '',
    alipayQr: settings.alipay_qr || '',
    contactWechat: settings.contact_wechat || '',
    serviceTime: settings.service_time || ''
  });
}

function randomKey(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += KEY_CHARS[b % KEY_CHARS.length];
  return out;
}

async function newOrderId(env) {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  for (let i = 0; i < 6; i++) {
    const id = `AGC${ymd}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const row = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(id).first();
    if (!row) return id;
  }
  return `AGC${ymd}-${randomKey(6)}`;
}

async function createOrder(request, env) {
  const body = await readJson(request);
  const productId = str(body.productId, 64);
  const contact = str(body.contact, 64).trim();
  const quantity = Math.min(10, Math.max(1, int(body.quantity, 1)));
  const payMethod = body.payMethod === 'alipay' ? 'alipay' : 'wechat';

  if (!productId) return json({ error: '请选择要购买的商品' }, 400);
  if (contact.length < 2) return json({ error: '请填写有效的联系方式（微信号或邮箱）' }, 400);

  const product = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND active = 1')
    .bind(productId)
    .first();
  if (!product) return json({ error: '商品不存在或已下架' }, 404);

  const id = await newOrderId(env);
  const key = randomKey(6);
  const now = Date.now();
  const amount = product.price * quantity;

  await env.DB.prepare(
    `INSERT INTO orders (id, lookup, product_id, product_name, category, face, quantity, amount, contact, pay_method, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  )
    .bind(id, key, product.id, product.name, product.category, product.face, quantity, amount, contact, payMethod, now)
    .run();

  return json({
    id,
    key,
    status: 'pending',
    amount,
    quantity,
    productName: product.name,
    payMethod,
    createdAt: now
  });
}

function publicOrder(o) {
  return {
    id: o.id,
    status: o.status,
    productId: o.product_id,
    productName: o.product_name,
    category: o.category,
    face: o.face,
    quantity: o.quantity,
    amount: o.amount,
    contact: o.contact,
    payMethod: o.pay_method,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    deliveredAt: o.delivered_at,
    codes: o.status === 'delivered' && o.codes ? o.codes.split('\n') : []
  };
}

async function getOrder(env, id, key) {
  if (!key) return json({ error: '缺少订单查询凭证' }, 400);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND lookup = ?')
    .bind(id, key)
    .first();
  if (!order) return json({ error: '订单不存在，或查询凭证不正确' }, 404);
  return json(publicOrder(order));
}

async function claimOrder(env, id, key) {
  if (!key) return json({ error: '缺少订单查询凭证' }, 400);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND lookup = ?')
    .bind(id, key)
    .first();
  if (!order) return json({ error: '订单不存在，或查询凭证不正确' }, 404);
  if (order.status === 'pending') {
    await env.DB.prepare("UPDATE orders SET status = 'claimed' WHERE id = ?").bind(id).run();
    order.status = 'claimed';
  }
  return json(publicOrder(order));
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b)))
  ]);
  const ua = new Uint8Array(ha);
  const ub = new Uint8Array(hb);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function adminLogin(request, env) {
  const password = env.ADMIN_PASSWORD || '';
  if (!password) return json({ error: '后台未设置 ADMIN_PASSWORD，请先配置环境变量' }, 500);

  const body = await readJson(request);
  const input = str(body.password, 128);
  if (!(await safeEqual(input, password))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return json({ error: '密码不正确' }, 401);
  }

  const exp = Date.now() + TOKEN_TTL;
  const token = `${exp}.${await hmacHex(password, String(exp))}`;
  return json({ token, exp });
}

async function requireAdmin(request, env) {
  const password = env.ADMIN_PASSWORD || '';
  const token = request.headers.get('x-admin-token') || '';
  const [expStr, sig] = token.split('.');
  const exp = parseInt(expStr, 10);
  if (!password || !sig || !Number.isFinite(exp) || exp < Date.now()) {
    return json({ error: '登录已过期，请重新登录' }, 401);
  }
  const expected = await hmacHex(password, expStr);
  if (!(await safeEqual(sig, expected))) {
    return json({ error: '登录已过期，请重新登录' }, 401);
  }
  return null;
}

async function adminListOrders(env, url) {
  const status = url.searchParams.get('status') || '';
  const limit = Math.min(500, Math.max(1, int(url.searchParams.get('limit'), 200)));

  let sql = 'SELECT * FROM orders';
  const binds = [];
  if (status) {
    sql += ' WHERE status = ?';
    binds.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  binds.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const { results: statRows } = await env.DB.prepare(
    'SELECT status, COUNT(*) AS n FROM orders GROUP BY status'
  ).all();

  const stats = { total: 0 };
  for (const row of statRows) {
    stats[row.status] = row.n;
    stats.total += row.n;
  }

  return json({
    orders: results.map((o) => ({ ...o, codes: o.codes ? o.codes.split('\n') : [] })),
    stats
  });
}

async function adminGetOrder(env, id) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) return json({ error: '订单不存在' }, 404);
  return json({ order: { ...order, codes: order.codes ? order.codes.split('\n') : [] } });
}

async function adminOrderAction(request, env, id) {
  const body = await readJson(request);
  const action = str(body.action, 20);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) return json({ error: '订单不存在' }, 404);

  if (action === 'verify') {
    if (!['pending', 'claimed'].includes(order.status)) return json({ error: '当前状态不能确认收款' }, 400);
    await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?")
      .bind(Date.now(), id)
      .run();
    return json({ ok: true, status: 'paid' });
  }

  if (action === 'deliver') {
    if (order.status !== 'paid') return json({ error: '请先确认收款，再交付卡密' }, 400);
    const { results: avail } = await env.DB.prepare(
      'SELECT id, code FROM codes WHERE product_id = ? AND used = 0 ORDER BY id ASC LIMIT ?'
    )
      .bind(order.product_id, order.quantity)
      .all();
    if (avail.length < order.quantity) {
      return json({ error: `可用卡密不足（需要 ${order.quantity} 张，仅剩 ${avail.length} 张），请先导入卡密` }, 400);
    }
    const ids = avail.map((c) => c.id);
    const codesText = avail.map((c) => c.code).join('\n');
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.batch([
      env.DB.prepare(`UPDATE codes SET used = 1, order_id = ? WHERE id IN (${placeholders})`).bind(order.id, ...ids),
      env.DB.prepare("UPDATE orders SET status = 'delivered', codes = ?, delivered_at = ? WHERE id = ?")
        .bind(codesText, Date.now(), order.id)
    ]);
    return json({ ok: true, status: 'delivered', codes: avail.map((c) => c.code) });
  }

  if (action === 'cancel') {
    if (order.status === 'delivered') return json({ error: '已交付的订单不能取消' }, 400);
    await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(id).run();
    return json({ ok: true, status: 'cancelled' });
  }

  return json({ error: '未知操作' }, 400);
}

async function adminListProducts(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.*, p.list_price AS listPrice,
            (SELECT COUNT(*) FROM codes c WHERE c.product_id = p.id AND c.used = 0) AS stock,
            (SELECT COUNT(*) FROM codes c WHERE c.product_id = p.id) AS stockTotal
     FROM products p
     ORDER BY p.category ASC, p.sort ASC, p.price ASC`
  ).all();
  return json({ products: results, categories: CATEGORIES });
}

async function adminSaveProduct(request, env) {
  const body = await readJson(request);
  const id = str(body.id, 40).trim().toLowerCase();
  const category = str(body.category, 20);
  const name = str(body.name, 80).trim();
  const price = int(body.price, 0);

  if (!/^[a-z0-9-]{2,40}$/.test(id)) return json({ error: '商品 ID 只能包含小写字母、数字和短横线' }, 400);
  if (!CATEGORIES[category]) return json({ error: '商品分类无效' }, 400);
  if (!name) return json({ error: '请填写商品名称' }, 400);
  if (price <= 0) return json({ error: '价格必须大于 0' }, 400);

  await env.DB.prepare(
    `INSERT INTO products (id, category, name, subtitle, face, price, list_price, badge, sort, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       category = excluded.category,
       name = excluded.name,
       subtitle = excluded.subtitle,
       face = excluded.face,
       price = excluded.price,
       list_price = excluded.list_price,
       badge = excluded.badge,
       sort = excluded.sort,
       active = excluded.active`
  )
    .bind(
      id,
      category,
      name,
      str(body.subtitle, 160).trim(),
      str(body.face, 30).trim(),
      price,
      Math.max(0, int(body.listPrice, 0)),
      str(body.badge, 20).trim(),
      int(body.sort, 0),
      body.active ? 1 : 0
    )
    .run();

  return json({ ok: true, id });
}

async function adminListCodes(env, url) {
  const productId = str(url.searchParams.get('productId'), 64);
  if (!productId) return json({ error: '请选择商品' }, 400);
  const { results } = await env.DB.prepare(
    'SELECT id, product_id, code, used, order_id, created_at FROM codes WHERE product_id = ? ORDER BY id DESC LIMIT 1000'
  )
    .bind(productId)
    .all();
  return json({ codes: results });
}

async function adminAddCodes(request, env) {
  const body = await readJson(request);
  const productId = str(body.productId, 64);
  const raw = str(body.codes, 200000);

  if (!productId) return json({ error: '请选择商品' }, 400);
  const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first();
  if (!product) return json({ error: '商品不存在' }, 404);

  const lines = [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  if (!lines.length) return json({ error: '没有可导入的卡密' }, 400);
  if (lines.length > 2000) return json({ error: '单次最多导入 2000 条' }, 400);

  const now = Date.now();
  const stmts = lines.map((code) =>
    env.DB.prepare('INSERT OR IGNORE INTO codes (product_id, code, used, created_at) VALUES (?, ?, 0, ?)')
      .bind(productId, code, now)
  );
  await env.DB.batch(stmts);

  const { results } = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM codes WHERE product_id = ? AND used = 0'
  )
    .bind(productId)
    .all();

  return json({ ok: true, submitted: lines.length, stock: results[0] ? results[0].n : 0 });
}

async function adminDeleteCode(env, id) {
  const code = await env.DB.prepare('SELECT id, used FROM codes WHERE id = ?').bind(id).first();
  if (!code) return json({ error: '卡密不存在' }, 404);
  if (code.used) return json({ error: '已使用的卡密不能删除' }, 400);
  await env.DB.prepare('DELETE FROM codes WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function adminGetSettings(env) {
  const settings = await getSettings(env);
  return json({ settings });
}

async function adminSaveSettings(request, env) {
  const body = await readJson(request);
  const stmts = [];
  for (const key of ADMIN_SETTINGS) {
    if (!(key in body)) continue;
    let value = str(body[key], MAX_TEXT).trim();
    if ((key === 'wechat_qr' || key === 'alipay_qr') && value) {
      if (value.length > MAX_QR_LEN) return json({ error: '收款码图片过大，请压缩后重试' }, 400);
      if (!/^(https?:\/\/|data:image\/)/.test(value)) {
        return json({ error: '收款码必须是图片链接或上传的图片' }, 400);
      }
    }
    stmts.push(
      env.DB.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).bind(key, value)
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}
