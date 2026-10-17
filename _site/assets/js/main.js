(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  var KEYS = {
    theme: 'docucraft_theme',
    tree: 'docucraft_gh_tree_state',
    density: 'docucraft_gh_tree_density',
    width: 'docucraft_gh_sidebar_width',
    hidden: 'docucraft_gh_sidebar_hidden'
  };
  var MOBILE_QUERY = window.matchMedia('(max-width: 900px)');
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------- Theme */
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  var THEME_ORDER = ['light', 'dark', 'system'];

  function applyTheme(mode) {
    var dark = mode === 'dark' || (mode === 'system' && darkQuery.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-mode', mode);
    var btn = $('#themeBtn');
    if (btn) {
      var label = 'Theme: ' + mode + ' (click to change)';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
  }
  function initTheme() {
    var mode = root.getAttribute('data-theme-mode') || 'system';
    applyTheme(mode);
    var btn = $('#themeBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        var cur = root.getAttribute('data-theme-mode') || 'system';
        var next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
        store(KEYS.theme, next);
        applyTheme(next);
      });
    }
    var onSystemChange = function () {
      if ((root.getAttribute('data-theme-mode') || 'system') === 'system') applyTheme('system');
    };
    if (darkQuery.addEventListener) darkQuery.addEventListener('change', onSystemChange);
    else if (darkQuery.addListener) darkQuery.addListener(onSystemChange);
  }

  /* -------------------------------------------------------------- Sidebar */
  var sidebar = $('#sidebar');
  var backdrop = $('#sidebarBackdrop');
  var menuBtn = $('#menuBtn');
  var sidebarToggleBtn = $('#sidebarToggleBtn');

  function updateSidebarToggle() {
    if (!sidebarToggleBtn) return;
    var hidden = root.classList.contains('sidebar-hidden');
    sidebarToggleBtn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    var label = (hidden ? 'Show' : 'Hide') + ' navigation (Ctrl+B)';
    sidebarToggleBtn.setAttribute('aria-label', label);
    sidebarToggleBtn.setAttribute('title', label);
  }
  function setSidebarHidden(hidden) {
    root.classList.toggle('sidebar-hidden', hidden);
    store(KEYS.hidden, hidden ? 'true' : 'false');
    updateSidebarToggle();
  }
  function setDrawerOpen(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (backdrop) backdrop.hidden = !open;
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.classList.toggle('modal-open', open);
  }
  function toggleSidebar() {
    if (!sidebar) return;
    if (MOBILE_QUERY.matches) setDrawerOpen(!sidebar.classList.contains('open'));
    else setSidebarHidden(!root.classList.contains('sidebar-hidden'));
  }

  function initSidebar() {
    if (!sidebar) return;
    updateSidebarToggle();
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', function () { setDrawerOpen(false); });
    sidebar.addEventListener('click', function (e) {
      if (MOBILE_QUERY.matches && e.target.closest('.tree-doc-link')) setDrawerOpen(false);
    });
    var onBreakpoint = function () { if (!MOBILE_QUERY.matches) setDrawerOpen(false); };
    if (MOBILE_QUERY.addEventListener) MOBILE_QUERY.addEventListener('change', onBreakpoint);
    else if (MOBILE_QUERY.addListener) MOBILE_QUERY.addListener(onBreakpoint);
  }

  /* -------------------------------------------------------------- Resizer */
  var DEFAULT_WIDTH = 280, MIN_WIDTH = 220, MAX_WIDTH = 750;

  function applySidebarWidth(width) {
    var max = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.5)));
    var clamped = Math.max(MIN_WIDTH, Math.min(width, max));
    root.style.setProperty('--sidebar-w', clamped + 'px');
    return clamped;
  }
  function initResizer() {
    var resizer = $('#sidebarResizer');
    if (!resizer || !sidebar) return;
    var startX = 0, startWidth = 0, dragging = false;

    resizer.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startWidth = sidebar.getBoundingClientRect().width;
      resizer.setPointerCapture(e.pointerId);
      resizer.classList.add('is-active');
      body.classList.add('is-resizing');
    });
    resizer.addEventListener('pointermove', function (e) {
      if (dragging) applySidebarWidth(startWidth + (e.clientX - startX));
    });
    var stop = function () {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('is-active');
      body.classList.remove('is-resizing');
      store(KEYS.width, String(Math.round(sidebar.getBoundingClientRect().width)));
    };
    resizer.addEventListener('pointerup', stop);
    resizer.addEventListener('pointercancel', stop);
    resizer.addEventListener('dblclick', function () {
      applySidebarWidth(DEFAULT_WIDTH);
      store(KEYS.width, null);
    });
  }

  /* ----------------------------------------------------------------- Tree */
  function setExpanded(node, expanded) {
    node.classList.toggle('is-expanded', expanded);
    var btn = node.querySelector(':scope > button[data-toggle-tree]');
    if (btn) btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  function saveTreeState() {
    var ids = $$('.tree-category.is-expanded, .tree-subcategory.is-expanded').map(function (n) { return n.id; });
    store(KEYS.tree, JSON.stringify(ids));
  }
  function restoreTreeState() {
    var raw = read(KEYS.tree);
    if (raw) {
      try {
        var ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          $$('.tree-category, .tree-subcategory').forEach(function (n) {
            var keep = ids.indexOf(n.id) !== -1 || n.classList.contains('is-active-branch') || n.classList.contains('is-active-sub');
            setExpanded(n, keep);
          });
        }
      } catch (e) {}
    }
    var active = $('.tree-doc-link.active');
    if (active && sidebar) {
      var top = active.offsetTop - sidebar.clientHeight / 2;
      if (top > 0) sidebar.scrollTop = top;
    }
  }
  function filterTree(value) {
    var q = (value || '').trim().toLowerCase();
    var clearBtn = $('#treeFilterClear');
    var empty = $('#treeEmptyState');
    if (clearBtn) clearBtn.hidden = !q;
    var total = 0;

    $$('.tree-category').forEach(function (cat) {
      var catMatches = 0;
      $$('.tree-item', cat).forEach(function (item) {
        var hay = [item.dataset.title, item.dataset.category, item.dataset.subcategory].join(' ');
        var match = !q || hay.indexOf(q) !== -1;
        item.hidden = !match;
        if (match) catMatches++;
      });
      $$('.tree-subcategory', cat).forEach(function (sub) {
        var visible = $$('.tree-item', sub).some(function (i) { return !i.hidden; });
        sub.parentElement.hidden = !!q && !visible;
        if (q && visible) setExpanded(sub, true);
      });
      cat.hidden = !!q && catMatches === 0;
      if (q && catMatches) setExpanded(cat, true);
      total += catMatches;
    });

    if (empty) {
      empty.hidden = !(q && total === 0);
      var term = $('#emptyQueryTerm');
      if (term) term.textContent = value;
    }
  }
  function clearFilter() {
    var input = $('#treeFilterInput');
    if (input) { input.value = ''; input.focus(); }
    filterTree('');
    restoreTreeState();
  }
  function initTree() {
    if (!sidebar) return;
    sidebar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-toggle-tree]');
      if (!btn) return;
      var node = btn.parentElement;
      setExpanded(node, !node.classList.contains('is-expanded'));
      saveTreeState();
    });
    var expandAll = $('#treeExpandAll');
    var collapseAll = $('#treeCollapseAll');
    if (expandAll) expandAll.addEventListener('click', function () {
      $$('.tree-category, .tree-subcategory').forEach(function (n) { setExpanded(n, true); });
      saveTreeState();
    });
    if (collapseAll) collapseAll.addEventListener('click', function () {
      $$('.tree-category, .tree-subcategory').forEach(function (n) {
        setExpanded(n, n.classList.contains('is-active-branch') || n.classList.contains('is-active-sub'));
      });
      saveTreeState();
    });

    var densityBtn = $('#treeDensityBtn');
    var setDensity = function (compact) {
      sidebar.classList.toggle('density-compact', compact);
      if (densityBtn) densityBtn.textContent = compact ? 'Cozy' : 'Compact';
    };
    setDensity(read(KEYS.density) === 'compact');
    if (densityBtn) densityBtn.addEventListener('click', function () {
      var compact = !sidebar.classList.contains('density-compact');
      setDensity(compact);
      store(KEYS.density, compact ? 'compact' : 'cozy');
    });

    var input = $('#treeFilterInput');
    if (input) {
      input.addEventListener('input', function () { filterTree(input.value); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Escape') clearFilter(); });
    }
    var clearBtn = $('#treeFilterClear');
    var resetBtn = $('#treeResetFilter');
    if (clearBtn) clearBtn.addEventListener('click', clearFilter);
    if (resetBtn) resetBtn.addEventListener('click', clearFilter);

    restoreTreeState();
  }

  /* -------------------------------------------------------------- Article */
  function slugify(text) {
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  }
  function initToc() {
    var article = $('#articleBody');
    var list = $('#tocList');
    var pane = $('#tocPane');
    if (!article || !list) return;
    var headings = $$('h2, h3', article);
    if (!headings.length) { if (pane) pane.hidden = true; return; }

    var links = headings.map(function (h, i) {
      var text = h.textContent;
      if (!h.id) h.id = slugify(text) || 'section-' + i;
      var anchor = document.createElement('a');
      anchor.className = 'heading-anchor';
      anchor.href = '#' + h.id;
      anchor.setAttribute('aria-label', 'Link to this section');
      anchor.textContent = '#';
      h.appendChild(anchor);

      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'toc-link' + (h.tagName === 'H3' ? ' depth-3' : '');
      a.href = '#' + h.id;
      a.textContent = text;
      li.appendChild(a);
      list.appendChild(li);
      return a;
    });

    if (!('IntersectionObserver' in window)) return;
    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target);
      });
      var current = headings.find(function (h) { return visible.has(h); });
      if (!current) return;
      links.forEach(function (l, i) { l.classList.toggle('active', headings[i] === current); });
    }, { rootMargin: '-64px 0px -65% 0px' });
    headings.forEach(function (h) { observer.observe(h); });
  }

  function initCodeBlocks() {
    $$('.prose pre').forEach(function (pre) {
      if (pre.closest('.code-wrapper')) return;
      var langHost = pre.closest('[class*="language-"]') || pre.querySelector('code[class*="language-"]');
      var match = langHost && langHost.className.match(/language-([\w-]+)/);
      var lang = match ? match[1] : 'code';

      var wrapper = document.createElement('div');
      wrapper.className = 'code-wrapper';
      var header = document.createElement('div');
      header.className = 'code-header';
      var label = document.createElement('span');
      label.textContent = lang;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code') || pre;
        navigator.clipboard.writeText(code.innerText).then(function () {
          btn.textContent = 'Copied';
          btn.classList.add('copied');
          setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
        });
      });
      header.appendChild(label);
      header.appendChild(btn);

      var host = pre.closest('.highlighter-rouge') || pre;
      host.parentNode.insertBefore(wrapper, host);
      wrapper.appendChild(header);
      wrapper.appendChild(host);
    });
  }

  function initTables() {
    $$('.prose table').forEach(function (table) {
      if (table.parentElement.classList.contains('table-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function initProgress() {
    var bar = $('#readingProgress');
    var article = $('#articleBody');
    if (!bar || !article) return;
    var ticking = false;
    var update = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* --------------------------------------------------------------- Search */
  var modal = $('#searchModal');
  var searchInput = $('#searchInput');
  var resultsEl = $('#searchResults');
  var searchIndex = null;
  var results = [];
  var selected = 0;
  var lastFocus = null;

  function loadIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    return fetch(body.getAttribute('data-search-url'))
      .then(function (r) { return r.json(); })
      .then(function (data) { searchIndex = Array.isArray(data) ? data.filter(Boolean) : []; return searchIndex; })
      .catch(function () { searchIndex = []; return searchIndex; });
  }
  function scoreDoc(doc, terms) {
    var title = (doc.title || '').toLowerCase();
    var rest = [doc.classification, doc.category, doc.subcategory, doc.description, (doc.tags || []).join(' ')].join(' ').toLowerCase();
    var score = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (title.indexOf(t) === 0) score += 6;
      else if (title.indexOf(t) !== -1) score += 4;
      else if (rest.indexOf(t) !== -1) score += 1;
      else return 0;
    }
    return score;
  }
  function renderResults(query) {
    var q = query.trim().toLowerCase();
    var terms = q.split(/\s+/).filter(Boolean);
    var docs = searchIndex || [];
    if (terms.length) {
      results = docs
        .map(function (d) { return { doc: d, score: scoreDoc(d, terms) }; })
        .filter(function (r) { return r.score > 0; })
        .sort(function (a, b) { return b.score - a.score; })
        .map(function (r) { return r.doc; })
        .slice(0, 20);
    } else {
      results = docs.slice();
    }
    selected = 0;
    resultsEl.textContent = '';

    if (!results.length) {
      var empty = document.createElement('li');
      empty.className = 'search-empty';
      empty.textContent = 'No results for “' + query + '”';
      resultsEl.appendChild(empty);
      return;
    }

    var lastGroup = null;
    results.forEach(function (doc, i) {
      var groupName = [doc.classification, doc.category].filter(Boolean).join(' › ') || 'General';
      if (!terms.length && groupName !== lastGroup) {
        lastGroup = groupName;
        var label = document.createElement('li');
        label.className = 'search-group-label';
        label.setAttribute('role', 'presentation');
        label.textContent = groupName;
        resultsEl.appendChild(label);
      }
      var li = document.createElement('li');
      li.className = 'search-result' + (i === 0 ? ' is-selected' : '');
      li.setAttribute('role', 'option');
      li.id = 'search-opt-' + i;
      var title = document.createElement('span');
      title.className = 'search-result-title';
      title.textContent = doc.title;
      var desc = document.createElement('span');
      desc.className = 'search-result-desc';
      desc.textContent = terms.length
        ? [doc.classification, doc.category, doc.subcategory].filter(Boolean).join(' › ')
        : (doc.description || '');
      li.appendChild(title);
      li.appendChild(desc);
      li.addEventListener('mousemove', function () { select(i); });
      li.addEventListener('click', function () { go(i); });
      resultsEl.appendChild(li);
    });
    searchInput.setAttribute('aria-activedescendant', 'search-opt-0');
  }
  function select(i) {
    if (!results.length) return;
    selected = (i + results.length) % results.length;
    $$('.search-result', resultsEl).forEach(function (el, idx) {
      el.classList.toggle('is-selected', idx === selected);
    });
    var el = $('#search-opt-' + selected);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      searchInput.setAttribute('aria-activedescendant', el.id);
    }
  }
  function go(i) {
    var doc = results[i];
    // Only follow same-origin paths produced by search.json.
    if (doc && typeof doc.url === 'string' && doc.url.charAt(0) === '/' && doc.url.charAt(1) !== '/') {
      window.location.href = doc.url;
    }
  }
  function openSearch() {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    body.classList.add('modal-open');
    searchInput.value = '';
    loadIndex().then(function () { renderResults(''); });
    setTimeout(function () { searchInput.focus(); }, 10);
  }
  function closeSearch() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function initSearch() {
    $$('[data-mod-key]').forEach(function (el) { el.textContent = isMac ? '⌘' : 'Ctrl'; });
    $$('[data-search-open]').forEach(function (b) { b.addEventListener('click', openSearch); });
    if (!modal) return;
    $$('[data-search-close]', modal).forEach(function (b) { b.addEventListener('click', closeSearch); });
    searchInput.addEventListener('input', function () { renderResults(searchInput.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(selected + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(selected - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); go(selected); }
    });
  }

  /* ------------------------------------------------------------ Shortcuts */
  function isTyping(target) {
    return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  }
  function initShortcuts() {
    window.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      var key = (e.key || '').toLowerCase();
      if (mod && key === 'k') { e.preventDefault(); modal && !modal.hidden ? closeSearch() : openSearch(); return; }
      if (e.key === 'Escape') {
        if (modal && !modal.hidden) { closeSearch(); return; }
        if (sidebar && sidebar.classList.contains('open')) { setDrawerOpen(false); return; }
      }
      if (isTyping(e.target)) return;
      if (mod && key === 'b' && sidebar) { e.preventDefault(); toggleSidebar(); }
      else if (!mod && e.key === '[' && sidebar) { e.preventDefault(); toggleSidebar(); }
      else if (!mod && e.key === '/') { e.preventDefault(); openSearch(); }
    });
    $$('[data-scroll-top]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    });
  }

  initTheme();
  initSidebar();
  initResizer();
  initTree();
  initToc();
  initCodeBlocks();
  initTables();
  initProgress();
  initSearch();
  initShortcuts();
})();
