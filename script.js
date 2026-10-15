/* ═══════════════════════════════════════════════════════════════
   CATSHUB Harness — script.js
   Vanilla JS + CodeMirror + Sucrase
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // GLOBAL ERROR HANDLERS
  // ═══════════════════════════════════════════════════════════════

  window.addEventListener('error', (e) => {
    console.error('[GLOBAL ERROR]', e.error || e.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('[UNHANDLED REJECTION]', e.reason);
  });

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════

  const state = {
    token: localStorage.getItem('cats_token') || null,
    user: null,
    cmReady: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ═══════════════════════════════════════════════════════════════
  // API CLIENT
  // ═══════════════════════════════════════════════════════════════

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      logout();
      throw new Error('Session expired');
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data.detail) msg = typeof data.detail === 'string'
          ? data.detail
          : JSON.stringify(data.detail);
      } catch {}
      throw new Error(msg);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  // ═══════════════════════════════════════════════════════════════
  // TOAST
  // ═══════════════════════════════════════════════════════════════

  function toast(message, type = 'info', icon = null) {
    const stack = $('#toast-stack');
    if (!stack) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;

    const iconName = icon || {
      ok: 'circle-check',
      err: 'circle-x',
      warn: 'triangle-alert',
      info: 'info',
    }[type] || 'info';

    el.innerHTML = `
      <iconify-icon icon="lucide:${iconName}"></iconify-icon>
      <span>${escapeHtml(message)}</span>
    `;

    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ═══════════════════════════════════════════════════════════════
  // MODAL
  // ═══════════════════════════════════════════════════════════════

  function openModal(html) {
    const overlay = $('#modal-overlay');
    const modal = $('#modal');
    if (!overlay || !modal) return;

    modal.innerHTML = html;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    $$('[data-modal-close]', modal).forEach((el) => {
      el.addEventListener('click', closeModal);
    });
  }

  function closeModal() {
    const overlay = $('#modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    $('#modal').innerHTML = '';
    document.body.style.overflow = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeModal();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(text) {
    return String(text ?? '').replace(/[^a-z0-9_\-:/.]/gi, '');
  }

  function formatNumber(n) {
    if (n == null) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function initials(name) {
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════════

  function setToken(token) {
    state.token = token;
    localStorage.setItem('cats_token', token);
  }

  function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('cats_token');
    navigate('#/');
  }

  async function loadMe() {
    if (!state.token) {
      state.user = null;
      return;
    }
    try {
      state.user = await api('/api/me');
    } catch {
      state.user = null;
      state.token = null;
      localStorage.removeItem('cats_token');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════

  function renderHeader() {
    const nav = $('#header-nav');
    if (!nav) return;

    const path = location.hash.slice(1) || '/';
    const isActive = (p) => path === p ? 'active' : '';

    let html = `
      <a class="nav-link ${isActive('/')}" href="#/" data-nav>
        <iconify-icon icon="lucide:layout-grid"></iconify-icon>
        <span class="label">Registry</span>
      </a>
      <a class="nav-link ${isActive('/docs')}" href="#/docs" data-nav>
        <iconify-icon icon="lucide:book-open"></iconify-icon>
        <span class="label">Docs</span>
      </a>
    `;

    if (state.user) {
      html += `
        <a class="nav-link ${isActive('/new')}" href="#/new" data-nav>
          <iconify-icon icon="lucide:plus"></iconify-icon>
          <span class="label">Publish</span>
        </a>
        <a class="nav-link ${isActive('/dashboard')}" href="#/dashboard" data-nav>
          <iconify-icon icon="lucide:layout-dashboard"></iconify-icon>
          <span class="label">Dashboard</span>
        </a>
      `;

      if (state.user.role === 'admin') {
        html += `
          <a class="nav-link ${isActive('/admin')}" href="#/admin" data-nav>
            <iconify-icon icon="lucide:shield-check"></iconify-icon>
            <span class="label">Admin</span>
          </a>
        `;
      }

      const avatar = state.user.avatar_url
        ? `<img src="${escapeAttr(state.user.avatar_url)}" alt="">`
        : initials(state.user.display_name || state.user.username);

      html += `
        <a class="nav-user" href="#/u/${escapeAttr(state.user.username)}" data-nav>
          <div class="nav-user-avatar">${avatar}</div>
          <span class="username">@${escapeHtml(state.user.username)}</span>
          <span class="nav-user-role">${escapeHtml(state.user.role)}</span>
        </a>
        <button class="nav-link" id="logout-btn" title="Logout">
          <iconify-icon icon="lucide:log-out"></iconify-icon>
        </button>
      `;
    } else {
      html += `
        <a class="nav-link" href="#/login" data-nav>
          <iconify-icon icon="lucide:log-in"></iconify-icon>
          <span class="label">Sign in</span>
        </a>
        <a class="btn btn-primary btn-sm" href="#/register" data-nav>
          <iconify-icon icon="lucide:user-plus"></iconify-icon>
          Register
        </a>
      `;
    }

    nav.innerHTML = html;
    $('#logout-btn')?.addEventListener('click', logout);
  }

  // ═══════════════════════════════════════════════════════════════
  // ROUTER
  // ═══════════════════════════════════════════════════════════════

  function navigate(hash) {
    if (location.hash === hash) {
      window.dispatchEvent(new Event('hashchange'));
    } else {
      location.hash = hash;
    }
  }

  async function router() {
    const path = location.hash.slice(1) || '/';
    const app = $('#app');
    if (!app) return;

    renderHeader();
    app.innerHTML = '';

    try {
      if (path === '/' || path === '') {
        await pageHome(app);
      } else if (path === '/docs') {
        pageDocs(app);
      } else if (path === '/login') {
        pageLogin(app);
      } else if (path === '/register') {
        pageRegister(app);
      } else if (path === '/dashboard') {
        await pageDashboard(app);
      } else if (path === '/new') {
        await pageNewPlugin(app);
      } else if (path.startsWith('/edit/')) {
        await pageEditPlugin(app, decodeURIComponent(path.slice(6)));
      } else if (path === '/edit-profile') {
        await pageEditProfile(app);
      } else if (path === '/admin') {
        await pageAdmin(app);
      } else if (path.startsWith('/p/')) {
        await pagePluginDetail(app, decodeURIComponent(path.slice(3)));
      } else if (path.startsWith('/u/')) {
        await pageProfile(app, decodeURIComponent(path.slice(3)));
      } else {
        pageNotFound(app);
      }
    } catch (e) {
      console.error('[ROUTER]', e);
      app.innerHTML = `
        <div class="empty">
          <iconify-icon icon="lucide:triangle-alert"></iconify-icon>
          <div class="empty-title">Error</div>
          <div class="empty-sub">${escapeHtml(e.message)}</div>
          <a class="btn" href="#/" data-nav style="margin-top:16px;">Back home</a>
        </div>
      `;
    }

    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', router);

  // ═══════════════════════════════════════════════════════════════
  // PAGE: HOME
  // ═══════════════════════════════════════════════════════════════

  async function pageHome(app) {
    app.innerHTML = `
      <section class="masthead">
        <div class="masthead-meta">
          <span class="dot"></span>
          <span>Registry · v2.0 · 2026</span>
        </div>
        <h1 class="masthead-title">
          Plugins for <em>Visual Merge</em>.
        </h1>
        <p class="masthead-lead">
          Terminal extensions. Install with one command:
          <code>cats install &lt;name&gt;</code>
        </p>
        <div class="masthead-actions">
          ${state.user ? `
            <a class="btn btn-primary" href="#/new" data-nav>
              <iconify-icon icon="lucide:plus"></iconify-icon>
              Publish plugin
            </a>
          ` : `
            <a class="btn btn-primary" href="#/register" data-nav>
              <iconify-icon icon="lucide:rocket"></iconify-icon>
              Get started
            </a>
          `}
          <a class="btn" href="#registry" data-nav-scroll="registry">
            <iconify-icon icon="lucide:arrow-down"></iconify-icon>
            Browse registry
          </a>
        </div>
      </section>

      <section class="counters">
        <div class="counter">
          <div class="counter-num accent" id="c-plugins">0</div>
          <div class="counter-label">Plugins</div>
        </div>
        <div class="counter">
          <div class="counter-num" id="c-downloads">0</div>
          <div class="counter-label">Installs</div>
        </div>
        <div class="counter">
          <div class="counter-num" id="c-users">0</div>
          <div class="counter-label">Authors</div>
        </div>
        <div class="counter">
          <div class="counter-num" id="c-rating">0.0</div>
          <div class="counter-label">Avg rating</div>
        </div>
      </section>

      <section id="registry">
        <div class="toolbar">
          <label class="search">
            <iconify-icon icon="lucide:search"></iconify-icon>
            <input type="text" id="search-input" placeholder="search packages..." autocomplete="off">
          </label>
          <select class="filter-select" id="filter-category">
            <option value="all">all categories</option>
            <option value="official">official</option>
            <option value="admin">admin</option>
            <option value="utils">utils</option>
            <option value="ui">ui</option>
            <option value="fun">fun</option>
          </select>
          <select class="filter-select" id="filter-sort">
            <option value="downloads">top downloads</option>
            <option value="new">newest</option>
            <option value="rating">top rated</option>
            <option value="name">a-z</option>
          </select>
          <div class="toolbar-count" id="registry-count"></div>
        </div>

        <div class="registry-header">
          <div>ID</div>
          <div>Package</div>
          <div>Description</div>
          <div>Version</div>
          <div style="text-align:right;">Downloads</div>
          <div></div>
        </div>
        <div id="registry-list">
          <div class="empty">
            <iconify-icon icon="lucide:loader"></iconify-icon>
            <div class="empty-title">Loading</div>
          </div>
        </div>
      </section>
    `;

    let plugins = [];
    let stats = {};

    try {
      plugins = await api('/api/plugins?limit=100');
      if (!Array.isArray(plugins)) plugins = [];
    } catch (e) {
      console.warn('[pageHome] plugins:', e.message);
    }

    try {
      stats = await api('/api/stats');
    } catch (e) {
      console.warn('[pageHome] stats:', e.message);
    }

    const cPlugins = $('#c-plugins');
    const cDownloads = $('#c-downloads');
    const cUsers = $('#c-users');
    const cRating = $('#c-rating');

    if (cPlugins) cPlugins.textContent = formatNumber(stats.plugins ?? plugins.length ?? 0);
    if (cDownloads) cDownloads.textContent = formatNumber(stats.downloads ?? 0);
    if (cUsers) cUsers.textContent = formatNumber(stats.users ?? 0);
    if (cRating) cRating.textContent = String(stats.avg_rating ?? 0);

    const list = $('#registry-list');
    if (!list) return;

    const renderList = () => {
      const q = ($('#search-input')?.value || '').toLowerCase().trim();
      const cat = $('#filter-category')?.value || 'all';
      const sort = $('#filter-sort')?.value || 'downloads';

      let items = plugins.filter((p) => {
        if (cat !== 'all' && p.category !== cat) return false;
        if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
        return true;
      });

      items.sort((a, b) => {
        if (sort === 'new') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
        if (sort === 'name') return a.name.localeCompare(b.name);
        return (b.downloads || 0) - (a.downloads || 0);
      });

      const count = $('#registry-count');
      if (count) count.textContent = `${items.length} packages`;

      if (items.length === 0) {
        list.innerHTML = `
          <div class="empty">
            <iconify-icon icon="lucide:package-open"></iconify-icon>
            <div class="empty-title">No plugins yet</div>
            <div class="empty-sub">Be the first to publish</div>
            ${!state.user ? `
              <a class="btn btn-primary" href="#/register" data-nav style="margin-top:16px;">
                <iconify-icon icon="lucide:plus"></iconify-icon>
                Publish plugin
              </a>
            ` : `
              <a class="btn btn-primary" href="#/new" data-nav style="margin-top:16px;">
                <iconify-icon icon="lucide:plus"></iconify-icon>
                Publish plugin
              </a>
            `}
          </div>
        `;
        return;
      }

      list.innerHTML = items.map((p) => `
        <div class="row" data-plugin="${escapeAttr(p.name)}">
          <div class="col-id">#${p.id}</div>
          <div class="col-name">
            ${p.verified ? '<iconify-icon class="verified" icon="lucide:badge-check"></iconify-icon>' : ''}
            <span class="name-text">${escapeHtml(p.name)}</span>
          </div>
          <div class="col-desc">${escapeHtml(p.description)}</div>
          <div class="col-version">v${escapeHtml(p.version)}</div>
          <div class="col-downloads">
            <iconify-icon icon="lucide:download"></iconify-icon>
            ${formatNumber(p.downloads || 0)}
          </div>
          <div class="col-action">
            <button class="btn btn-sm" data-install="${escapeAttr(p.name)}">
              <iconify-icon icon="lucide:download"></iconify-icon>
              install
            </button>
          </div>
        </div>
      `).join('');

      $$('.row', list).forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-install]')) return;
          navigate(`#/p/${encodeURIComponent(row.dataset.plugin)}`);
        });
      });

      $$('[data-install]', list).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = btn.dataset.install;
          navigator.clipboard.writeText(`cats install ${name}`).catch(() => {});
          toast(`Copied: cats install ${name}`, 'ok', 'clipboard-check');
        });
      });
    };

    $('#search-input')?.addEventListener('input', renderList);
    $('#filter-category')?.addEventListener('change', renderList);
    $('#filter-sort')?.addEventListener('change', renderList);
    renderList();

    $$('[data-nav-scroll]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById(el.dataset.navScroll)?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: DOCS
  // ═══════════════════════════════════════════════════════════════

  function pageDocs(app) {
    app.innerHTML = `
      <div class="form-page" style="max-width:820px;">
        <div class="form-label" style="margin-bottom:14px;">START · 01</div>
        <h1 class="form-title">Introduction</h1>
        <p class="form-sub">
          CATSHUB — plugin registry for the Visual Merge terminal.
          Extensions install with a single command: <code>cats install &lt;name&gt;</code>.
        </p>

        <div class="section-title" style="margin:32px 0 14px;font-size:18px;">
          <iconify-icon icon="lucide:terminal"></iconify-icon>
          Install
        </div>
        <p style="color:var(--text-dim);line-height:1.7;margin-bottom:14px;">
          Open Visual Merge → Terminal:
        </p>
        <pre class="code-preview"><span style="color:var(--text-mute);"># install a plugin</span>
cats install indycarts-utils

<span style="color:var(--text-mute);"># list installed</span>
cats list

<span style="color:var(--text-mute);"># remove a plugin</span>
cats uninstall indycarts-utils</pre>

        <div class="section-title" style="margin:32px 0 14px;font-size:18px;">
          <iconify-icon icon="lucide:database"></iconify-icon>
          Storage
        </div>
        <p style="color:var(--text-dim);line-height:1.7;">
          Plugins are cached in <code>localStorage</code> under key <code>cats_plugins</code>.
          Sync across devices is done through CloudStorage.
        </p>

        <div class="section-title" style="margin:32px 0 14px;font-size:18px;">
          <iconify-icon icon="lucide:upload"></iconify-icon>
          Publish
        </div>
        <p style="color:var(--text-dim);line-height:1.7;">
          Register, go to <b>Publish</b>, write your <code>main.ts</code> in the editor.
          The code compiles to JS in the browser and gets sent to the registry.
          After admin review your plugin receives the <code>verified</code> badge.
        </p>

        <div class="section-title" style="margin:32px 0 14px;font-size:18px;">
          <iconify-icon icon="lucide:file-code"></iconify-icon>
          Format
        </div>
        <p style="color:var(--text-dim);line-height:1.7;margin-bottom:14px;">
          Every plugin consists of a manifest and code:
        </p>
        <pre class="code-preview">plugin.json    manifest (name, version, commands)
main.ts        source code (TypeScript)
main.js        compiled output (generated)</pre>

        <div class="form-actions" style="margin-top:32px;">
          <a class="btn btn-primary" href="#/register" data-nav>
            <iconify-icon icon="lucide:user-plus"></iconify-icon>
            Create account
          </a>
          <a class="btn" href="#/" data-nav>
            <iconify-icon icon="lucide:arrow-left"></iconify-icon>
            Back to registry
          </a>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: LOGIN
  // ═══════════════════════════════════════════════════════════════

  function pageLogin(app) {
    if (state.user) return navigate('#/dashboard');

    app.innerHTML = `
      <div class="form-page" style="max-width:440px;">
        <h1 class="form-title">Sign in</h1>
        <p class="form-sub">Use your CATSHUB account</p>
        <div id="login-error"></div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Username <span class="req">*</span></label>
            <input class="form-input" name="username" autocomplete="username" required autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Password <span class="req">*</span></label>
            <input class="form-input" name="password" type="password" autocomplete="current-password" required>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" style="flex:1;">
              <iconify-icon icon="lucide:log-in"></iconify-icon>
              Sign in
            </button>
          </div>
          <p class="form-hint" style="margin-top:20px;">
            No account? <a href="#/register" data-nav style="color:var(--accent);">Register</a>
          </p>
        </form>
      </div>
    `;

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#login-error');
      err.innerHTML = '';
      const fd = new FormData(e.target);
      try {
        const res = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: fd.get('username'),
            password: fd.get('password'),
          }),
        });
        setToken(res.token);
        await loadMe();
        toast(`Welcome, @${res.username}`, 'ok');
        navigate('#/dashboard');
      } catch (e) {
        err.innerHTML = `<div class="form-error">${escapeHtml(e.message)}</div>`;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: REGISTER
  // ═══════════════════════════════════════════════════════════════

  function pageRegister(app) {
    if (state.user) return navigate('#/dashboard');

    app.innerHTML = `
      <div class="form-page" style="max-width:440px;">
        <h1 class="form-title">Register</h1>
        <p class="form-sub">Create your CATSHUB account</p>
        <div id="reg-error"></div>

        <form id="reg-form">
          <div class="form-group">
            <label class="form-label">Username <span class="req">*</span></label>
            <input class="form-input" name="username" autocomplete="username" required autofocus>
            <div class="form-hint">lowercase · digits · _ - · 3–32 chars</div>
          </div>
          <div class="form-group">
            <label class="form-label">Password <span class="req">*</span></label>
            <input class="form-input" name="password" type="password" autocomplete="new-password" required>
            <div class="form-hint">minimum 6 characters</div>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" style="flex:1;">
              <iconify-icon icon="lucide:user-plus"></iconify-icon>
              Create account
            </button>
          </div>
          <p class="form-hint" style="margin-top:20px;">
            Have an account? <a href="#/login" data-nav style="color:var(--accent);">Sign in</a>
          </p>
        </form>
      </div>
    `;

    $('#reg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#reg-error');
      err.innerHTML = '';
      const fd = new FormData(e.target);
      try {
        const res = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: fd.get('username'),
            password: fd.get('password'),
          }),
        });
        setToken(res.token);
        await loadMe();
        toast(`Account created: @${res.username}`, 'ok');
        navigate('#/dashboard');
      } catch (e) {
        err.innerHTML = `<div class="form-error">${escapeHtml(e.message)}</div>`;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  async function pageDashboard(app) {
    if (!state.user) return navigate('#/login');

    let plugins = [];
    let portfolio = [];

    try {
      plugins = await api(`/api/users/${state.user.username}/plugins`);
      if (!Array.isArray(plugins)) plugins = [];
    } catch (e) { console.warn('[dashboard] plugins:', e.message); }

    try {
      portfolio = await api(`/api/users/${state.user.username}/portfolio`);
      if (!Array.isArray(portfolio)) portfolio = [];
    } catch (e) { console.warn('[dashboard] portfolio:', e.message); }

    app.innerHTML = `
      <div style="padding:48px 0 24px;border-bottom:1px solid var(--line);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
          <div>
            <h1 class="form-title" style="margin-bottom:6px;">@${escapeHtml(state.user.username)}</h1>
            <div style="font-family:var(--font-mono);font-size:13px;color:var(--text-mute);">
              ${escapeHtml(state.user.role)} · ${plugins.length} plugins · ${portfolio.length} projects
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a class="btn" href="#/edit-profile" data-nav>
              <iconify-icon icon="lucide:user-cog"></iconify-icon>
              Edit profile
            </a>
            <a class="btn btn-primary" href="#/new" data-nav>
              <iconify-icon icon="lucide:plus"></iconify-icon>
              Publish plugin
            </a>
          </div>
        </div>
      </div>

      <div class="tabs" style="margin-top:24px;">
        <button class="tab active" data-tab="plugins">
          <iconify-icon icon="lucide:package"></iconify-icon>
          Plugins (${plugins.length})
        </button>
        <button class="tab" data-tab="portfolio">
          <iconify-icon icon="lucide:folder-open"></iconify-icon>
          Portfolio (${portfolio.length})
        </button>
      </div>

      <div id="tab-content"></div>
    `;

    const content = $('#tab-content');

    const renderPlugins = () => {
      if (plugins.length === 0) {
        content.innerHTML = `
          <div class="empty">
            <iconify-icon icon="lucide:package-plus"></iconify-icon>
            <div class="empty-title">No plugins yet</div>
            <div class="empty-sub">Publish your first plugin</div>
            <a class="btn btn-primary" href="#/new" data-nav style="margin-top:16px;">
              <iconify-icon icon="lucide:plus"></iconify-icon>
              Publish plugin
            </a>
          </div>
        `;
        return;
      }

      content.innerHTML = plugins.map((p) => `
        <div class="row" data-plugin="${escapeAttr(p.name)}">
          <div class="col-id">#${p.id}</div>
          <div class="col-name">
            ${p.verified ? '<iconify-icon class="verified" icon="lucide:badge-check"></iconify-icon>' : ''}
            <span class="name-text">${escapeHtml(p.name)}</span>
          </div>
          <div class="col-desc">${escapeHtml(p.description)}</div>
          <div class="col-version">v${escapeHtml(p.version)}</div>
          <div class="col-downloads">
            <iconify-icon icon="lucide:download"></iconify-icon>
            ${formatNumber(p.downloads || 0)}
          </div>
          <div class="col-action" style="display:flex;gap:6px;justify-content:flex-end;">
            <a class="btn btn-sm" href="#/edit/${escapeAttr(p.name)}" data-nav title="Edit">
              <iconify-icon icon="lucide:pencil"></iconify-icon>
            </a>
            <button class="btn btn-sm btn-danger" data-delete="${escapeAttr(p.name)}" title="Delete">
              <iconify-icon icon="lucide:trash-2"></iconify-icon>
            </button>
          </div>
        </div>
      `).join('');

      $$('[data-delete]', content).forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const name = btn.dataset.delete;
          if (!confirm(`Delete plugin "${name}"?`)) return;
          try {
            await api(`/api/plugins/${name}`, { method: 'DELETE' });
            toast(`Deleted: ${name}`, 'ok');
            router();
          } catch (e) {
            toast(e.message, 'err');
          }
        });
      });

      $$('.row', content).forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('a, button')) return;
          navigate(`#/p/${encodeURIComponent(row.dataset.plugin)}`);
        });
      });
    };

    const renderPortfolio = () => {
      content.innerHTML = `
        <div class="section-header">
          <div class="section-title">
            <iconify-icon icon="lucide:folder-open"></iconify-icon>
            Portfolio projects
          </div>
          <button class="btn btn-sm btn-primary" id="add-portfolio">
            <iconify-icon icon="lucide:plus"></iconify-icon>
            Add project
          </button>
        </div>
        <div id="portfolio-list"></div>
      `;

      const list = $('#portfolio-list');

      if (portfolio.length === 0) {
        list.innerHTML = `
          <div class="empty">
            <iconify-icon icon="lucide:folder-plus"></iconify-icon>
            <div class="empty-title">No projects</div>
            <div class="empty-sub">Show off your work — add a project</div>
          </div>
        `;
      } else {
        list.innerHTML = `
          <div class="portfolio-grid">
            ${portfolio.map((p) => `
              <div class="portfolio-card ${p.is_featured ? 'featured' : ''}">
                <div class="portfolio-actions">
                  <button class="portfolio-action-btn" data-edit="${p.id}" title="Edit">
                    <iconify-icon icon="lucide:pencil"></iconify-icon>
                  </button>
                  <button class="portfolio-action-btn danger" data-delete-portfolio="${p.id}" title="Delete">
                    <iconify-icon icon="lucide:trash-2"></iconify-icon>
                  </button>
                </div>
                ${p.image_url ? `
                  <div class="portfolio-image">
                    <img src="${escapeAttr(p.image_url)}" alt="" loading="lazy">
                  </div>
                ` : ''}
                <div class="portfolio-title">${escapeHtml(p.title)}</div>
                <div class="portfolio-desc">${escapeHtml(p.description)}</div>
                ${p.tags?.length ? `
                  <div class="portfolio-tags">
                    ${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                  </div>
                ` : ''}
                <div class="portfolio-links">
                  ${p.url ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener"><iconify-icon icon="lucide:external-link"></iconify-icon>Live</a>` : ''}
                  ${p.repo_url ? `<a href="${escapeAttr(p.repo_url)}" target="_blank" rel="noopener"><iconify-icon icon="lucide:github"></iconify-icon>Code</a>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      $('#add-portfolio')?.addEventListener('click', () => openPortfolioModal(null));

      $$('[data-edit]', list).forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = portfolio.find((x) => x.id === parseInt(btn.dataset.edit));
          if (item) openPortfolioModal(item);
        });
      });

      $$('[data-delete-portfolio]', list).forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this project?')) return;
          try {
            await api(`/api/portfolio/${btn.dataset.deletePortfolio}`, { method: 'DELETE' });
            toast('Project deleted', 'ok');
            router();
          } catch (e) {
            toast(e.message, 'err');
          }
        });
      });
    };

    $$('.tab', app).forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab', app).forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.tab === 'plugins') renderPlugins();
        else renderPortfolio();
      });
    });

    renderPlugins();
  }

  // ═══════════════════════════════════════════════════════════════
  // PORTFOLIO MODAL
  // ═══════════════════════════════════════════════════════════════

  function openPortfolioModal(item) {
    const isEdit = !!item;
    const data = item || {
      title: '', description: '', url: '', repo_url: '',
      image_url: '', tags: [], is_featured: false,
    };

    openModal(`
      <div class="modal-head">
        <div class="modal-head-main">
          <div class="modal-title">${isEdit ? 'Edit project' : 'New project'}</div>
          <div class="modal-sub">Showcase your work</div>
        </div>
        <button class="modal-close" data-modal-close>
          <iconify-icon icon="lucide:x"></iconify-icon>
        </button>
      </div>

      <form id="portfolio-form">
        <div class="form-group">
          <label class="form-label">Title <span class="req">*</span></label>
          <input class="form-input" name="title" value="${escapeAttr(data.title)}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Description <span class="req">*</span></label>
          <textarea class="form-textarea" name="description" required>${escapeHtml(data.description)}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Live URL</label>
            <input class="form-input" name="url" value="${escapeAttr(data.url || '')}" placeholder="https://...">
          </div>
          <div class="form-group">
            <label class="form-label">Repository</label>
            <input class="form-input" name="repo_url" value="${escapeAttr(data.repo_url || '')}" placeholder="https://github.com/...">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Cover image URL</label>
          <input class="form-input" name="image_url" value="${escapeAttr(data.image_url || '')}" placeholder="https://...">
        </div>
        <div class="form-group">
          <label class="form-label">Tags</label>
          <input class="form-input" name="tags" value="${escapeAttr((data.tags || []).join(', '))}" placeholder="react, terminal, ui">
          <div class="form-hint">comma separated</div>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" name="is_featured" ${data.is_featured ? 'checked' : ''}>
            <span class="form-label" style="margin:0;">Featured project</span>
          </label>
        </div>

        <div id="portfolio-error"></div>

        <div class="form-actions">
          <button class="btn btn-primary" type="submit" style="flex:1;">
            <iconify-icon icon="lucide:save"></iconify-icon>
            ${isEdit ? 'Save changes' : 'Create project'}
          </button>
          <button class="btn" type="button" data-modal-close>Cancel</button>
        </div>
      </form>
    `);

    $('#portfolio-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#portfolio-error');
      err.innerHTML = '';
      const fd = new FormData(e.target);

      const payload = {
        title: fd.get('title').trim(),
        description: fd.get('description').trim(),
        url: fd.get('url')?.trim() || null,
        repo_url: fd.get('repo_url')?.trim() || null,
        image_url: fd.get('image_url')?.trim() || null,
        tags: (fd.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean),
        is_featured: fd.get('is_featured') === 'on',
      };

      try {
        if (isEdit) {
          await api(`/api/portfolio/${item.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          await api('/api/portfolio', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        closeModal();
        toast(isEdit ? 'Project updated' : 'Project created', 'ok');
        router();
      } catch (e) {
        err.innerHTML = `<div class="form-error">${escapeHtml(e.message)}</div>`;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // DEFAULT TS TEMPLATE
  // ═══════════════════════════════════════════════════════════════

  const DEFAULT_TS = `// CATSHUB plugin template
// Each exported function is a command.
// Function name = command handler from manifest.

export function myCommand(ctx: any) {
  // ctx.args  — ["hello"]
  // ctx.flags — { name: "world" }
  // ctx.Result — { success, error, warn, kv, table, json, text }
  // ctx.print  — print to terminal

  const name = ctx.flags.name || 'world';

  return ctx.Result.kv([
    ['Hello', name, 'green'],
  ]);
}
`;

  // ═══════════════════════════════════════════════════════════════
  // PAGE: NEW / EDIT PLUGIN
  // ═══════════════════════════════════════════════════════════════

  async function pageNewPlugin(app) {
    if (!state.user) return navigate('#/login');
    app.innerHTML = renderEditorPage({ mode: 'new' });
    await initEditor(null);
    bindEditorForm('new');
  }

  async function pageEditPlugin(app, name) {
    if (!state.user) return navigate('#/login');

    const plugin = await api(`/api/plugins/${encodeURIComponent(name)}`);

    if (plugin.author_info.username !== state.user.username && state.user.role !== 'admin') {
      throw new Error('Not your plugin');
    }

    app.innerHTML = renderEditorPage({ mode: 'edit', plugin });
    await initEditor(plugin.code_ts || DEFAULT_TS);
    bindEditorForm('edit', plugin.name);
  }

  function renderEditorPage({ mode, plugin }) {
    const isEdit = mode === 'edit';
    const p = plugin || {
      name: '', description: '', version: '1.0.0',
      category: 'utils', icon: 'lucide:package',
    };

    return `
      <div class="form-page" style="max-width:900px;">
        <div class="form-label" style="margin-bottom:12px;">
          ${isEdit ? 'EDIT' : 'NEW'} · PLUGIN
        </div>
        <h1 class="form-title">${isEdit ? 'Edit plugin' : 'Add new plugin'}</h1>
        <p class="form-sub">
          ${isEdit
            ? 'Update the source and republish.'
            : 'Write TypeScript, we compile it to JavaScript in the browser.'}
        </p>

        <div id="editor-error"></div>

        <form id="plugin-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Name <span class="req">*</span></label>
              <input class="form-input" name="name" value="${escapeAttr(p.name)}"
                placeholder="indycarts-utils" ${isEdit ? 'readonly' : ''} required>
              <div class="form-hint">lowercase · dashes · 3–64 chars</div>
            </div>
            <div class="form-group">
              <label class="form-label">Version <span class="req">*</span></label>
              <input class="form-input" name="version" value="${escapeAttr(p.version)}"
                placeholder="1.0.0" required>
              <div class="form-hint">semver: X.Y.Z</div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Description <span class="req">*</span></label>
            <input class="form-input" name="description" value="${escapeAttr(p.description)}"
              placeholder="Utilities: UUID, hash, base64" required>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" name="category">
                ${['utils', 'admin', 'ui', 'fun', 'official'].map((c) => `
                  <option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Icon</label>
              <select class="form-select" name="icon">
                ${[
                  ['lucide:package', 'package'],
                  ['lucide:wrench', 'wrench'],
                  ['lucide:shield', 'shield'],
                  ['lucide:palette', 'palette'],
                  ['lucide:zap', 'zap'],
                  ['lucide:terminal', 'terminal'],
                  ['lucide:wand-2', 'wand'],
                ].map(([v, l]) => `
                  <option value="${v}" ${p.icon === v ? 'selected' : ''}>${l}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <div class="file-section">
            <div class="file-header">
              <iconify-icon icon="lucide:file-json"></iconify-icon>
              <span>plugin.json</span>
              <span class="file-header-badge auto">auto</span>
            </div>
            <pre class="code-preview" id="manifest-preview"></pre>
          </div>

          <div class="file-section">
            <div class="file-header">
              <iconify-icon icon="lucide:file-code"></iconify-icon>
              <span>main.ts</span>
              <span class="file-header-badge req">required</span>
            </div>
            <div class="code-editor" id="cm-editor"></div>
          </div>

          <div class="file-section" id="js-preview-section" hidden>
            <div class="file-header">
              <iconify-icon icon="lucide:file-code-2"></iconify-icon>
              <span>main.js</span>
              <span class="file-header-badge compiled">compiled</span>
            </div>
            <pre class="code-preview" id="js-preview"></pre>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              <iconify-icon icon="lucide:upload"></iconify-icon>
              ${isEdit ? 'Republish' : 'Publish plugin'}
            </button>
            <button class="btn" type="button" id="preview-btn">
              <iconify-icon icon="lucide:eye"></iconify-icon>
              Preview JS
            </button>
            <a class="btn" href="#/dashboard" data-nav>Cancel</a>
          </div>
        </form>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════
  // CODEMIRROR
  // ═══════════════════════════════════════════════════════════════

  let editorView = null;

  async function initEditor(initialCode) {
    if (!state.cmReady) {
      if (!window.CM) {
        await new Promise((r) => window.addEventListener('cm-ready', r, { once: true }));
      }
      state.cmReady = true;
    }

    const { EditorView, basicSetup, javascript, oneDark } = window.CM;
    const parent = $('#cm-editor');
    if (!parent) return;

    if (editorView) {
      try { editorView.destroy(); } catch {}
      editorView = null;
    }

    editorView = new EditorView({
      doc: initialCode || DEFAULT_TS,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) updateManifestPreview();
        }),
      ],
      parent,
    });
  }

  function getEditorCode() {
    return editorView ? editorView.state.doc.toString() : '';
  }

  // ═══════════════════════════════════════════════════════════════
  // EDITOR FORM
  // ═══════════════════════════════════════════════════════════════

  function bindEditorForm(mode, originalName) {
    const form = $('#plugin-form');
    if (!form) return;

    const updatePreview = () => updateManifestPreview();
    ['name', 'version', 'description', 'category', 'icon'].forEach((field) => {
      const el = form.querySelector(`[name="${field}"]`);
      el?.addEventListener('input', updatePreview);
      el?.addEventListener('change', updatePreview);
    });
    updatePreview();

    $('#preview-btn')?.addEventListener('click', () => {
      try {
        const compiled = compileTs(getEditorCode());
        $('#js-preview').textContent = compiled;
        $('#js-preview-section').hidden = false;
        toast('Compiled successfully', 'ok');
      } catch (e) {
        toast(e.message, 'err');
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#editor-error');
      err.innerHTML = '';

      const fd = new FormData(form);
      const name = String(fd.get('name')).toLowerCase().trim();
      const version = String(fd.get('version')).trim();
      const description = String(fd.get('description')).trim();
      const category = fd.get('category');
      const icon = fd.get('icon');
      const codeTs = getEditorCode();

      if (!/^[a-z][a-z0-9-]{2,63}$/.test(name)) {
        err.innerHTML = `<div class="form-error">Invalid plugin name</div>`;
        return;
      }
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        err.innerHTML = `<div class="form-error">Version must be X.Y.Z</div>`;
        return;
      }

      let codeJs;
      try {
        codeJs = compileTs(codeTs);
      } catch (e) {
        err.innerHTML = `<div class="form-error">Compile error: ${escapeHtml(e.message)}</div>`;
        return;
      }

      const manifest = {
        name,
        version,
        description,
        author: state.user.username,
        icon,
        category,
        main: 'main.js',
        commands: extractCommands(codeTs),
      };

      try {
        await api('/api/plugins/publish', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description,
            version,
            category,
            icon,
            code_js: codeJs,
            code_ts: codeTs,
            manifest,
          }),
        });
        toast(`Published: ${name} v${version}`, 'ok');
        navigate('#/dashboard');
      } catch (e) {
        err.innerHTML = `<div class="form-error">${escapeHtml(e.message)}</div>`;
      }
    });
  }

  function updateManifestPreview() {
    const form = $('#plugin-form');
    if (!form) return;
    const fd = new FormData(form);
    const manifest = {
      name: String(fd.get('name') || '').toLowerCase(),
      version: String(fd.get('version') || ''),
      description: String(fd.get('description') || ''),
      author: state.user?.username || '',
      icon: fd.get('icon'),
      category: fd.get('category'),
      main: 'main.js',
      commands: extractCommands(getEditorCode()),
    };
    const pre = $('#manifest-preview');
    if (pre) pre.textContent = JSON.stringify(manifest, null, 2);
  }

  // ═══════════════════════════════════════════════════════════════
  // SUCRASE COMPILER
  // ═══════════════════════════════════════════════════════════════

  function compileTs(source) {
    if (!window.sucrase) throw new Error('Sucrase not loaded');
    const { transform } = window.sucrase;
    const result = transform(source, {
      transforms: ['typescript'],
      disableESTransforms: true,
    });
    return result.code;
  }

  function extractCommands(source) {
    const re = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
    const commands = [];
    let match;
    while ((match = re.exec(source)) !== null) {
      commands.push({
        name: match[1],
        description: match[1],
        handler: match[1],
      });
    }
    return commands;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: PLUGIN DETAIL
  // ═══════════════════════════════════════════════════════════════

  async function pagePluginDetail(app, name) {
    const p = await api(`/api/plugins/${encodeURIComponent(name)}`);
    const author = p.author_info;

    app.innerHTML = `
      <div style="padding:48px 0 24px;border-bottom:1px solid var(--line);">
        <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">
          <div style="width:72px;height:72px;border-radius:16px;background:var(--bg-3);display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid var(--line-2);">
            <iconify-icon icon="${escapeAttr(p.icon || 'lucide:package')}" style="font-size:32px;color:var(--accent);"></iconify-icon>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
              <h1 class="form-title" style="margin:0;font-size:32px;">${escapeHtml(p.name)}</h1>
              ${p.verified ? '<iconify-icon icon="lucide:badge-check" style="font-size:22px;color:var(--accent);"></iconify-icon>' : ''}
            </div>
            <div style="font-family:var(--font-mono);font-size:13px;color:var(--text-mute);">
              v${escapeHtml(p.version)} · ${escapeHtml(p.category)} · by
              <a href="#/u/${escapeAttr(author.username)}" data-nav style="color:var(--accent);">@${escapeHtml(author.username)}</a>
            </div>
          </div>
        </div>

        <p style="color:var(--text-dim);line-height:1.7;margin-top:24px;max-width:720px;">
          ${escapeHtml(p.description)}
        </p>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px;">
          <button class="btn btn-primary" id="install-btn">
            <iconify-icon icon="lucide:terminal"></iconify-icon>
            cats install ${escapeHtml(p.name)}
          </button>
          <div class="btn" style="cursor:default;">
            <iconify-icon icon="lucide:download"></iconify-icon>
            ${formatNumber(p.downloads)} installs
          </div>
          <div class="btn" style="cursor:default;">
            <iconify-icon icon="lucide:star"></iconify-icon>
            ${p.rating || '0.0'} (${p.rating_count})
          </div>
        </div>
      </div>

      <div class="section-title" style="margin-top:32px;">
        <iconify-icon icon="lucide:list-checks"></iconify-icon>
        Commands
      </div>
      <div style="margin-top:14px;max-width:720px;">
        ${(p.manifest?.commands || []).length === 0
          ? '<div class="empty"><iconify-icon icon="lucide:minus"></iconify-icon><div class="empty-title">No commands</div></div>'
          : (p.manifest.commands || []).map((c) => `
            <div style="font-family:var(--font-mono);font-size:13px;padding:10px 14px;background:var(--bg-3);border:1px solid var(--line);border-radius:var(--radius-sm);margin-bottom:6px;display:flex;justify-content:space-between;gap:16px;">
              <span style="color:var(--ok);">${escapeHtml(c.name)}</span>
              <span style="color:var(--text-mute);font-family:var(--font-body);font-size:12px;">${escapeHtml(c.description || '')}</span>
            </div>
          `).join('')
        }
      </div>
    `;

    $('#install-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(`cats install ${p.name}`).catch(() => {});
      toast(`Copied: cats install ${p.name}`, 'ok', 'clipboard-check');
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: PROFILE
  // ═══════════════════════════════════════════════════════════════

  async function pageProfile(app, username) {
    const [profile, plugins, portfolio] = await Promise.all([
      api(`/api/users/${encodeURIComponent(username)}`),
      api(`/api/users/${encodeURIComponent(username)}/plugins`).catch(() => []),
      api(`/api/users/${encodeURIComponent(username)}/portfolio`).catch(() => []),
    ]);

    const isMe = state.user?.username === profile.username;
    const avatar = profile.avatar_url
      ? `<img src="${escapeAttr(profile.avatar_url)}" alt="">`
      : initials(profile.display_name || profile.username);

    app.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar">${avatar}</div>
        <div class="profile-info">
          <div class="profile-name">
            ${escapeHtml(profile.display_name || profile.username)}
            ${profile.is_verified ? '<iconify-icon class="verified" icon="lucide:badge-check"></iconify-icon>' : ''}
          </div>
          <div class="profile-username">@${escapeHtml(profile.username)}</div>
          ${profile.bio ? `<div class="profile-bio">${escapeHtml(profile.bio)}</div>` : ''}
          <div class="profile-links">
            ${profile.location ? `
              <span class="profile-link">
                <iconify-icon icon="lucide:map-pin"></iconify-icon>
                ${escapeHtml(profile.location)}
              </span>
            ` : ''}
            ${profile.website ? `
              <a class="profile-link" href="${escapeAttr(profile.website)}" target="_blank" rel="noopener">
                <iconify-icon icon="lucide:link"></iconify-icon>
                ${escapeHtml(profile.website.replace(/^https?:\/\//, ''))}
              </a>
            ` : ''}
            ${profile.github ? `
              <a class="profile-link" href="https://github.com/${escapeAttr(profile.github)}" target="_blank" rel="noopener">
                <iconify-icon icon="lucide:github"></iconify-icon>
                ${escapeHtml(profile.github)}
              </a>
            ` : ''}
            ${profile.twitter ? `
              <a class="profile-link" href="https://twitter.com/${escapeAttr(profile.twitter)}" target="_blank" rel="noopener">
                <iconify-icon icon="lucide:twitter"></iconify-icon>
                ${escapeHtml(profile.twitter)}
              </a>
            ` : ''}
            <span class="profile-link">
              <iconify-icon icon="lucide:calendar"></iconify-icon>
              joined ${formatDate(profile.created_at)}
            </span>
          </div>
        </div>
        ${isMe ? `
          <a class="btn" href="#/edit-profile" data-nav>
            <iconify-icon icon="lucide:user-cog"></iconify-icon>
            Edit profile
          </a>
        ` : ''}
      </div>

      <div class="profile-stats">
        <div class="profile-stat">
          <div class="profile-stat-value">${profile.plugins_count || 0}</div>
          <div class="profile-stat-label">Plugins</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-value">${formatNumber(profile.downloads || 0)}</div>
          <div class="profile-stat-label">Installs</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-value">${profile.portfolio_count || 0}</div>
          <div class="profile-stat-label">Projects</div>
        </div>
      </div>

      ${portfolio.length > 0 ? `
        <div class="section-header">
          <div class="section-title">
            <iconify-icon icon="lucide:folder-open"></iconify-icon>
            Portfolio
          </div>
        </div>
        <div class="portfolio-grid">
          ${portfolio.map((p) => `
            <div class="portfolio-card ${p.is_featured ? 'featured' : ''}">
              ${p.image_url ? `
                <div class="portfolio-image">
                  <img src="${escapeAttr(p.image_url)}" alt="" loading="lazy">
                </div>
              ` : ''}
              <div class="portfolio-title">${escapeHtml(p.title)}</div>
              <div class="portfolio-desc">${escapeHtml(p.description)}</div>
              ${p.tags?.length ? `
                <div class="portfolio-tags">
                  ${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                </div>
              ` : ''}
              <div class="portfolio-links">
                ${p.url ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener"><iconify-icon icon="lucide:external-link"></iconify-icon>Live</a>` : ''}
                ${p.repo_url ? `<a href="${escapeAttr(p.repo_url)}" target="_blank" rel="noopener"><iconify-icon icon="lucide:github"></iconify-icon>Code</a>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="section-header">
        <div class="section-title">
          <iconify-icon icon="lucide:package"></iconify-icon>
          Plugins (${plugins.length})
        </div>
      </div>

      ${plugins.length === 0 ? `
        <div class="empty">
          <iconify-icon icon="lucide:package-open"></iconify-icon>
          <div class="empty-title">No plugins yet</div>
        </div>
      ` : `
        <div>
          ${plugins.map((p) => `
            <div class="row" data-plugin="${escapeAttr(p.name)}">
              <div class="col-id">#${p.id}</div>
              <div class="col-name">
                ${p.verified ? '<iconify-icon class="verified" icon="lucide:badge-check"></iconify-icon>' : ''}
                <span class="name-text">${escapeHtml(p.name)}</span>
              </div>
              <div class="col-desc">${escapeHtml(p.description)}</div>
              <div class="col-version">v${escapeHtml(p.version)}</div>
              <div class="col-downloads">
                <iconify-icon icon="lucide:download"></iconify-icon>
                ${formatNumber(p.downloads || 0)}
              </div>
              <div class="col-action"></div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    $$('.row[data-plugin]', app).forEach((row) => {
      row.addEventListener('click', () => {
        navigate(`#/p/${encodeURIComponent(row.dataset.plugin)}`);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: EDIT PROFILE
  // ═══════════════════════════════════════════════════════════════

  async function pageEditProfile(app) {
    if (!state.user) return navigate('#/login');

    const u = state.user;

    app.innerHTML = `
      <div class="form-page" style="max-width:600px;">
        <h1 class="form-title">Edit profile</h1>
        <p class="form-sub">Make it yours</p>

        <div id="profile-error"></div>

        <form id="profile-form">
          <div class="form-group">
            <label class="form-label">Display name</label>
            <input class="form-input" name="display_name" value="${escapeAttr(u.display_name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Bio</label>
            <textarea class="form-textarea" name="bio" placeholder="A few words about you...">${escapeHtml(u.bio || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Avatar URL</label>
            <input class="form-input" name="avatar_url" value="${escapeAttr(u.avatar_url || '')}" placeholder="https://...">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Location</label>
              <input class="form-input" name="location" value="${escapeAttr(u.location || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Website</label>
              <input class="form-input" name="website" value="${escapeAttr(u.website || '')}" placeholder="https://...">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">GitHub</label>
              <input class="form-input" name="github" value="${escapeAttr(u.github || '')}" placeholder="username">
            </div>
            <div class="form-group">
              <label class="form-label">Twitter</label>
              <input class="form-input" name="twitter" value="${escapeAttr(u.twitter || '')}" placeholder="username">
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              <iconify-icon icon="lucide:save"></iconify-icon>
              Save changes
            </button>
            <a class="btn" href="#/dashboard" data-nav>Cancel</a>
          </div>
        </form>
      </div>
    `;

    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#profile-error');
      err.innerHTML = '';
      const fd = new FormData(e.target);

      const payload = {};
      ['display_name', 'bio', 'avatar_url', 'location', 'website', 'github', 'twitter'].forEach((k) => {
        payload[k] = fd.get(k)?.trim() || null;
      });

      try {
        const updated = await api('/api/me', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        state.user = updated;
        toast('Profile updated', 'ok');
        navigate(`#/u/${updated.username}`);
      } catch (e) {
        err.innerHTML = `<div class="form-error">${escapeHtml(e.message)}</div>`;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: ADMIN
  // ═══════════════════════════════════════════════════════════════

  async function pageAdmin(app) {
    if (!state.user || state.user.role !== 'admin') return navigate('#/');

    const [plugins, users] = await Promise.all([
      api('/api/plugins?limit=200').catch(() => []),
      api('/api/admin/users').catch(() => []),
    ]);

    const pending = plugins.filter((p) => !p.verified);

    app.innerHTML = `
      <div style="padding:48px 0 24px;border-bottom:1px solid var(--line);">
        <h1 class="form-title" style="margin-bottom:6px;">Admin panel</h1>
        <div style="font-family:var(--font-mono);font-size:13px;color:var(--text-mute);">
          ${pending.length} pending · ${plugins.length} total plugins · ${users.length} users
        </div>
      </div>

      <div class="tabs" style="margin-top:24px;">
        <button class="tab active" data-tab="pending">
          <iconify-icon icon="lucide:clock"></iconify-icon>
          Pending (${pending.length})
        </button>
        <button class="tab" data-tab="verified">
          <iconify-icon icon="lucide:badge-check"></iconify-icon>
          Verified (${plugins.filter((p) => p.verified).length})
        </button>
        <button class="tab" data-tab="users">
          <iconify-icon icon="lucide:users"></iconify-icon>
          Users (${users.length})
        </button>
      </div>

      <div id="admin-content"></div>
    `;

    const content = $('#admin-content');

    const renderPlugins = (items, verifyMode) => {
      if (items.length === 0) {
        content.innerHTML = `
          <div class="empty">
            <iconify-icon icon="lucide:check-circle"></iconify-icon>
            <div class="empty-title">Nothing here</div>
          </div>
        `;
        return;
      }

      content.innerHTML = items.map((p) => `
        <div class="row">
          <div class="col-id">#${p.id}</div>
          <div class="col-name">
            ${p.verified ? '<iconify-icon class="verified" icon="lucide:badge-check"></iconify-icon>' : ''}
            <span class="name-text">${escapeHtml(p.name)}</span>
          </div>
          <div class="col-desc">${escapeHtml(p.description)}</div>
          <div class="col-version">v${escapeHtml(p.version)}</div>
          <div class="col-downloads">
            <iconify-icon icon="lucide:user"></iconify-icon>
            @${escapeHtml(p.author)}
          </div>
          <div class="col-action" style="display:flex;gap:6px;justify-content:flex-end;">
            <a class="btn btn-sm" href="#/p/${escapeAttr(p.name)}" data-nav title="View">
              <iconify-icon icon="lucide:eye"></iconify-icon>
            </a>
            ${verifyMode ? `
              <button class="btn btn-sm btn-ok" data-verify="${escapeAttr(p.name)}" title="Verify">
                <iconify-icon icon="lucide:check"></iconify-icon>
              </button>
              <button class="btn btn-sm btn-danger" data-reject="${escapeAttr(p.name)}" title="Reject">
                <iconify-icon icon="lucide:x"></iconify-icon>
              </button>
            ` : `
              <button class="btn btn-sm btn-danger" data-unverify="${escapeAttr(p.name)}" title="Unverify">
                <iconify-icon icon="lucide:x"></iconify-icon>
              </button>
            `}
          </div>
        </div>
      `).join('');

      $$('[data-verify]', content).forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/api/admin/plugins/${btn.dataset.verify}/verify`, {
              method: 'POST',
              body: JSON.stringify({ verified: true }),
            });
            toast(`Verified: ${btn.dataset.verify}`, 'ok');
            router();
          } catch (e) { toast(e.message, 'err'); }
        });
      });

      $$('[data-reject]', content).forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Delete plugin ${btn.dataset.reject}?`)) return;
          try {
            await api(`/api/plugins/${btn.dataset.reject}`, { method: 'DELETE' });
            toast('Deleted', 'ok');
            router();
          } catch (e) { toast(e.message, 'err'); }
        });
      });

      $$('[data-unverify]', content).forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/api/admin/plugins/${btn.dataset.unverify}/verify`, {
              method: 'POST',
              body: JSON.stringify({ verified: false }),
            });
            toast('Unverified', 'ok');
            router();
          } catch (e) { toast(e.message, 'err'); }
        });
      });
    };

    const renderUsers = () => {
      if (users.length === 0) {
        content.innerHTML = `<div class="empty"><iconify-icon icon="lucide:users"></iconify-icon><div class="empty-title">No users</div></div>`;
        return;
      }

      content.innerHTML = users.map((u) => `
        <div class="row">
          <div class="col-id">#${u.id}</div>
          <div class="col-name">
            <span class="name-text">@${escapeHtml(u.username)}</span>
          </div>
          <div class="col-desc">${escapeHtml(u.display_name || '')}</div>
          <div class="col-version">${escapeHtml(u.role)}</div>
          <div class="col-downloads">${formatDate(u.created_at)}</div>
          <div class="col-action" style="display:flex;gap:6px;justify-content:flex-end;">
            ${u.role !== 'admin' ? `
              <button class="btn btn-sm" data-promote="${u.id}" title="Promote">
                <iconify-icon icon="lucide:shield"></iconify-icon>
              </button>
            ` : ''}
            ${u.id !== state.user.id ? `
              <button class="btn btn-sm btn-danger" data-delete-user="${u.id}" title="Delete">
                <iconify-icon icon="lucide:trash-2"></iconify-icon>
              </button>
            ` : ''}
          </div>
        </div>
      `).join('');

      $$('[data-promote]', content).forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/api/admin/users/${btn.dataset.promote}/role`, {
              method: 'POST',
              body: JSON.stringify({ role: 'admin' }),
            });
            toast('Promoted to admin', 'ok');
            router();
          } catch (e) { toast(e.message, 'err'); }
        });
      });

      $$('[data-delete-user]', content).forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete user and all their plugins?')) return;
          try {
            await api(`/api/admin/users/${btn.dataset.deleteUser}`, { method: 'DELETE' });
            toast('User deleted', 'ok');
            router();
          } catch (e) { toast(e.message, 'err'); }
        });
      });
    };

    $$('.tab', app).forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab', app).forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const t = tab.dataset.tab;
        if (t === 'pending') renderPlugins(pending, true);
        else if (t === 'verified') renderPlugins(plugins.filter((p) => p.verified), false);
        else renderUsers();
      });
    });

    renderPlugins(pending, true);
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE: NOT FOUND
  // ═══════════════════════════════════════════════════════════════

  function pageNotFound(app) {
    app.innerHTML = `
      <div class="empty" style="padding:120px 20px;">
        <iconify-icon icon="lucide:compass"></iconify-icon>
        <div class="empty-title">404</div>
        <div class="empty-sub">Page not found</div>
        <a class="btn btn-primary" href="#/" data-nav style="margin-top:16px;">
          <iconify-icon icon="lucide:home"></iconify-icon>
          Back home
        </a>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════
  // GLOBAL DATA-NAV HANDLER
  // ═══════════════════════════════════════════════════════════════

  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-nav]');
    if (link && link.getAttribute('href')?.startsWith('#')) {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // BOOTSTRAP
  // ═══════════════════════════════════════════════════════════════

  (async function boot() {
    await loadMe();
    await router();
  })();

})(); 
