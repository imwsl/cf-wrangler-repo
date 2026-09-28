(function () {
  var TOKEN_KEY = 'agc_admin_token';
  var token = '';
  try {
    token = localStorage.getItem(TOKEN_KEY) || '';
  } catch (e) {}
  var products = [];
  var categories = {};
  var orderFilter = '';
  var statusNames = { pending: '待付款', claimed: '待核实', paid: '备货中', delivered: '已交付', cancelled: '已取消' };

  function $(sel) {
    return document.querySelector(sel);
  }

  function el(id) {
    return document.getElementById(id);
  }

  async function adminApi(path, opts) {
    opts = opts || {};
    try {
      return await ACG.api(path, { method: opts.method, body: opts.body, token: token });
    } catch (err) {
      if (err.status === 401) {
        logout();
        ACG.toast('登录已过期，请重新登录');
      }
      throw err;
    }
  }

  function showLogin(hint) {
    el('loginView').hidden = false;
    el('dashView').hidden = true;
    if (hint) el('loginHint').textContent = hint;
  }

  function showDash() {
    el('loginView').hidden = true;
    el('dashView').hidden = false;
    loadProducts();
    loadOrders();
    loadSettings();
  }

  function logout() {
    token = '';
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    showLogin('');
  }

  /* ---------- tabs ---------- */
  function switchTab(name) {
    ['orders', 'products', 'codes', 'settings'].forEach(function (key) {
      el('tab-' + key).hidden = key !== name;
    });
    document.querySelectorAll('.admin-tabs button').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    if (name === 'orders') loadOrders();
    if (name === 'products') renderProducts();
    if (name === 'codes') loadCodes();
    if (name === 'settings') loadSettings();
  }

  /* ---------- orders ---------- */
  async function loadOrders() {
    try {
      var data = await adminApi('/api/admin/orders?status=' + encodeURIComponent(orderFilter));
      renderStats(data.stats || {});
      renderOrders(data.orders || []);
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
    }
  }

  function renderStats(stats) {
    var keys = [
      ['total', '全部订单'],
      ['claimed', '待核实'],
      ['paid', '备货中'],
      ['pending', '待付款'],
      ['delivered', '已交付'],
      ['cancelled', '已取消']
    ];
    el('orderStats').innerHTML = keys.map(function (k) {
      return '<div class="stat"><div class="n">' + (stats[k[0]] || 0) + '</div><div class="k">' + k[1] + '</div></div>';
    }).join('');
  }

  function renderOrderFilters() {
    var items = [['', '全部']].concat(Object.keys(statusNames).map(function (k) {
      return [k, statusNames[k]];
    }));
    el('orderFilters').innerHTML = items.map(function (it) {
      return '<button type="button" class="chip' + (orderFilter === it[0] ? ' active' : '') + '" data-status="' + it[0] + '">' + it[1] + '</button>';
    }).join('');
    el('orderFilters').querySelectorAll('.chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        orderFilter = btn.dataset.status;
        renderOrderFilters();
        loadOrders();
      });
    });
  }

  function orderActions(o) {
    var acts = [];
    if (o.status === 'pending' || o.status === 'claimed') {
      acts.push('<button type="button" class="btn btn-dark" data-action="verify" data-id="' + ACG.esc(o.id) + '">确认收款</button>');
    }
    if (o.status === 'paid') {
      acts.push('<button type="button" class="btn btn-primary" data-action="deliver" data-id="' + ACG.esc(o.id) + '">交付卡密</button>');
    }
    acts.push('<button type="button" class="btn" data-action="detail" data-id="' + ACG.esc(o.id) + '">详情</button>');
    if (o.status !== 'delivered' && o.status !== 'cancelled') {
      acts.push('<button type="button" class="btn" data-action="cancel" data-id="' + ACG.esc(o.id) + '">取消</button>');
    }
    return '<div class="row-actions">' + acts.join('') + '</div>';
  }

  function renderOrders(orders) {
    if (!orders.length) {
      el('ordersTable').innerHTML = '<div class="empty">没有符合条件的订单</div>';
      return;
    }
    el('ordersTable').innerHTML =
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>订单</th><th>商品</th><th>金额</th><th>联系方式</th><th>状态</th><th>下单时间</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      orders.map(function (o) {
        return '<tr>' +
          '<td><code>' + ACG.esc(o.id) + '</code></td>' +
          '<td>' + ACG.esc(o.product_name) + ' × ' + o.quantity + '</td>' +
          '<td>' + ACG.yuan(o.amount) + '</td>' +
          '<td>' + ACG.esc(o.contact) + '</td>' +
          '<td>' + ACG.statusTag(o.status) + '</td>' +
          '<td>' + ACG.fmtTime(o.created_at) + '</td>' +
          '<td>' + orderActions(o) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  async function handleOrderAction(btn) {
    var id = btn.dataset.id;
    var action = btn.dataset.action;
    if (action === 'detail') return showOrderDetail(id);
    if (action === 'verify' && !confirm('确认已收到该订单的付款？')) return;
    if (action === 'cancel' && !confirm('确定取消该订单？')) return;
    if (action === 'deliver' && !confirm('确认交付卡密？将从库存中自动扣减。')) return;
    btn.disabled = true;
    try {
      var res = await adminApi('/api/admin/orders/' + encodeURIComponent(id) + '/action', {
        method: 'POST',
        body: { action: action }
      });
      if (action === 'deliver') {
        ACG.toast('已交付 ' + (res.codes || []).length + ' 张卡密');
      } else {
        ACG.toast('操作成功');
      }
      loadOrders();
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
      btn.disabled = false;
    }
  }

  async function showOrderDetail(id) {
    try {
      var data = await adminApi('/api/admin/orders/' + encodeURIComponent(id));
      var o = data.order;
      var link = location.origin + '/order?id=' + encodeURIComponent(o.id) + '&key=' + encodeURIComponent(o.lookup);
      var codesHtml = (o.codes || []).length
        ? o.codes.map(function (c) {
            return '<div class="code-item"><code>' + ACG.esc(c) + '</code><button type="button" class="btn btn-sm" data-copy="' + ACG.esc(c) + '">复制</button></div>';
          }).join('')
        : '<p class="muted">尚未交付卡密</p>';
      openModal(
        '<h2>订单详情</h2>' +
        '<div class="summary-row"><span class="k">订单号</span><span class="v"><code>' + ACG.esc(o.id) + '</code></span></div>' +
        '<div class="summary-row"><span class="k">状态</span><span class="v">' + ACG.statusTag(o.status) + '</span></div>' +
        '<div class="summary-row"><span class="k">商品</span><span class="v">' + ACG.esc(o.product_name) + ' × ' + o.quantity + '</span></div>' +
        '<div class="summary-row"><span class="k">金额</span><span class="v">' + ACG.yuan(o.amount) + '</span></div>' +
        '<div class="summary-row"><span class="k">联系方式</span><span class="v">' + ACG.esc(o.contact) + '</span></div>' +
        '<div class="summary-row"><span class="k">付款方式</span><span class="v">' + (o.pay_method === 'alipay' ? '支付宝' : '微信') + '</span></div>' +
        '<div class="summary-row"><span class="k">下单时间</span><span class="v">' + ACG.fmtTime(o.created_at) + '</span></div>' +
        '<div class="summary-row"><span class="k">查单链接</span><span class="v" style="max-width:320px;word-break:break-all;font-size:12px">' + ACG.esc(link) + '</span></div>' +
        '<div style="margin:10px 0 6px"><button type="button" class="btn btn-sm" data-copy="' + ACG.esc(link) + '">复制查单链接</button></div>' +
        '<h2 style="margin-top:20px">卡密</h2>' +
        codesHtml +
        '<div style="text-align:right;margin-top:16px"><button type="button" class="btn" data-close="1">关闭</button></div>'
      );
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
    }
  }

  /* ---------- products ---------- */
  async function loadProducts() {
    try {
      var data = await adminApi('/api/admin/products');
      products = data.products || [];
      categories = data.categories || {};
      renderProducts();
      renderCodeSelect();
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
    }
  }

  function renderProducts() {
    if (!el('productsTable')) return;
    if (!products.length) {
      el('productsTable').innerHTML = '<div class="empty">暂无商品，点击右上角新增</div>';
      return;
    }
    el('productsTable').innerHTML =
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>ID</th><th>分类</th><th>名称</th><th>面值</th><th>售价</th><th>原价</th><th>库存(未用/总)</th><th>状态</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      products.map(function (p) {
        return '<tr>' +
          '<td><code>' + ACG.esc(p.id) + '</code></td>' +
          '<td>' + ACG.esc(categories[p.category] || p.category) + '</td>' +
          '<td>' + ACG.esc(p.name) + (p.badge ? ' <span class="tag warn">' + ACG.esc(p.badge) + '</span>' : '') + '</td>' +
          '<td>' + ACG.esc(p.face || '-') + '</td>' +
          '<td>' + ACG.yuan(p.price) + '</td>' +
          '<td>' + (p.listPrice ? ACG.yuan(p.listPrice) : '-') + '</td>' +
          '<td>' + p.stock + ' / ' + p.stockTotal + '</td>' +
          '<td>' + (p.active ? '<span class="tag ok">上架</span>' : '<span class="tag">下架</span>') + '</td>' +
          '<td><div class="row-actions"><button type="button" class="btn" data-edit="' + ACG.esc(p.id) + '">编辑</button></div></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
    el('productsTable').querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var product = products.find(function (p) {
          return p.id === btn.dataset.edit;
        });
        openProductModal(product);
      });
    });
  }

  function openProductModal(product) {
    var p = product || { id: '', category: 'us', name: '', subtitle: '', face: '', price: 0, listPrice: 0, badge: '', sort: 0, active: 1 };
    var isNew = !product;
    var catOptions = Object.keys(categories).map(function (key) {
      return '<option value="' + ACG.esc(key) + '"' + (p.category === key ? ' selected' : '') + '>' + ACG.esc(categories[key]) + '</option>';
    }).join('');

    openModal(
      '<h2>' + (isNew ? '新增商品' : '编辑商品') + '</h2>' +
      '<div class="grid-2">' +
        '<div class="field"><label>商品 ID（英文小写）</label><input class="input" id="pfId" value="' + ACG.esc(p.id) + '"' + (isNew ? '' : ' disabled') + '></div>' +
        '<div class="field"><label>分类</label><select class="select" id="pfCategory">' + catOptions + '</select></div>' +
      '</div>' +
      '<div class="field"><label>商品名称</label><input class="input" id="pfName" value="' + ACG.esc(p.name) + '"></div>' +
      '<div class="field"><label>简介</label><input class="input" id="pfSubtitle" value="' + ACG.esc(p.subtitle) + '"></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>面值展示</label><input class="input" id="pfFace" value="' + ACG.esc(p.face) + '" placeholder="$10"></div>' +
        '<div class="field"><label>角标（可选）</label><input class="input" id="pfBadge" value="' + ACG.esc(p.badge) + '" placeholder="热卖"></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>售价（元）</label><input class="input" id="pfPrice" type="number" min="0" step="0.01" value="' + (p.price / 100).toFixed(2) + '"></div>' +
        '<div class="field"><label>原价（元，可选）</label><input class="input" id="pfListPrice" type="number" min="0" step="0.01" value="' + ((p.listPrice || 0) / 100).toFixed(2) + '"></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>排序（越小越前）</label><input class="input" id="pfSort" type="number" value="' + (p.sort || 0) + '"></div>' +
        '<div class="field"><label>状态</label><select class="select" id="pfActive"><option value="1"' + (p.active ? ' selected' : '') + '>上架</option><option value="0"' + (!p.active ? ' selected' : '') + '>下架</option></select></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px">' +
        '<button type="button" class="btn" data-close="1">取消</button>' +
        '<button type="button" class="btn btn-dark" id="pfSave">保存</button>' +
      '</div>'
    );

    el('pfSave').addEventListener('click', async function () {
      var btn = el('pfSave');
      var payload = {
        id: el('pfId').value.trim().toLowerCase(),
        category: el('pfCategory').value,
        name: el('pfName').value.trim(),
        subtitle: el('pfSubtitle').value.trim(),
        face: el('pfFace').value.trim(),
        badge: el('pfBadge').value.trim(),
        price: Math.round(parseFloat(el('pfPrice').value || '0') * 100),
        listPrice: Math.round(parseFloat(el('pfListPrice').value || '0') * 100),
        sort: parseInt(el('pfSort').value || '0', 10) || 0,
        active: el('pfActive').value === '1'
      };
      if (!payload.id || !payload.name || payload.price <= 0) {
        ACG.toast('请填写商品 ID、名称和有效售价');
        return;
      }
      btn.disabled = true;
      try {
        await adminApi('/api/admin/products', { method: 'POST', body: payload });
        ACG.toast('已保存');
        closeModal();
        loadProducts();
      } catch (err) {
        if (err.status !== 401) ACG.toast(err.message);
        btn.disabled = false;
      }
    });
  }

  /* ---------- codes ---------- */
  function renderCodeSelect() {
    var select = el('codeProduct');
    if (!select) return;
    var last = select.value;
    select.innerHTML = products.map(function (p) {
      return '<option value="' + ACG.esc(p.id) + '">' + ACG.esc(p.name) + '（库存 ' + p.stock + '）</option>';
    }).join('');
    if (last && products.some(function (p) { return p.id === last; })) select.value = last;
  }

  async function loadCodes() {
    var productId = el('codeProduct').value;
    if (!productId) {
      el('codesTable').innerHTML = '<div class="empty">先添加商品</div>';
      return;
    }
    try {
      var data = await adminApi('/api/admin/codes?productId=' + encodeURIComponent(productId));
      var codes = data.codes || [];
      var unused = codes.filter(function (c) { return !c.used; }).length;
      el('codeStockInfo').textContent = '未使用 ' + unused + ' / 共 ' + codes.length + ' 条（最近 1000 条）';
      if (!codes.length) {
        el('codesTable').innerHTML = '<div class="empty">该商品还没有卡密，先在上方导入</div>';
        return;
      }
      el('codesTable').innerHTML =
        '<div class="table-wrap"><table class="tbl"><thead><tr>' +
        '<th>ID</th><th>卡密</th><th>状态</th><th>关联订单</th><th>导入时间</th><th>操作</th>' +
        '</tr></thead><tbody>' +
        codes.map(function (c) {
          return '<tr>' +
            '<td>' + c.id + '</td>' +
            '<td><code>' + ACG.esc(c.code) + '</code></td>' +
            '<td>' + (c.used ? '<span class="tag info">已使用</span>' : '<span class="tag ok">未使用</span>') + '</td>' +
            '<td>' + (c.order_id ? '<code>' + ACG.esc(c.order_id) + '</code>' : '-') + '</td>' +
            '<td>' + ACG.fmtTime(c.created_at) + '</td>' +
            '<td>' + (c.used ? '' : '<button type="button" class="btn" data-del="' + c.id + '">删除</button>') + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table></div>';
      el('codesTable').querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (!confirm('删除这条未使用的卡密？')) return;
          try {
            await adminApi('/api/admin/codes/' + btn.dataset.del, { method: 'DELETE' });
            ACG.toast('已删除');
            loadCodes();
            loadProducts();
          } catch (err) {
            if (err.status !== 401) ACG.toast(err.message);
          }
        });
      });
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
    }
  }

  async function importCodes() {
    var productId = el('codeProduct').value;
    var raw = el('codeInput').value;
    if (!productId) return ACG.toast('请先选择商品');
    if (!raw.trim()) return ACG.toast('请粘贴卡密');
    var btn = el('importCodesBtn');
    btn.disabled = true;
    try {
      var res = await adminApi('/api/admin/codes', {
        method: 'POST',
        body: { productId: productId, codes: raw }
      });
      ACG.toast('提交 ' + res.submitted + ' 条，当前库存 ' + res.stock + ' 张');
      el('codeInput').value = '';
      loadCodes();
      loadProducts();
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- settings ---------- */
  async function loadSettings() {
    try {
      var data = await adminApi('/api/admin/settings');
      var s = data.settings || {};
      el('setNotice').value = s.notice || '';
      el('setWechat').value = s.contact_wechat || '';
      el('setServiceTime').value = s.service_time || '';
      el('setWechatQr').value = s.wechat_qr || '';
      el('setAlipayQr').value = s.alipay_qr || '';
      updateQrPreview('previewWechat', s.wechat_qr);
      updateQrPreview('previewAlipay', s.alipay_qr);
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
    }
  }

  function updateQrPreview(previewId, src) {
    var box = el(previewId);
    if (!box) return;
    box.innerHTML = src ? '<img src="' + ACG.esc(src) + '" alt="预览">' : '未上传';
  }

  function shrinkImage(file, maxSize) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function saveSettings() {
    var btn = el('saveSettingsBtn');
    btn.disabled = true;
    try {
      await adminApi('/api/admin/settings', {
        method: 'POST',
        body: {
          notice: el('setNotice').value.trim(),
          contact_wechat: el('setWechat').value.trim(),
          service_time: el('setServiceTime').value.trim(),
          wechat_qr: el('setWechatQr').value.trim(),
          alipay_qr: el('setAlipayQr').value.trim()
        }
      });
      ACG.toast('设置已保存');
    } catch (err) {
      if (err.status !== 401) ACG.toast(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- modal ---------- */
  function openModal(html) {
    el('modalRoot').innerHTML = '<div class="modal-mask"><div class="modal" id="modalBox">' + html + '</div></div>';
    var mask = el('modalRoot').querySelector('.modal-mask');
    mask.addEventListener('click', function (e) {
      if (e.target === mask) closeModal();
    });
    el('modalRoot').querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });
    el('modalRoot').querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ACG.copy(btn.dataset.copy);
      });
    });
  }

  function closeModal() {
    el('modalRoot').innerHTML = '';
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    el('loginBtn').addEventListener('click', async function () {
      var pwd = el('adminPwd').value;
      if (!pwd) return ACG.toast('请输入密码');
      el('loginBtn').disabled = true;
      try {
        var res = await ACG.api('/api/admin/login', { method: 'POST', body: { password: pwd } });
        token = res.token;
        try {
          localStorage.setItem(TOKEN_KEY, token);
        } catch (e) {}
        el('adminPwd').value = '';
        showDash();
      } catch (err) {
        el('loginHint').textContent = err.message;
      } finally {
        el('loginBtn').disabled = false;
      }
    });

    el('adminPwd').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') el('loginBtn').click();
    });

    el('logoutBtn').addEventListener('click', logout);
    el('refreshBtn').addEventListener('click', function () {
      loadProducts();
      loadOrders();
      loadSettings();
      ACG.toast('已刷新');
    });

    document.querySelectorAll('.admin-tabs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.dataset.tab);
      });
    });

    el('orderFilters') && renderOrderFilters();

    el('ordersTable').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (btn) handleOrderAction(btn);
    });

    el('newProductBtn').addEventListener('click', function () {
      openProductModal(null);
    });

    el('codeProduct').addEventListener('change', loadCodes);
    el('importCodesBtn').addEventListener('click', importCodes);

    el('saveSettingsBtn').addEventListener('click', saveSettings);

    ['Wechat', 'Alipay'].forEach(function (key) {
      var input = el('set' + key + 'Qr');
      input.addEventListener('input', function () {
        updateQrPreview('preview' + key, input.value.trim());
      });
      el('upload' + key).addEventListener('change', async function () {
        var file = this.files && this.files[0];
        if (!file) return;
        try {
          var dataUrl = await shrinkImage(file, 800);
          input.value = dataUrl;
          updateQrPreview('preview' + key, dataUrl);
        } catch (e) {
          ACG.toast('图片处理失败，请换一张试试');
        }
      });
      el('clear' + key + 'Qr').addEventListener('click', function () {
        input.value = '';
        updateQrPreview('preview' + key, '');
      });
    });

    if (token) {
      showDash();
    } else {
      showLogin('');
    }
  });
})();
