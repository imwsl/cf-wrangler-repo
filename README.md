# AGC 礼品卡 · Apple 礼品卡下单网站

基于 **Cloudflare Workers + Workers Static Assets + D1** 的全栈下单网站：前台商品展示、扫码下单、订单自助查询与卡密交付；后台订单管理、商品管理、卡密库存与店铺设置。无构建步骤，`npx wrangler` 一键部署。

## 功能

**前台**

- 首页：多区域（美区 / 日区 / 港区）礼品卡面值列表、库存与补货状态、公告、常见问题
- 下单页：选数量、填联系方式、选微信 / 支付宝，提交后生成订单
- 订单页：显示收款码与应付金额（含付款备注提示）、「我已付款」上报、状态自动轮询、卡密一键复制
- 我的订单：本机订单列表 + 「订单号 + 查询凭证」跨设备查单
- 使用须知：兑换教程、区域限制、售后政策

**后台（`/admin`）**

- 订单：按状态筛选、统计卡片、确认收款、自动分配卡密交付、取消订单、查单链接复制
- 商品：新增 / 编辑 / 上架下架 / 排序 / 角标 / 原价
- 卡密：按商品批量导入（自动去重）、未使用 / 已使用列表、未使用卡密删除
- 设置：首页公告、客服微信、服务时间、微信 / 支付宝收款码（支持上传图片，自动压缩）

**安全**

- 后台基于 `ADMIN_PASSWORD`（Worker Secret）+ HMAC 登录令牌，令牌 7 天过期
- D1 全参数化查询；前端渲染统一转义
- 订单查询需「订单号 + 6 位随机凭证」，无法枚举

## 目录结构

```
├── wrangler.jsonc          # Worker / 静态资源 / D1 绑定配置
├── package.json            # 常用脚本（deploy / migrate / seed）
├── migrations/
│   └── 0001_init.sql       # D1 表结构
├── seed.sql                # 示例商品与默认设置
├── seed_demo_codes.sql     # 演示卡密（上线前删除，见下）
├── src/index.js            # Worker API（/api/*）
└── public/                 # 前端静态资源
    ├── index.html          # 首页
    ├── checkout.html       # 下单
    ├── order.html          # 订单详情
    ├── orders.html         # 我的订单
    ├── guide.html          # 使用须知
    ├── admin.html          # 后台
    ├── 404.html
    └── assets/             # ui.css / app.js / admin.js / favicon
```

## 部署步骤

前置：Node.js ≥ 18，已登录 Cloudflare（`npx wrangler login`）。

```bash
# 1. 创建 D1 数据库，把输出的 database_id 填入 wrangler.jsonc
npx wrangler d1 create apple-giftcard-db

# 2. 初始化表结构
npx wrangler d1 migrations apply apple-giftcard-db --remote

# 3. 导入示例商品与默认设置
npx wrangler d1 execute apple-giftcard-db --remote --file=./seed.sql

# 4.（可选）导入演示卡密，用于先跑通下单交付流程
npx wrangler d1 execute apple-giftcard-db --remote --file=./seed_demo_codes.sql

# 5. 设置后台密码
openssl rand -hex 8 | npx wrangler secret put ADMIN_PASSWORD

# 6. 部署
npx wrangler deploy
```

部署完成后访问 `https://<worker 名称>.<账号子域>.workers.dev`，后台入口为 `/admin`。

### 绑定自定义域名

Cloudflare 控制台 → Workers & Pages → 选择该 Worker → Settings → Domains & Routes → Add Custom Domain。

### 上线前清理演示卡密

演示卡密以 `DEMO-` 开头，会在后台「卡密」页显示。正式售卖前执行：

```bash
npx wrangler d1 execute apple-giftcard-db --remote --command \
  "DELETE FROM codes WHERE code LIKE 'DEMO-%'"
```

然后在后台「卡密」页按商品导入真实卡密即可。

## 本地开发

```bash
npx wrangler d1 migrations apply apple-giftcard-db --local
npx wrangler d1 execute apple-giftcard-db --local --file=./seed.sql
npx wrangler d1 execute apple-giftcard-db --local --file=./seed_demo_codes.sql
echo 'ADMIN_PASSWORD=dev-admin' > .dev.vars
npx wrangler dev
```

`.dev.vars` 已被 git 忽略，请勿提交任何密钥。

## 订单状态流转

```
pending 待付款 → claimed 已付款待核实 → paid 已确认收款备货 → delivered 已交付卡密
                       └────────── cancelled 已取消 ──────────┘
```

买家可在订单页点「我已付款」进入待核实；商家在后台「确认收款」后点「交付卡密」，系统自动从卡密库存按数量扣减并展示给买家。

## 说明

- 本项目为第三方礼品卡零售工具，与 Apple Inc. 无关联；请遵守相关平台服务条款及当地法律法规。
- 虚拟商品交付依赖人工确认收款，请保持后台订单处理及时；如需自动交付可自行接入支付回调扩展 `src/index.js`。
