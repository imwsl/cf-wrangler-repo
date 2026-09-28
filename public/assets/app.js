(function () {
  var STATUS = {
    pending: { text: '待付款', cls: 'warn' },
    claimed: { text: '待核实', cls: 'info' },
    paid: { text: '备货中', cls: 'info' },
    delivered: { text: '已交付', cls: 'ok' },
    cancelled: { text: '已取消', cls: '' }
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function yuan(cents) {
    var v = Number(cents || 0) / 100;
    return '¥' + (Number.isInteger(v) ? v : v.toFixed(2));
  }

  function fmtTime(ts) {
    if (!ts) return '-';
    var d = new Date(Number(ts));
    function p(n) {
      return String(n).padStart(2, '0');
    }
    return (
      d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    );
  }

  function statusTag(status) {
    var s = STATUS[status] || { text: status, cls: '' };
    return '<span class="tag ' + s.cls + '">' + esc(s.text) + '</span>';
  }

  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (opts.token) init.headers['x-admin-token'] = opts.token;
    var res = await fetch(path, init);
    var data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      var err = new Error((data && data.error) || '请求失败（' + res.status + '）');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.classList.remove('show');
    }, 2400);
  }

  function copy(text) {
    function done() {
      toast('已复制');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallback();
      });
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch (e) {
        toast('复制失败，请手动选择复制');
      }
      document.body.removeChild(ta);
    }
  }

  var SAVED_KEY = 'agc_orders';

  function savedOrders() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveOrder(order) {
    var list = savedOrders().filter(function (o) {
      return o.id !== order.id;
    });
    list.unshift(order);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (e) {}
  }

  function getSavedOrder(id) {
    return (
      savedOrders().find(function (o) {
        return o.id === id;
      }) || null
    );
  }

  function initTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem('agc_theme');
    } catch (e) {}
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.dataset.theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.dataset.theme = 'dark';
    }
  }

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('agc_theme', next);
    } catch (e) {}
    var btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  }

  function navHTML(active) {
    function link(href, label, key, cls) {
      return (
        '<a href="' + href + '" class="' + (cls || '') + (active === key ? ' active' : '') + '">' + label + '</a>'
      );
    }
    return (
      '<div class="container nav-inner">' +
      '<a class="brand" href="/">' +
      '<span class="brand-mark"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="2.5" y="5" width="19" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 9.5h19" stroke="currentColor" stroke-width="1.8"/><path d="M7 14.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>' +
      'AGC<span>礼品卡</span>' +
      '</a>' +
      '<nav class="nav-links">' +
      link('/#shop', '全部商品', 'shop') +
      link('/guide', '使用须知', 'guide', 'hide-sm') +
      link('/orders', '我的订单', 'orders') +
      '</nav>' +
      '<div class="nav-actions">' +
      '<button type="button" class="icon-btn" id="themeBtn" aria-label="切换主题">🌙</button>' +
      '<a class="btn btn-dark btn-sm" href="/#shop">立即购买</a>' +
      '</div>' +
      '</div>'
    );
  }

  function footHTML() {
    return (
      '<div class="container">' +
      '<div class="foot-g">' +
      '<div>' +
      '<div class="foot-brand">AGC 礼品卡</div>' +
      '<p class="foot-desc">Apple App Store 礼品卡零售：美区 / 日区 / 港区多面值现货，扫码付款，卡密在「我的订单」自助查收。</p>' +
      '</div>' +
      '<div class="foot-col"><h4>商品</h4>' +
      '<a href="/?cat=us#shop">美区礼品卡</a><a href="/?cat=jp#shop">日区礼品卡</a><a href="/?cat=hk#shop">港区礼品卡</a>' +
      '</div>' +
      '<div class="foot-col"><h4>帮助</h4>' +
      '<a href="/guide">使用须知</a><a href="/orders">订单查询</a><a href="/guide#redeem">兑换教程</a>' +
      '</div>' +
      '<div class="foot-col"><h4>商家</h4>' +
      '<a href="/admin">后台管理</a>' +
      '<a href="#" id="footContact">联系客服</a>' +
      '</div>' +
      '</div>' +
      '<div class="foot-b">' +
      '<div>© ' + new Date().getFullYear() + ' AGC 礼品卡 · 本站为第三方礼品卡零售网站，与 Apple Inc. 无关联；请遵守平台服务条款及当地法律法规。</div>' +
      '</div>' +
      '</div>'
    );
  }

  async function openKefu() {
    try {
      var cfg = await api('/api/config');
      var wx = cfg.settings.contact_wechat || '';
      var time = cfg.settings.service_time || '';
      alert('客服微信号：' + (wx || '暂未设置') + (time ? '\n服务时间：' + time : ''));
    } catch (e) {
      toast('客服信息加载失败，请稍后再试');
    }
  }

  async function initChrome() {
    initTheme();
    var nav = document.getElementById('siteNav');
    if (nav) nav.innerHTML = navHTML(nav.dataset.active || '');
    var foot = document.getElementById('siteFoot');
    if (foot) foot.innerHTML = footHTML();
    var btn = document.getElementById('themeBtn');
    if (btn) {
      btn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
      btn.addEventListener('click', toggleTheme);
    }
    var contact = document.getElementById('footContact');
    if (contact) {
      contact.addEventListener('click', function (e) {
        e.preventDefault();
        openKefu();
      });
    }
    var notice = document.getElementById('noticeBand');
    if (notice) {
      try {
        var cfg = await api('/api/config');
        if (cfg.settings.notice) {
          notice.textContent = '📢 ' + cfg.settings.notice;
          notice.hidden = false;
        }
      } catch (e) {}
    }
  }

  window.ACG = {
    STATUS: STATUS,
    esc: esc,
    yuan: yuan,
    fmtTime: fmtTime,
    statusTag: statusTag,
    api: api,
    toast: toast,
    copy: copy,
    savedOrders: savedOrders,
    saveOrder: saveOrder,
    getSavedOrder: getSavedOrder,
    openKefu: openKefu
  };

  initTheme();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChrome);
  } else {
    initChrome();
  }
})();
