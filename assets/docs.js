/**
 * Beast-mode doc reader: search, theme, keyboard shortcuts, progress, prev/next, run code, copy link.
 */
(function () {
  'use strict';

  var MAIN_ID = 'docs-main-content';
  var STORAGE_THEME = 'skillup-docs-theme';
  var STORAGE_PROGRESS = 'skillup-docs-progress-';
  var STORAGE_COMPLETE = 'skillup-docs-complete-';
  var EVENT_LOG_KEY = 'skillup.eventLog';
  var DOC_STATE_PREFIX = 'skillup.docState.';

  var assetPath = getAssetPath();
  var docPath = getDocPath();
  var topbar = document.querySelector('.topbar');
  var mainEl = document.querySelector('.main');
  if (mainEl && !mainEl.id) mainEl.id = MAIN_ID;

  function safeTagName(el) {
    try { return (el && el.tagName) ? String(el.tagName).toUpperCase() : ''; } catch (e) { return ''; }
  }

  function getDocId() {
    return (docPath || '').replace(/[^\w\-]+/g, '_');
  }

  function getDocState() {
    if (!docPath) return {};
    try {
      return JSON.parse(localStorage.getItem(DOC_STATE_PREFIX + getDocId()) || '{}') || {};
    } catch (e) { return {}; }
  }

  function setDocState(next) {
    if (!docPath) return;
    try { localStorage.setItem(DOC_STATE_PREFIX + getDocId(), JSON.stringify(next || {})); } catch (e) {}
  }

  function pushEvent(type, payload) {
    try {
      var list = JSON.parse(localStorage.getItem(EVENT_LOG_KEY) || '[]');
      list.unshift({
        type: type,
        at: new Date().toISOString(),
        docId: getDocId(),
        docPath: docPath,
        title: (document.title || '').replace(/\s*\|.*$/, ''),
        payload: payload || {}
      });
      localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(list.slice(0, 300)));
    } catch (e) {}
  }

  // ----- Theme -----
  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_THEME) || 'light';
    } catch (e) { return 'light'; }
  }
  function resolveSystemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }
  function applyTheme(mode) {
    var root = document.documentElement;
    var m = mode || 'light';
    root.setAttribute('data-theme-mode', m);
    root.setAttribute('data-theme', m === 'system' ? resolveSystemTheme() : m);
    try { localStorage.setItem(STORAGE_THEME, m); } catch (e) {}
  }
  function getThemeMode() {
    var m = getStoredTheme();
    if (m !== 'light' && m !== 'dark' && m !== 'system') m = 'light';
    return m;
  }
  function refreshSystemThemeIfNeeded() {
    var root = document.documentElement;
    var mode = root.getAttribute('data-theme-mode') || getThemeMode();
    if (mode === 'system') root.setAttribute('data-theme', resolveSystemTheme());
  }
  function themeIcon(mode) {
    return { light: '&#9728;', dark: '&#9790;', system: '&#9788;' }[mode] || '&#9728;';
  }
  function initTheme() {
    applyTheme(getThemeMode());
    if (topbar && !document.getElementById('docs-theme-wrap')) {
      var wrap = document.createElement('div');
      wrap.className = 'tb-actions';
      wrap.id = 'docs-theme-wrap';
      var themeBtn = document.createElement('button');
      themeBtn.className = 'theme-btn';
      themeBtn.setAttribute('aria-label', 'Toggle theme');
      themeBtn.onclick = function () {
        var cur = document.documentElement.getAttribute('data-theme-mode') || getThemeMode();
        var next = { light: 'dark', dark: 'system', system: 'light' }[cur] || 'light';
        applyTheme(next);
        themeBtn.innerHTML = themeIcon(next);
      };
      themeBtn.innerHTML = themeIcon(getThemeMode());
      wrap.appendChild(themeBtn);
      var searchBtn = document.createElement('button');
      searchBtn.className = 'search-trigger-btn';
      searchBtn.setAttribute('aria-label', 'Search in page (/)');
      searchBtn.innerHTML = '&#128269;';
      searchBtn.onclick = openSearch;
      wrap.appendChild(searchBtn);

      var globalBtn = document.createElement('button');
      globalBtn.className = 'global-search-trigger-btn';
      globalBtn.setAttribute('aria-label', 'Search across all docs (Ctrl+P)');
      globalBtn.innerHTML = '&#128218;';
      globalBtn.onclick = openGlobalSearch;
      wrap.appendChild(globalBtn);
      topbar.appendChild(wrap);
    }
  }
  initTheme();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addListener(function () {
      refreshSystemThemeIfNeeded();
    });
  }

  // ----- Skip link -----
  if (mainEl && !document.querySelector('.skip-link')) {
    var skip = document.createElement('a');
    skip.href = '#' + MAIN_ID;
    skip.className = 'skip-link';
    skip.textContent = 'Skip to content';
    document.body.insertBefore(skip, document.body.firstChild);
  }

  // ----- In-doc search -----
  var searchOverlay = null;
  var searchInput = null;
  var searchResultsEl = null;
  var searchMatches = [];
  var searchIndex = -1;

  var globalOverlay = null;
  var globalInput = null;
  var globalResultsEl = null;
  var globalMatches = [];
  var globalIndex = -1;

  function buildSearchModal() {
    if (searchOverlay) return;
    searchOverlay = document.createElement('div');
    searchOverlay.className = 'doc-search-overlay';
    searchOverlay.id = 'doc-search-overlay';
    searchOverlay.innerHTML =
      '<div class="doc-search-modal" role="dialog" aria-label="Search in page">' +
      '  <div class="doc-search-input-wrap">' +
      '    <input type="text" class="doc-search-input" id="doc-search-input" placeholder="Search sections and content…" autocomplete="off" aria-label="Search">' +
      '  </div>' +
      '  <div class="doc-search-results" id="doc-search-results"></div>' +
      '  <div class="doc-search-kbd">Escape to close · Enter to go to result</div>' +
      '</div>';
    document.body.appendChild(searchOverlay);
    searchInput = document.getElementById('doc-search-input');
    searchResultsEl = document.getElementById('doc-search-results');
    searchOverlay.addEventListener('click', function (e) {
      if (e.target === searchOverlay) closeSearch();
    });
    searchInput.addEventListener('input', runSearch);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); focusResult(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); focusResult(-1); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        var focused = searchResultsEl.querySelector('.doc-search-result.focused');
        if (focused) focused.click();
        return;
      }
    });
  }

  function openSearch() {
    buildSearchModal();
    searchOverlay.classList.add('is-open');
    searchMatches = [];
    searchIndex = -1;
    searchResultsEl.innerHTML = '';
    searchInput.value = '';
    searchInput.focus();
  }

  function buildGlobalSearchModal() {
    if (globalOverlay) return;
    globalOverlay = document.createElement('div');
    globalOverlay.className = 'doc-global-search-overlay';
    globalOverlay.id = 'doc-global-search-overlay';
    globalOverlay.innerHTML =
      '<div class="doc-global-search-modal" role="dialog" aria-label="Search across docs">' +
      '  <div class="doc-global-search-input-wrap">' +
      '    <input type="text" class="doc-global-search-input" id="doc-global-search-input" placeholder="Search across all docs…" autocomplete="off" aria-label="Search across docs">' +
      '  </div>' +
      '  <div class="doc-global-search-results" id="doc-global-search-results"></div>' +
      '  <div class="doc-global-search-kbd">Escape to close · Enter to open</div>' +
      '</div>';
    document.body.appendChild(globalOverlay);
    globalInput = document.getElementById('doc-global-search-input');
    globalResultsEl = document.getElementById('doc-global-search-results');
    globalOverlay.addEventListener('click', function (e) {
      if (e.target === globalOverlay) closeGlobalSearch();
    });
    globalInput.addEventListener('input', runGlobalSearch);
    globalInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeGlobalSearch(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); focusGlobalResult(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); focusGlobalResult(-1); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        var focused = globalResultsEl.querySelector('.doc-global-search-result.focused');
        if (focused) focused.click();
        return;
      }
    });
  }

  function openGlobalSearch() {
    buildGlobalSearchModal();
    globalOverlay.classList.add('is-open');
    globalMatches = [];
    globalIndex = -1;
    globalResultsEl.innerHTML = '<div class="doc-global-search-empty">Loading…</div>';
    globalInput.value = '';
    globalInput.focus();
    loadRoadmapsData(function () {
      runGlobalSearch();
    });
  }

  function closeGlobalSearch() {
    if (!globalOverlay) return;
    globalOverlay.classList.remove('is-open');
  }

  function getGlobalDocs() {
    var out = [];
    var r = (window.ROADMAPS_DATA && window.ROADMAPS_DATA.roadmaps) ? window.ROADMAPS_DATA.roadmaps : [];
    r.forEach(function (rm) {
      (rm.docs || []).forEach(function (d) {
        out.push({
          roadmap: rm.name || '',
          title: d.title || d.href || '',
          href: d.href || ''
        });
      });
    });
    return out;
  }

  function normalizeForSearch(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightTokens(text, tokens) {
    var out = escapeHtml(text);
    if (!tokens || tokens.length === 0) return out;
    tokens.forEach(function (t) {
      if (!t) return;
      var re = new RegExp('(' + escapeRegExp(t) + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  function fuzzyScore(hay, tokens) {
    var h = normalizeForSearch(hay);
    if (!tokens || tokens.length === 0) return null;
    var score = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!t) continue;
      var idx = h.indexOf(t);
      if (idx === -1) return null;
      score += idx;
      if (idx === 0) score -= 6;
      if (h === t) score -= 10;
    }
    score += Math.max(0, h.length - 40) * 0.02;
    return score;
  }

  function runGlobalSearch() {
    if (!globalResultsEl) return;
    var q = normalizeForSearch(globalInput ? globalInput.value : '');
    var docs = getGlobalDocs();
    if (!docs || docs.length === 0) {
      globalResultsEl.innerHTML = '<div class="doc-global-search-empty">No roadmap data found (run: node scripts/generate-roadmaps.js)</div>';
      return;
    }
    if (!q) {
      globalResultsEl.innerHTML = '<div class="doc-global-search-empty">Type to search across all docs</div>';
      return;
    }

    var tokens = q.split(' ').filter(Boolean).slice(0, 6);
    var results = [];
    docs.forEach(function (d) {
      var hay = (d.title || '') + ' ' + (d.roadmap || '') + ' ' + (d.href || '');
      var s = fuzzyScore(hay, tokens);
      if (s === null) return;
      results.push({ doc: d, score: s });
    });
    results.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return normalizeForSearch(a.doc.title).localeCompare(normalizeForSearch(b.doc.title));
    });
    results = results.slice(0, 30);
    globalMatches = results.map(function (r) { return r.doc; });
    globalIndex = -1;

    globalResultsEl.innerHTML = '';
    if (globalMatches.length === 0) {
      globalResultsEl.innerHTML = '<div class="doc-global-search-empty">No matches</div>';
      return;
    }
    globalMatches.forEach(function (m, i) {
      var a = document.createElement('a');
      a.href = m.href;
      a.className = 'doc-global-search-result' + (i === 0 ? ' focused' : '');
      a.innerHTML =
        '<div class="doc-global-search-title">' + highlightTokens(m.title, tokens) + '</div>' +
        '<div class="doc-global-search-meta">' + highlightTokens(m.roadmap, tokens) + ' · ' + escapeHtml(m.href) + '</div>';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        closeGlobalSearch();
        window.location.href = m.href;
      });
      globalResultsEl.appendChild(a);
    });
  }

  function focusGlobalResult(delta) {
    if (!globalMatches || globalMatches.length === 0) return;
    globalIndex = (globalIndex + delta + globalMatches.length) % globalMatches.length;
    globalResultsEl.querySelectorAll('.doc-global-search-result').forEach(function (r, i) {
      r.classList.toggle('focused', i === globalIndex);
    });
    var focused = globalResultsEl.querySelector('.doc-global-search-result.focused');
    if (focused) focused.scrollIntoView({ block: 'nearest' });
  }

  function closeSearch() {
    if (searchOverlay) {
      searchOverlay.classList.remove('is-open');
      document.querySelectorAll('.content mark').forEach(function (m) {
        var p = m.parentNode;
        p.replaceChild(document.createTextNode(m.textContent), m);
        p.normalize();
      });
    }
  }

  function runSearch() {
    var q = (searchInput.value || '').trim().toLowerCase();
    searchMatches = [];
    if (!searchResultsEl) return;
    document.querySelectorAll('.content mark').forEach(function (m) {
      var p = m.parentNode;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
    if (!q) {
      searchResultsEl.innerHTML = '<div class="doc-search-empty">Type to search sections and content</div>';
      return;
    }
    var selectors = '.sec-title, .sub-title, .prose, .hero-title, .hero-lead, .sec-lead, .callout p, .think-step-title, .mental-model p, .check-text';
    document.querySelectorAll(selectors).forEach(function (el) {
      var text = el.textContent || '';
      if (text.toLowerCase().indexOf(q) === -1) return;
      var id = el.closest('[id]');
      var targetId = id ? id.id : null;
      var snippet = text.length > 80 ? text.slice(0, 80) + '…' : text;
      var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      snippet = snippet.replace(re, '<mark>$1</mark>');
      searchMatches.push({ el: el, targetId: targetId, snippet: snippet });
    });
    searchIndex = -1;
    searchResultsEl.innerHTML = '';
    if (searchMatches.length === 0) {
      searchResultsEl.innerHTML = '<div class="doc-search-empty">No matches</div>';
      return;
    }
    searchMatches.forEach(function (m, i) {
      var a = document.createElement('a');
      a.href = m.targetId ? '#' + m.targetId : '#';
      a.className = 'doc-search-result' + (i === 0 ? ' focused' : '');
      a.innerHTML = m.snippet;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (m.targetId) {
          var t = document.getElementById(m.targetId);
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (m.el) m.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeSearch();
      });
      searchResultsEl.appendChild(a);
    });
  }

  function focusResult(delta) {
    if (searchMatches.length === 0) return;
    searchIndex = (searchIndex + delta + searchMatches.length) % searchMatches.length;
    searchResultsEl.querySelectorAll('.doc-search-result').forEach(function (r, i) {
      r.classList.toggle('focused', i === searchIndex);
    });
    searchResultsEl.querySelector('.doc-search-result.focused').scrollIntoView({ block: 'nearest' });
  }

  // ----- Keyboard shortcuts -----
  var helpOverlay = null;
  function showHelp() {
    if (!helpOverlay) {
      helpOverlay = document.createElement('div');
      helpOverlay.className = 'help-overlay';
      helpOverlay.id = 'docs-help-overlay';
      helpOverlay.innerHTML =
        '<div class="help-modal">' +
        '  <h3>Keyboard shortcuts</h3>' +
        '  <ul>' +
        '    <li><span>Search in page</span><kbd>/</kbd></li>' +
        '    <li><span>Search (alternative)</span><kbd>Ctrl+K</kbd></li>' +
        '    <li><span>Close search / help</span><kbd>Escape</kbd></li>' +
        '    <li><span>Next section</span><kbd>j</kbd> or <kbd>↓</kbd></li>' +
        '    <li><span>Previous section</span><kbd>k</kbd> or <kbd>↑</kbd></li>' +
        '    <li><span>Go to index</span><kbd>g</kbd> then <kbd>h</kbd></li>' +
        '    <li><span>Show this help</span><kbd>?</kbd></li>' +
        '  </ul>' +
        '</div>';
      document.body.appendChild(helpOverlay);
      helpOverlay.addEventListener('click', function (e) {
        if (e.target === helpOverlay) { helpOverlay.classList.remove('is-open'); }
      });
    }
    helpOverlay.classList.toggle('is-open', true);
  }

  var gPressed = false;
  document.addEventListener('keydown', function (e) {
    var tag = safeTagName(e.target);
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openGlobalSearch();
      return;
    }
    if (e.key === 'Escape') {
      closeSearch();
      closeGlobalSearch();
      if (helpOverlay) helpOverlay.classList.remove('is-open');
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      showHelp();
      return;
    }
    if (e.key === 'g') { gPressed = true; return; }
    if (e.key === 'h' && gPressed) {
      e.preventDefault();
      gPressed = false;
      var base = assetPath.replace(/assets\/?$/, '').replace(/\/$/, '') || '..';
      window.location.href = (base ? base + '/' : '') + 'index.html';
      return;
    }
    gPressed = false;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      if (e.altKey) return;
      e.preventDefault();
      var ids = Array.from(document.querySelectorAll('.section[id], .sub[id]')).map(function (x) { return x.id; });
      var cur = document.querySelector('.toc-link.on');
      var href = cur ? (cur.getAttribute('href') || '').slice(1) : '';
      var idx = ids.indexOf(href);
      if (idx < ids.length - 1) {
        var next = document.getElementById(ids[idx + 1]);
        if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      if (e.altKey) return;
      e.preventDefault();
      var ids = Array.from(document.querySelectorAll('.section[id], .sub[id]')).map(function (x) { return x.id; });
      var cur = document.querySelector('.toc-link.on');
      var href = cur ? (cur.getAttribute('href') || '').slice(1) : '';
      var idx = ids.indexOf(href);
      if (idx > 0) {
        var prev = document.getElementById(ids[idx - 1]);
        if (prev) prev.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
  });

  // ----- Scroll: progress bar, back-to-top, TOC -----
  var prog = document.getElementById('prog');
  var topBtn = document.getElementById('top-btn');

  function onScroll() {
    var s = window.scrollY;
    var t = document.body.scrollHeight - window.innerHeight;
    if (prog) prog.style.width = t > 0 ? (s / t) * 100 + '%' : '0%';
    if (topBtn) topBtn.classList.toggle('show', s > 400);

    var cur = '';
    var targets = Array.from(document.querySelectorAll('#hero[id], .section[id], .sub[id]'));
    targets.forEach(function (el) {
      if (!el || !el.id) return;
      if (window.scrollY >= el.offsetTop - 110) cur = el.id;
    });
    document.querySelectorAll('.toc-link').forEach(function (l) {
      var href = l.getAttribute('href') || '';
      l.classList.toggle('on', href === '#' + cur);
    });

    updateProgress(s);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ----- Progress tracking -----
  var progressKey = docPath ? STORAGE_PROGRESS + docPath : null;
  var sectionIds = docPath ? Array.from(document.querySelectorAll('.section[id], .sub[id]')).map(function (x) { return x.id; }).filter(Boolean) : [];

  function loadProgress() {
    if (!progressKey) return {};
    try {
      var raw = localStorage.getItem(progressKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveProgress(seen) {
    if (!progressKey) return;
    try { localStorage.setItem(progressKey, JSON.stringify(seen)); } catch (e) {}
  }

  function updateProgress(scrollY) {
    if (!progressKey || sectionIds.length === 0) return;
    var seen = loadProgress();
    sectionIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < window.innerHeight * 0.6) seen[id] = true;
    });
    saveProgress(seen);
    var num = Object.keys(seen).length;
    var total = sectionIds.length;
    var wrap = document.getElementById('docs-progress-wrap');
    if (wrap) {
      var fill = wrap.querySelector('.doc-progress-fill');
      var text = wrap.querySelector('.doc-progress-text');
      if (fill) fill.style.width = total ? (num / total) * 100 + '%' : '0%';
      if (text) text.textContent = num + ' / ' + total + ' sections';
    }
  }

  if (docPath && sectionIds.length > 0 && document.querySelector('.sidebar')) {
    var tocHead = document.querySelector('.toc-head');
    if (tocHead && !document.getElementById('docs-progress-wrap')) {
      var progWrap = document.createElement('div');
      progWrap.className = 'doc-progress-wrap';
      progWrap.id = 'docs-progress-wrap';
      progWrap.innerHTML =
        '<div class="doc-progress-label">Progress</div>' +
        '<div class="doc-progress-bar"><div class="doc-progress-fill" style="width:0%"></div></div>' +
        '<div class="doc-progress-text">0 / ' + sectionIds.length + ' sections</div>';
      tocHead.parentNode.insertBefore(progWrap, tocHead);
      updateProgress(window.scrollY);
    }
  }

  // ----- Prev/Next doc + progress key -----
  function getDocPath() {
    var pathname = (window.location.pathname || window.location.href || '').replace(/\\/g, '/');
    var parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join('/');
    if (parts.length === 1) return parts[0];
    return '';
  }

  function getAssetPath() {
    var link = document.querySelector('link[href*="docs.css"]');
    if (link && link.href) {
      var path = link.getAttribute('href') || '';
      var m = path.match(/(.*\/)[^/]+$/);
      return m ? m[1] : 'assets/';
    }
    return 'assets/';
  }

  function loadRoadmapsData(cb) {
    if (window.ROADMAPS_DATA && window.ROADMAPS_DATA.roadmaps) {
      cb(window.ROADMAPS_DATA.roadmaps);
      return;
    }
    var base = assetPath.replace(/\/?assets\/?$/, '') || '.';
    var script = document.createElement('script');
    script.src = base + (base.slice(-1) === '/' ? '' : '/') + 'roadmaps-data.js';
    script.onload = function () {
      if (window.ROADMAPS_DATA && window.ROADMAPS_DATA.roadmaps) cb(window.ROADMAPS_DATA.roadmaps);
      else cb([]);
    };
    script.onerror = function () { cb([]); };
    document.head.appendChild(script);
  }

  function currentHref() {
    var pathname = (window.location.pathname || '').replace(/\\/g, '/');
    var parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join('/');
    if (parts.length === 1) return parts[0];
    return '';
  }

  function injectDocNav() {
    var href = currentHref();
    if (!href) return;
    loadRoadmapsData(function (roadmaps) {
      var prev = null, next = null, roadmapName = null;
      roadmaps.forEach(function (r) {
        (r.docs || []).forEach(function (d, i) {
          if (d.href !== href) return;
          roadmapName = r.name;
          if (d.prev) prev = { href: d.prev, title: (r.docs[i - 1] && r.docs[i - 1].title) || 'Previous' };
          if (d.next) next = { href: d.next, title: (r.docs[i + 1] && r.docs[i + 1].title) || 'Next' };
        });
      });
      var content = document.querySelector('.content');
      if (!content) return;
      var nav = document.createElement('nav');
      nav.className = 'doc-nav';
      nav.setAttribute('aria-label', 'Previous and next doc');
      if (prev) {
        var a = document.createElement('a');
        a.href = prev.href;
        a.innerHTML = '<span class="doc-nav-label">Previous</span><span class="doc-nav-title">' + escapeHtml(prev.title) + '</span>';
        nav.appendChild(a);
      }
      var completeKey = STORAGE_COMPLETE + href;
      var completeBtn = document.createElement('button');
      completeBtn.type = 'button';
      completeBtn.className = 'doc-nav-complete-btn';
      completeBtn.style.cssText = 'flex:0 0 auto; padding:10px 16px; font-family:var(--sans); font-size:13px; background:var(--green-bg); border:1px solid var(--green-border); color:var(--green); border-radius:8px; cursor:pointer;';
      try {
        var curState = getDocState();
        var done = localStorage.getItem(completeKey) === '1' || !!curState.done;
        completeBtn.textContent = done ? 'Completed ✓' : 'Mark as complete';
        completeBtn.onclick = function () {
          try {
            var isComplete = localStorage.getItem(completeKey) === '1';
            var next = isComplete ? '0' : '1';
            localStorage.setItem(completeKey, next);
            var st = getDocState();
            st.done = next === '1';
            st.inProgress = !st.done;
            st.lastOpenedAt = new Date().toISOString();
            setDocState(st);
            completeBtn.textContent = isComplete ? 'Mark as complete' : 'Completed ✓';
            pushEvent(isComplete ? 'doc_undone' : 'doc_done', { href: href });
          } catch (e) {}
        };
      } catch (e) { completeBtn.textContent = 'Mark complete'; }
      nav.appendChild(completeBtn);
      if (next) {
        var a = document.createElement('a');
        a.href = next.href;
        a.innerHTML = '<span class="doc-nav-label">Next</span><span class="doc-nav-title">' + escapeHtml(next.title) + '</span>';
        nav.appendChild(a);
      }
      content.appendChild(nav);
    });
  }
  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  injectDocNav();

  function injectQuickActions() {
    var content = document.querySelector('.content');
    if (!content || document.getElementById('doc-quick-actions')) return;
    var state = getDocState();
    var box = document.createElement('section');
    box.id = 'doc-quick-actions';
    box.style.cssText = 'margin-top:26px;border:1px solid var(--border);background:var(--bg2);border-radius:10px;padding:14px;';
    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
      '  <strong style="font-size:14px;">Quick Actions</strong>' +
      '  <div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '    <button type="button" class="check-btn" id="qa-mark-done">Mark done</button>' +
      '    <button type="button" class="check-btn" id="qa-mark-review">Review +2d</button>' +
      '    <button type="button" class="check-btn" id="qa-bookmark">Bookmark</button>' +
      '  </div>' +
      '</div>' +
      '<div style="margin-top:10px;">' +
      '  <label class="tb-day" for="qa-note" style="display:block;margin-bottom:6px;">Doc note</label>' +
      '  <textarea id="qa-note" style="width:100%;min-height:84px;border:1px solid var(--border);background:var(--bg);color:var(--ink);border-radius:8px;padding:10px;font-family:var(--sans);"></textarea>' +
      '  <div style="margin-top:8px;"><button type="button" class="check-btn" id="qa-save-note">Save note</button></div>' +
      '</div>' +
      '<div class="tb-day" id="qa-status" style="margin-top:8px;">Resume key: ' + escapeHtml(getDocId()) + '</div>';

    content.appendChild(box);
    var note = document.getElementById('qa-note');
    if (note) note.value = state.note || '';
    var status = document.getElementById('qa-status');

    function showStatus(text) {
      if (status) status.textContent = text;
    }

    var doneBtn = document.getElementById('qa-mark-done');
    if (doneBtn) {
      doneBtn.onclick = function () {
        var st = getDocState();
        st.done = !st.done;
        st.inProgress = !st.done;
        st.lastOpenedAt = new Date().toISOString();
        setDocState(st);
        try { localStorage.setItem(STORAGE_COMPLETE + currentHref(), st.done ? '1' : '0'); } catch (e) {}
        pushEvent(st.done ? 'doc_done' : 'doc_undone', {});
        showStatus(st.done ? 'Marked done' : 'Marked not done');
      };
    }

    var reviewBtn = document.getElementById('qa-mark-review');
    if (reviewBtn) {
      reviewBtn.onclick = function () {
        var st = getDocState();
        var due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
        st.nextReviewDate = due;
        st.lastReviewedDate = new Date().toISOString().slice(0, 10);
        st.lastOpenedAt = new Date().toISOString();
        setDocState(st);
        pushEvent('doc_review_due', { due: due });
        showStatus('Review due set to ' + due);
      };
    }

    var bookmarkBtn = document.getElementById('qa-bookmark');
    if (bookmarkBtn) {
      bookmarkBtn.onclick = function () {
        var st = getDocState();
        st.bookmarked = !st.bookmarked;
        st.lastOpenedAt = new Date().toISOString();
        setDocState(st);
        pushEvent(st.bookmarked ? 'doc_bookmark' : 'doc_unbookmark', {});
        showStatus(st.bookmarked ? 'Bookmarked' : 'Bookmark removed');
      };
    }

    var saveBtn = document.getElementById('qa-save-note');
    if (saveBtn) {
      saveBtn.onclick = function () {
        var st = getDocState();
        st.note = note ? note.value : '';
        st.lastOpenedAt = new Date().toISOString();
        setDocState(st);
        pushEvent('doc_note_saved', { length: st.note.length });
        showStatus('Note saved');
      };
    }
  }

  injectQuickActions();
  (function markOpenEvent() {
    var st = getDocState();
    st.lastOpenedAt = new Date().toISOString();
    if (!st.done) st.inProgress = true;
    setDocState(st);
    pushEvent('doc_open', {});
  })();

  (function () {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href) return;
      if (/^https?:\/\//i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  })();

  var imgOverlay = null;
  function ensureImgOverlay() {
    if (imgOverlay) return;
    imgOverlay = document.createElement('div');
    imgOverlay.className = 'doc-img-overlay';
    imgOverlay.id = 'doc-img-overlay';
    imgOverlay.innerHTML = '<img class="doc-img-zoom" alt="">';
    document.body.appendChild(imgOverlay);
    imgOverlay.addEventListener('click', function (e) {
      if (e.target === imgOverlay) imgOverlay.classList.remove('is-open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && imgOverlay.classList.contains('is-open')) imgOverlay.classList.remove('is-open');
    });
  }

  (function () {
    var scope = document.querySelector('.content') || document.body;
    if (!scope) return;
    scope.querySelectorAll('img').forEach(function (img) {
      if (img.classList.contains('doc-img-nozoom')) return;
      img.style.cursor = img.style.cursor || 'zoom-in';
      img.addEventListener('click', function () {
        ensureImgOverlay();
        var zoom = imgOverlay.querySelector('img');
        zoom.src = img.currentSrc || img.src;
        zoom.alt = img.alt || '';
        imgOverlay.classList.add('is-open');
      });
    });
  })();

  // ----- Copy code -----
  window.copyCode = function (btn) {
    var block = btn.closest('.code-block');
    if (!block) return;
    var pre = block.querySelector('pre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.innerText).then(function () {
      btn.textContent = 'copied!';
      btn.style.cssText = 'background:var(--green);color:#fff;border-color:var(--green)';
      setTimeout(function () {
        btn.textContent = 'copy';
        btn.style.cssText = '';
      }, 2200);
    });
  };

  window.revealAnswer = function (btn) {
    var r = btn.nextElementSibling;
    if (!r) return;
    var open = r.style.display === 'block';
    r.style.display = open ? 'none' : 'block';
    btn.textContent = open ? 'Reveal Answer' : 'Hide Answer';
    btn.style.cssText = open ? '' : 'background:var(--green);color:#fff;border-color:var(--green)';
  };

  // ----- Run code -----
  function runCode(block, lang) {
    var pre = block.querySelector('pre');
    if (!pre) return;
    var code = pre.innerText;
    var outWrap = block.querySelector('.code-output-wrap');
    if (!outWrap) {
      outWrap = document.createElement('div');
      outWrap.className = 'code-output-wrap';
      block.appendChild(outWrap);
    }
    outWrap.classList.remove('error');
    outWrap.textContent = 'Running…';

    if (lang === 'html' || (block.querySelector('.code-lang') && block.querySelector('.code-lang').textContent.toLowerCase().indexOf('html') !== -1)) {
      try {
        var iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-scripts';
        iframe.style.cssText = 'width:100%;height:200px;border:1px solid var(--border);border-radius:6px;margin-top:8px;background:#fff';
        outWrap.textContent = '';
        outWrap.appendChild(iframe);
        var doc = iframe.contentDocument;
        doc.open();
        doc.write(code);
        doc.close();
      } catch (err) {
        outWrap.textContent = 'Error: ' + err.message;
        outWrap.classList.add('error');
      }
      return;
    }

    try {
      var logLines = [];
      var origLog = console.log;
      console.log = function () {
        logLines.push(Array.prototype.slice.call(arguments).map(String).join(' '));
      };
      var fn = new Function(code);
      var result = fn();
      console.log = origLog;
      var output = logLines.length ? logLines.join('\n') : (result !== undefined ? String(result) : '');
      outWrap.textContent = output || 'Done (no output)';
    } catch (err) {
      outWrap.textContent = 'Error: ' + err.message;
      outWrap.classList.add('error');
    }
  }

  document.querySelectorAll('.code-block').forEach(function (block) {
    var head = block.querySelector('.code-head');
    if (!head) return;
    if (!head.querySelector('.copy-btn')) {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'copy';
      copyBtn.setAttribute('onclick', 'copyCode(this)');
      head.appendChild(copyBtn);
    }
    var langEl = block.querySelector('.code-lang');
    var lang = langEl ? langEl.textContent.toLowerCase() : '';
    var isJs = lang.indexOf('javascript') !== -1 || lang === 'js';
    var isHtml = lang.indexOf('html') !== -1;
    if (isJs || isHtml) {
      if (!head.querySelector('.run-btn')) {
        var runBtn = document.createElement('button');
        runBtn.className = 'run-btn';
        runBtn.textContent = 'Run';
        runBtn.onclick = function () { runCode(block, isHtml ? 'html' : 'js'); };
        head.appendChild(runBtn);
      }
    }
  });

  // ----- Copy link to section (id may be on section/sub, not on h2/h3) -----
  document.querySelectorAll('.section[id], .sub[id]').forEach(function (block) {
    var id = block.id;
    var heading = block.querySelector('h2.sec-title, h3.sub-title');
    if (!heading || heading.querySelector('.copy-link-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-link-btn';
    btn.setAttribute('aria-label', 'Copy link to section');
    btn.innerHTML = '&#128279;';
    btn.onclick = function () {
      var url = window.location.href.split('#')[0] + '#' + id;
      navigator.clipboard.writeText(url).then(function () {
        btn.innerHTML = '&#10003;';
        setTimeout(function () { btn.innerHTML = '&#128279;'; }, 1500);
      });
    };
    heading.parentNode.insertBefore(btn, heading.nextSibling);
  });

  // ----- Scroll reveal -----
  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.style.cssText = 'opacity:1;transform:none;transition:opacity .5s ease,transform .5s ease';
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.05 }
  );
  document.querySelectorAll('.section,.sub,.think-steps,.mental-model,.diagram,.video-wrap').forEach(function (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    obs.observe(el);
  });

  // ----- Mobile sidebar drawer -----
  var sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    var menuToggle = document.querySelector('.menu-toggle');
    if (!menuToggle && topbar) {
      menuToggle = document.createElement('button');
      menuToggle.type = 'button';
      menuToggle.className = 'menu-toggle';
      menuToggle.setAttribute('aria-label', 'Open table of contents');
      menuToggle.innerHTML = '&#9776;';
      topbar.insertBefore(menuToggle, topbar.firstChild);
    }
    var backdrop = document.querySelector('.sidebar-drawer-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-drawer-backdrop';
      document.body.appendChild(backdrop);
    }
    if (menuToggle) {
      menuToggle.addEventListener('click', function () {
        sidebar.classList.toggle('is-open');
        backdrop.classList.toggle('is-open', sidebar.classList.contains('is-open'));
      });
    }
    backdrop.addEventListener('click', function () {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
    });
    document.querySelectorAll('.sidebar .toc-link').forEach(function (link) {
      link.addEventListener('click', function () {
        sidebar.classList.remove('is-open');
        backdrop.classList.remove('is-open');
      });
    });
  }
})();
