(function () {
  "use strict";

  var THEME_KEY = "skillup-index-theme";
  var EVENT_LOG_KEY = "skillup.eventLog";
  var DOC_STATE_PREFIX = "skillup.docState.";
  var TRACK_STATE_PREFIX = "skillup.trackState.";

  var els = {
    tracksCount: document.getElementById("metric-tracks"),
    docsCount: document.getElementById("metric-docs"),
    streakCount: document.getElementById("metric-streak"),
    continueGrid: document.getElementById("continue-grid"),
    trackGrid: document.getElementById("track-grid"),
    todayList: document.getElementById("today-list"),
    recentList: document.getElementById("recent-list"),
    searchInput: document.getElementById("filter-search"),
    trackFilter: document.getElementById("filter-track"),
    statusFilter: document.getElementById("filter-status"),
    difficultyFilter: document.getElementById("filter-difficulty"),
    tagFilter: document.getElementById("filter-tag"),
    sortBy: document.getElementById("filter-sort"),
    resultsInfo: document.getElementById("results-info"),
    paletteOverlay: document.getElementById("cp-overlay"),
    paletteInput: document.getElementById("cp-input"),
    paletteResults: document.getElementById("cp-results"),
    themeBtn: document.getElementById("theme-toggle"),
    paletteBtn: document.getElementById("palette-toggle"),
  };

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; }
  }

  function setTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    if (els.themeBtn) els.themeBtn.textContent = next === "dark" ? "Light" : "Dark";
  }

  function normalize(v) { return String(v || "").toLowerCase().trim(); }
  function toTitle(s) { return String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function dayDiff(isoA, isoB) {
    var a = new Date(isoA + "T00:00:00Z").getTime();
    var b = new Date(isoB + "T00:00:00Z").getTime();
    return Math.round((a - b) / 86400000);
  }

  function loadDocState(docId) {
    try {
      return safeParse(localStorage.getItem(DOC_STATE_PREFIX + docId), {}) || {};
    } catch (e) {
      return {};
    }
  }

  function saveTrackState(trackId, state) {
    try { localStorage.setItem(TRACK_STATE_PREFIX + trackId, JSON.stringify(state)); } catch (e) {}
  }

  function loadEvents() {
    try { return safeParse(localStorage.getItem(EVENT_LOG_KEY), []) || []; } catch (e) { return []; }
  }

  function trackAccent(trackId) {
    var list = ["#b84e24", "#0f7a78", "#8d5b12", "#7b3991", "#a5333f"];
    var n = 0;
    String(trackId || "").split("").forEach(function (ch) { n += ch.charCodeAt(0); });
    return list[n % list.length];
  }

  function flattenDocs(roadmaps) {
    var out = [];
    (roadmaps || []).forEach(function (r) {
      (r.docs || []).forEach(function (d, idx) {
        out.push({
          trackId: d.trackId || r.id,
          trackName: d.trackName || r.name,
          docId: d.docId || ((r.id || "track") + "__" + idx),
          dayNumber: d.dayNumber || null,
          title: d.title || "Untitled",
          href: d.href || "#",
          status: d.status || "todo",
          estimatedMinutes: Number(d.estimatedMinutes || 90),
          difficulty: d.difficulty || "medium",
          tags: Array.isArray(d.tags) ? d.tags : [],
          sourceGeneratedDate: d.sourceGeneratedDate || "",
          lastReviewedDate: d.lastReviewedDate || "",
          nextReviewDate: d.nextReviewDate || "",
          prev: d.prev || null,
          next: d.next || null,
          index: idx
        });
      });
    });
    return out;
  }

  function computedStatus(doc) {
    var state = loadDocState(doc.docId);
    if (state.done) return "done";
    if (state.inProgress) return "in-progress";
    return doc.status || "todo";
  }

  function buildTrackSummary(docs, roadmaps) {
    return (roadmaps || []).map(function (r) {
      var td = docs.filter(function (d) { return d.trackId === r.id; });
      var done = td.filter(function (d) { return computedStatus(d) === "done"; }).length;
      var inProgress = td.filter(function (d) { return computedStatus(d) === "in-progress"; }).length;
      var percent = td.length ? Math.round((done / td.length) * 100) : 0;
      var lastOpened = "";
      td.forEach(function (d) {
        var st = loadDocState(d.docId);
        if (st.lastOpenedAt && (!lastOpened || st.lastOpenedAt > lastOpened)) lastOpened = st.lastOpenedAt;
      });
      saveTrackState(r.id, { progress: percent, done: done, total: td.length, updatedAt: new Date().toISOString() });
      return { id: r.id, name: r.name, path: r.path, total: td.length, done: done, inProgress: inProgress, percent: percent, lastOpened: lastOpened };
    });
  }

  function currentStreak(events) {
    var opens = (events || []).filter(function (e) { return e && (e.type === "doc_open" || e.type === "doc_done"); });
    var uniq = {};
    opens.forEach(function (e) {
      var day = String(e.at || "").slice(0, 10);
      if (day) uniq[day] = true;
    });
    var days = Object.keys(uniq).sort().reverse();
    if (!days.length) return 0;
    var streak = 0;
    var cursor = todayISO();
    if (!uniq[cursor]) {
      var y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (!uniq[y]) return 0;
      cursor = y;
    }
    while (uniq[cursor]) {
      streak += 1;
      cursor = new Date(new Date(cursor + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    }
    return streak;
  }

  function chooseContinueDoc(trackId, docs) {
    var trackDocs = docs.filter(function (d) { return d.trackId === trackId; });
    if (!trackDocs.length) return null;
    var inProg = trackDocs.find(function (d) { return computedStatus(d) === "in-progress"; });
    if (inProg) return inProg;
    var todo = trackDocs.find(function (d) { return computedStatus(d) !== "done"; });
    if (todo) return todo;
    return trackDocs[trackDocs.length - 1];
  }

  function isDueToday(doc) {
    if (!doc.nextReviewDate) return false;
    return dayDiff(doc.nextReviewDate, todayISO()) <= 0;
  }

  function renderContinue(tracks, docs) {
    if (!els.continueGrid) return;
    els.continueGrid.innerHTML = "";
    tracks.forEach(function (t) {
      var d = chooseContinueDoc(t.id, docs);
      if (!d) return;
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        "<h3>" + escapeHtml(t.name) + "</h3>" +
        "<div class='meta'>Next: " + escapeHtml(d.title) + "</div>" +
        "<div class='pill-row'><span class='pill status-" + escapeHtml(computedStatus(d)) + "'>" + escapeHtml(computedStatus(d)) + "</span><span class='pill'>~" + escapeHtml(String(d.estimatedMinutes)) + "m</span></div>" +
        "<div style='margin-top:10px'><a class='link-btn' href='" + escapeAttr(d.href) + "' data-docid='" + escapeAttr(d.docId) + "'>Open</a></div>";
      card.style.borderColor = trackAccent(t.id);
      els.continueGrid.appendChild(card);
    });
    if (!els.continueGrid.children.length) els.continueGrid.innerHTML = "<div class='empty'>No docs found.</div>";
  }

  function renderTracks(tracks) {
    if (!els.trackGrid) return;
    els.trackGrid.innerHTML = "";
    tracks.forEach(function (t) {
      var item = document.createElement("article");
      item.className = "card";
      item.innerHTML =
        "<h3>" + escapeHtml(t.name) + "</h3>" +
        "<div class='meta'>" + t.done + "/" + t.total + " done · " + t.inProgress + " in-progress</div>" +
        "<div class='progress'><span style='width:" + t.percent + "%'></span></div>" +
        "<div class='meta' style='margin-top:8px'>Last opened: " + escapeHtml(t.lastOpened ? t.lastOpened.slice(0, 10) : "—") + "</div>";
      item.style.borderLeft = "4px solid " + trackAccent(t.id);
      els.trackGrid.appendChild(item);
    });
    if (!els.trackGrid.children.length) els.trackGrid.innerHTML = "<div class='empty'>No track data found.</div>";
  }

  function renderTodayQueue(docs) {
    if (!els.todayList) return;
    var list = docs.filter(function (d) { return isDueToday(d) || computedStatus(d) !== "done"; }).slice(0, 10);
    els.todayList.innerHTML = "";
    list.forEach(function (d) {
      var li = document.createElement("div");
      li.className = "list-item";
      li.innerHTML = "<div><div>" + escapeHtml(d.title) + "</div><div class='tiny'>" + escapeHtml(d.trackName) + " · " + escapeHtml(computedStatus(d)) + "</div></div>" +
        "<a class='link-btn' href='" + escapeAttr(d.href) + "' data-docid='" + escapeAttr(d.docId) + "'>Start</a>";
      els.todayList.appendChild(li);
    });
    if (!list.length) els.todayList.innerHTML = "<div class='empty'>No queue items for today.</div>";
  }

  function renderRecent(events) {
    if (!els.recentList) return;
    els.recentList.innerHTML = "";
    var recent = (events || []).slice(0, 10);
    recent.forEach(function (e) {
      var li = document.createElement("div");
      li.className = "list-item";
      li.innerHTML = "<div><div>" + escapeHtml(e.title || e.docTitle || e.docId || "Doc") + "</div><div class='tiny'>" + escapeHtml(e.type || "event") + " · " + escapeHtml(String(e.at || "").replace("T", " ").slice(0, 16)) + "</div></div>";
      els.recentList.appendChild(li);
    });
    if (!recent.length) els.recentList.innerHTML = "<div class='empty'>No activity yet. Open a doc to begin tracking.</div>";
  }

  function getFilterValues() {
    return {
      search: normalize(els.searchInput && els.searchInput.value),
      track: normalize(els.trackFilter && els.trackFilter.value),
      status: normalize(els.statusFilter && els.statusFilter.value),
      difficulty: normalize(els.difficultyFilter && els.difficultyFilter.value),
      tag: normalize(els.tagFilter && els.tagFilter.value),
      sort: normalize(els.sortBy && els.sortBy.value) || "newest"
    };
  }

  function sortDocs(docs, sort) {
    var out = docs.slice();
    if (sort === "shortest") {
      out.sort(function (a, b) { return (a.estimatedMinutes || 0) - (b.estimatedMinutes || 0); });
      return out;
    }
    if (sort === "review") {
      out.sort(function (a, b) {
        var ad = a.nextReviewDate || "9999-12-31";
        var bd = b.nextReviewDate || "9999-12-31";
        return ad.localeCompare(bd);
      });
      return out;
    }
    out.sort(function (a, b) {
      var ad = a.sourceGeneratedDate || "0000-00-00";
      var bd = b.sourceGeneratedDate || "0000-00-00";
      return bd.localeCompare(ad);
    });
    return out;
  }

  function applyFilters(docs) {
    var f = getFilterValues();
    var filtered = docs.filter(function (d) {
      var s = computedStatus(d);
      var hay = normalize(d.title + " " + d.trackName + " " + (d.tags || []).join(" "));
      if (f.search && hay.indexOf(f.search) === -1) return false;
      if (f.track && normalize(d.trackId) !== f.track) return false;
      if (f.status && s !== f.status) return false;
      if (f.difficulty && normalize(d.difficulty) !== f.difficulty) return false;
      if (f.tag && !(d.tags || []).map(normalize).includes(f.tag)) return false;
      return true;
    });
    return sortDocs(filtered, f.sort);
  }

  function renderFilteredCards(docs) {
    if (!els.trackGrid) return;
    var list = applyFilters(docs);
    if (els.resultsInfo) els.resultsInfo.textContent = list.length + " doc(s)";
    if (!list.length) {
      els.trackGrid.innerHTML = "<div class='empty'>No docs match current filters.</div>";
      return;
    }
    els.trackGrid.innerHTML = "";
    list.slice(0, 24).forEach(function (d) {
      var card = document.createElement("article");
      card.className = "card";
      var tags = (d.tags || []).slice(0, 4).map(function (t) { return "<span class='pill'>" + escapeHtml(t) + "</span>"; }).join("");
      card.innerHTML =
        "<h3>" + escapeHtml(d.title) + "</h3>" +
        "<div class='meta'>" + escapeHtml(d.trackName) + " · Day " + escapeHtml(String(d.dayNumber || "—")) + "</div>" +
        "<div class='pill-row'><span class='pill status-" + escapeHtml(computedStatus(d)) + "'>" + escapeHtml(computedStatus(d)) + "</span><span class='pill'>" + escapeHtml(d.difficulty || "medium") + "</span><span class='pill'>~" + escapeHtml(String(d.estimatedMinutes)) + "m</span>" + tags + "</div>" +
        "<div style='margin-top:10px'><a class='link-btn' href='" + escapeAttr(d.href) + "' data-docid='" + escapeAttr(d.docId) + "'>Open</a></div>";
      card.style.borderTop = "4px solid " + trackAccent(d.trackId);
      els.trackGrid.appendChild(card);
    });
  }

  function populateFilterOptions(docs, roadmaps) {
    if (els.trackFilter) {
      (roadmaps || []).forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = r.name;
        els.trackFilter.appendChild(opt);
      });
    }
    if (els.tagFilter) {
      var uniq = {};
      docs.forEach(function (d) { (d.tags || []).forEach(function (t) { if (t) uniq[t] = true; }); });
      Object.keys(uniq).sort().forEach(function (tag) {
        var opt = document.createElement("option");
        opt.value = tag;
        opt.textContent = toTitle(tag);
        els.tagFilter.appendChild(opt);
      });
    }
  }

  function openPalette() {
    if (!els.paletteOverlay) return;
    els.paletteOverlay.classList.add("open");
    els.paletteInput.value = "";
    renderPaletteItems([]);
    els.paletteInput.focus();
  }

  function closePalette() {
    if (!els.paletteOverlay) return;
    els.paletteOverlay.classList.remove("open");
  }

  var paletteDocs = [];
  var paletteIndex = -1;

  function renderPaletteItems(docs) {
    if (!els.paletteResults) return;
    els.paletteResults.innerHTML = "";
    if (!docs.length) {
      els.paletteResults.innerHTML = "<div class='empty'>Type to search docs</div>";
      return;
    }
    docs.forEach(function (d, idx) {
      var a = document.createElement("a");
      a.href = d.href;
      a.className = "cp-item" + (idx === paletteIndex ? " on" : "");
      a.innerHTML = "<div>" + escapeHtml(d.title) + "</div><div class='tiny'>" + escapeHtml(d.trackName) + " · " + escapeHtml(d.href) + "</div>";
      els.paletteResults.appendChild(a);
    });
  }

  function bindPalette(docs) {
    paletteDocs = docs.slice();
    if (!els.paletteInput) return;
    els.paletteInput.addEventListener("input", function () {
      var q = normalize(this.value);
      var list = paletteDocs.filter(function (d) {
        var hay = normalize(d.title + " " + d.trackName + " " + d.href + " " + (d.tags || []).join(" "));
        return !q || hay.indexOf(q) !== -1;
      }).slice(0, 30);
      paletteIndex = list.length ? 0 : -1;
      renderPaletteItems(list);
    });
    els.paletteInput.addEventListener("keydown", function (e) {
      var links = Array.from((els.paletteResults || document).querySelectorAll(".cp-item"));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!links.length) return;
        paletteIndex = (paletteIndex + 1 + links.length) % links.length;
        links.forEach(function (el, i) { el.classList.toggle("on", i === paletteIndex); });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!links.length) return;
        paletteIndex = (paletteIndex - 1 + links.length) % links.length;
        links.forEach(function (el, i) { el.classList.toggle("on", i === paletteIndex); });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (links[paletteIndex]) window.location.href = links[paletteIndex].getAttribute("href");
      } else if (e.key === "Escape") {
        closePalette();
      }
    });
    if (els.paletteOverlay) {
      els.paletteOverlay.addEventListener("click", function (e) {
        if (e.target === els.paletteOverlay) closePalette();
      });
    }
  }

  function bindGlobalHandlers(docs, tracks, events) {
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") closePalette();
      if (e.key === "/" && document.activeElement !== els.searchInput) {
        e.preventDefault();
        if (els.searchInput) els.searchInput.focus();
      }
    });

    [els.searchInput, els.trackFilter, els.statusFilter, els.difficultyFilter, els.tagFilter, els.sortBy].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", function () { renderFilteredCards(docs); });
      el.addEventListener("change", function () { renderFilteredCards(docs); });
    });

    if (els.themeBtn) {
      els.themeBtn.addEventListener("click", function () {
        setTheme(getTheme() === "dark" ? "light" : "dark");
      });
    }
    if (els.paletteBtn) {
      els.paletteBtn.addEventListener("click", function () { openPalette(); });
    }

    document.body.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[data-docid]") : null;
      if (!a) return;
      var docId = a.getAttribute("data-docid");
      var doc = docs.find(function (d) { return d.docId === docId; });
      if (!doc) return;
      var list = loadEvents();
      list.unshift({
        type: "doc_open",
        docId: doc.docId,
        docTitle: doc.title,
        title: doc.title,
        href: doc.href,
        at: new Date().toISOString()
      });
      try { localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(list.slice(0, 300))); } catch (err) {}
      try {
        var st = loadDocState(doc.docId);
        st.lastOpenedAt = new Date().toISOString();
        st.inProgress = !st.done;
        localStorage.setItem(DOC_STATE_PREFIX + doc.docId, JSON.stringify(st));
      } catch (err) {}
      renderRecent(loadEvents());
      renderContinue(tracks, docs);
    });
  }

  function hydrate(roadmaps) {
    var docs = flattenDocs(roadmaps);
    var tracks = buildTrackSummary(docs, roadmaps);
    var events = loadEvents();

    if (els.tracksCount) els.tracksCount.textContent = String(tracks.length);
    if (els.docsCount) els.docsCount.textContent = String(docs.length);
    if (els.streakCount) els.streakCount.textContent = String(currentStreak(events));

    populateFilterOptions(docs, roadmaps);
    renderContinue(tracks, docs);
    renderTracks(tracks);
    renderTodayQueue(sortDocs(docs, "review"));
    renderRecent(events);
    renderFilteredCards(docs);
    bindPalette(docs);
    bindGlobalHandlers(docs, tracks, events);
  }

  function boot() {
    setTheme(getTheme());
    if (window.ROADMAPS_DATA && Array.isArray(window.ROADMAPS_DATA.roadmaps)) {
      hydrate(window.ROADMAPS_DATA.roadmaps);
      return;
    }
    fetch("roadmaps.json")
      .then(function (r) {
        if (!r.ok) throw new Error("roadmaps.json not found");
        return r.json();
      })
      .then(function (data) {
        hydrate((data && data.roadmaps) || []);
      })
      .catch(function (err) {
        var fallback = document.getElementById("fatal-error");
        if (fallback) {
          fallback.classList.remove("hidden");
          fallback.textContent = "Unable to load roadmaps: " + (err.message || "unknown error");
        }
      });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, "");
  }

  boot();
})();
