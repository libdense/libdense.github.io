/* libdense.github.io: tab routing, the embedded viewer, and the docs,
   read live from the GitHub repository and rendered in the plates theme.
   All settings live in config.js (window.LIBDENSE_SITE).

   Routes (location.hash):
     #/viewer                    the viewer
     #/viewer?preset=osrs&...    the viewer with these settings
     #/docs                      the docs home (README.md)
     #/docs/<path>.md            one doc, path relative to the docs folder
     #/docs/<path>.md?s=<slug>   one doc, scrolled to a heading
     #/support                   support and commercial contact */
(function () {
  "use strict";

  const SITE = window.LIBDENSE_SITE;
  const REPO = SITE.repo;
  const DOCS = SITE.docs;
  const TABS = ["viewer", "docs", "support"];
  const TAB_TITLES = { viewer: "libdense / viewer", docs: "libdense / docs", support: "libdense / support" };
  const NARROW_PX = 1000;
  const DOCS_DIR = REPO.docsDir.replace(/\/+$/, "");
  const DOCS_PREFIX = DOCS_DIR + "/";
  const LIST_KEY = "libdense-docs-list:" + REPO.owner + "/" + REPO.name + "@" + REPO.branch + ":" + DOCS_DIR;
  const LINK_BASE = "https://repo.invalid/";
  const NO_LANG_LABEL = ["", "text", "txt", "plain", "plaintext", "none"];

  const $ = (id) => document.getElementById(id);

  /* ---------------- helpers ---------------- */

  function fill(tpl, extra) {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => {
      if (extra && Object.prototype.hasOwnProperty.call(extra, k)) return extra[k];
      if (Object.prototype.hasOwnProperty.call(REPO, k)) return REPO[k];
      return m;
    });
  }
  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  function decodeSafe(s) { try { return decodeURIComponent(s); } catch (err) { return s; } }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function storageGet(store, key) {
    try { const v = store.getItem(key); return v ? JSON.parse(v) : null; } catch (err) { return null; }
  }
  function storageSet(store, key, val) {
    try { store.setItem(key, JSON.stringify(val)); } catch (err) { /* private mode or full: no cache */ }
  }
  function isMd(p) { return /\.(md|markdown)$/i.test(p); }
  function baseName(p) { return p.slice(p.lastIndexOf("/") + 1); }
  function docLabel(p) { return baseName(p).replace(/\.(md|markdown)$/i, ""); }
  function docHref(rel, slug) { return "#/docs/" + encPath(rel) + (slug ? "?s=" + encodeURIComponent(slug) : ""); }
  function narrow() { return window.innerWidth <= NARROW_PX; }
  function tabsHeight() { const t = document.querySelector(".tabs"); return t ? t.getBoundingClientRect().height : 0; }

  /* sticky offsets in the stylesheet follow the real tab bar height */
  function syncTabsHeight() {
    document.documentElement.style.setProperty("--tabs-h", Math.round(tabsHeight()) + "px");
  }
  if ("ResizeObserver" in window) new ResizeObserver(syncTabsHeight).observe(document.querySelector(".tabs"));
  else window.addEventListener("resize", syncTabsHeight);
  syncTabsHeight();

  /* GitHub-style heading slug: lowercase, drop punctuation and symbols, spaces to hyphens. */
  function slugify(text) {
    return text.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
  }

  /* ---------------- routing ---------------- */

  /* Returns null for a hash that is not a route (such as the skip link). */
  function parseRoute() {
    const raw = location.hash;
    if (raw === "" || raw === "#") return { tab: "viewer", rest: "", query: "" };
    let h = raw.slice(1);
    const slashed = h.charAt(0) === "/";
    if (slashed) h = h.slice(1);
    let query = "";
    const qi = h.indexOf("?");
    if (qi >= 0) { query = h.slice(qi + 1); h = h.slice(0, qi); }
    const parts = h.split("/");
    const tab = parts[0];
    if (TABS.indexOf(tab) < 0) return slashed ? { tab: "viewer", rest: "", query: "" } : null;
    return { tab: tab, rest: decodeSafe(parts.slice(1).join("/")), query: query };
  }

  let currentTab = null;
  function showTab(tab) {
    if (tab === currentTab) return;
    const first = currentTab === null;
    currentTab = tab;
    for (const p of document.querySelectorAll("[data-panel]")) p.classList.toggle("active", p.dataset.panel === tab);
    for (const a of document.querySelectorAll("[data-tab]")) {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    document.title = TAB_TITLES[tab];
    if (!first) {
      /* keep the tabs in place when switching while scrolled into a panel */
      const tabs = document.querySelector(".tabs");
      const top = tabs.parentElement.offsetTop + tabs.offsetTop;
      const pinned = tabs.getBoundingClientRect().top <= 1 && window.scrollY > top;
      if (pinned) window.scrollTo(0, top);
    }
  }

  function route() {
    const r = parseRoute();
    if (!r) return;
    showTab(r.tab);
    if (r.tab === "viewer") viewerRoute(r.query);
    else if (r.tab === "docs") docsRoute(r.rest, new URLSearchParams(r.query).get("s") || "");
  }

  /* ---------------- version (from the viewer drop-in) ---------------- */

  fetch(SITE.viewer.versionFile, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      if (!v || !v.version) return;
      for (const e of document.querySelectorAll("[data-ver]")) e.textContent = "v" + v.version;
    })
    .catch(() => { /* keep the version printed in the page */ });

  /* ---------------- viewer ---------------- */

  const frame = $("viewer-frame");
  const openBtn = $("viewer-open");
  const fullBtn = $("viewer-full");
  let viewerLoaded = false, viewerQuery = "";

  function viewerRoute(query) {
    if (!viewerLoaded) {
      viewerLoaded = true; viewerQuery = query;
      frame.src = (frame.dataset.src || SITE.viewer.page) + (query ? "#" + query : "");
      return;
    }
    if (query && query !== viewerQuery) {
      viewerQuery = query;
      const params = {};
      new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
      const target = location.origin && location.origin !== "null" ? location.origin : "*";
      try { frame.contentWindow.postMessage({ libdenseViewer: params }, target); } catch (err) { /* frame not ready */ }
    }
  }
  function standaloneHref() {
    let h = "";
    try { h = frame.contentWindow.location.hash; } catch (err) { /* not same-origin */ }
    if (!h && viewerQuery) h = "#" + viewerQuery;
    return SITE.viewer.page + h;
  }
  for (const ev of ["mouseenter", "focus", "mousedown", "touchstart"]) {
    openBtn.addEventListener(ev, () => { openBtn.href = standaloneHref(); }, { passive: true });
  }
  const fsRequest = frame.requestFullscreen || frame.webkitRequestFullscreen;
  if (!fsRequest) fullBtn.hidden = true;
  fullBtn.addEventListener("click", () => {
    const p = fsRequest && fsRequest.call(frame);
    if (p && p.catch) p.catch(() => window.open(standaloneHref(), "_blank", "noopener"));
  });

  /* ---------------- docs: list ---------------- */

  const docs = { items: null, groups: null, source: "", stale: false, listing: null, cache: new Map(), current: "", token: 0 };
  const listBox = $("docs-list"), listDetails = $("docs-list-box"), filterInput = $("docs-filter");
  const body = $("doc-body");

  async function fetchJson(url) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const LIST_PARSERS = {
    github: (j) => {
      if (!j || !Array.isArray(j.tree)) throw new Error("unexpected response");
      return j.tree.filter((t) => t.type === "blob" && t.path.indexOf(DOCS_PREFIX) === 0 && isMd(t.path))
        .map((t) => t.path.slice(DOCS_PREFIX.length));
    },
    jsdelivr: (j) => {
      if (!j || !Array.isArray(j.files)) throw new Error("unexpected response");
      return j.files.map((f) => String(f.name).replace(/^\//, ""))
        .filter((p) => p.indexOf(DOCS_PREFIX) === 0 && isMd(p)).map((p) => p.slice(DOCS_PREFIX.length));
    }
  };

  async function loadList() {
    const fresh = storageGet(sessionStorage, LIST_KEY);
    if (fresh && Array.isArray(fresh.items) && fresh.items.length && Date.now() - fresh.t < DOCS.listCacheMs) return fresh;
    const errors = [];
    for (const src of SITE.sources.list) {
      try {
        const items = LIST_PARSERS[src.id](await fetchJson(fill(src.url)));
        if (!items.length) throw new Error("no markdown under " + DOCS_PREFIX);
        const rec = { t: Date.now(), src: src.id, items: items };
        storageSet(sessionStorage, LIST_KEY, rec);
        storageSet(localStorage, LIST_KEY, rec);
        return rec;
      } catch (err) { errors.push(src.id + " (" + err.message + ")"); }
    }
    const saved = storageGet(localStorage, LIST_KEY);
    if (saved && Array.isArray(saved.items) && saved.items.length) { saved.stale = true; return saved; }
    throw new Error(errors.join(", "));
  }
  function ensureList() {
    if (!docs.listing) {
      docs.listing = loadList().then((rec) => {
        docs.items = rec.items.slice();
        docs.source = rec.src; docs.stale = !!rec.stale;
        docs.groups = groupDocs(docs.items);
        filterWrapVisible();
        renderList();
        return docs.items;
      }, (err) => { docs.listing = null; throw err; });
    }
    return docs.listing;
  }

  const cmpName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  function homeRank(p) {
    const b = baseName(p).toLowerCase();
    const i = DOCS.home.findIndex((h) => h.toLowerCase() === b);
    return i < 0 ? DOCS.home.length : i;
  }
  function groupDocs(items) {
    const groups = new Map();
    for (const p of items) {
      const i = p.lastIndexOf("/");
      const g = i < 0 ? "" : p.slice(0, i);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    const names = Array.from(groups.keys()).sort((a, b) => (a === "" ? -1 : b === "" ? 1 : cmpName(a, b)));
    return names.map((g) => ({ name: g, items: groups.get(g).sort((a, b) => homeRank(a) - homeRank(b) || cmpName(a, b)) }));
  }
  function homeDoc() {
    for (const h of DOCS.home) {
      const hit = docs.items.find((p) => p.toLowerCase() === h.toLowerCase());
      if (hit) return hit;
    }
    return docs.groups.length ? docs.groups[0].items[0] : "";
  }
  function findDoc(p) {
    if (docs.items.indexOf(p) >= 0) return p;
    const lower = p.toLowerCase();
    return docs.items.find((q) => q.toLowerCase() === lower) || "";
  }
  function filterWrapVisible() {
    $("docs-filter-wrap").hidden = docs.items.length < DOCS.filterAt;
    $("docs-count").textContent = docs.items.length + (docs.items.length === 1 ? " DOCUMENT" : " DOCUMENTS");
    listDetails.querySelector("summary").textContent = "DOCUMENTS (" + docs.items.length + ")";
  }

  function renderList() {
    if (!docs.groups) return;
    const f = filterInput.value.trim().toLowerCase();
    listBox.textContent = "";
    let shown = 0;
    for (const g of docs.groups) {
      const items = f ? g.items.filter((p) => p.toLowerCase().indexOf(f) >= 0) : g.items;
      if (!items.length) continue;
      const grp = el("div", "grp");
      if (g.name) grp.appendChild(el("div", "grp-name", g.name.toUpperCase() + " /"));
      const ul = el("ul");
      for (const p of items) {
        const li = el("li"), a = el("a", "", docLabel(p));
        a.href = docHref(p);
        a.title = DOCS_PREFIX + p;
        if (p === docs.current) a.setAttribute("aria-current", "page");
        li.appendChild(a); ul.appendChild(li); shown++;
      }
      grp.appendChild(ul);
      listBox.appendChild(grp);
    }
    if (!shown) listBox.appendChild(el("p", "muted", "No document matches."));
    if (docs.stale) listBox.appendChild(el("p", "src-note", "GitHub is not answering, so this is the last list this browser saw."));
    else if (docs.source !== "github") listBox.appendChild(el("p", "src-note", "Listed from the jsDelivr mirror while GitHub is busy; it can lag the repository by a few hours."));
  }
  filterInput.addEventListener("input", renderList);
  filterInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const first = listBox.querySelector("a");
    if (first) { location.hash = first.getAttribute("href"); filterInput.blur(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || currentTab !== "docs" || $("docs-filter-wrap").hidden) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    listDetails.open = true;
    filterInput.focus();
  });

  /* both nav boxes start open on wide screens and folded on narrow ones */
  const tocDetails = $("docs-toc-box");
  let wasNarrow = narrow();
  listDetails.open = tocDetails.open = !wasNarrow;
  window.addEventListener("resize", () => {
    const n = narrow();
    if (n !== wasNarrow) { wasNarrow = n; listDetails.open = tocDetails.open = !n; }
  });

  /* ---------------- docs: one document ---------------- */

  async function fetchDoc(repoPath) {
    const hit = docs.cache.get(repoPath);
    if (hit && Date.now() - hit.t < DOCS.docCacheMs) return hit.text;
    let last = null, missing = 0;
    for (const src of SITE.sources.file) {
      try {
        const r = await fetch(fill(src.url, { path: encPath(repoPath) }));
        if (r.status === 404) { missing++; last = new Error("not found"); continue; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        const text = await r.text();
        docs.cache.set(repoPath, { t: Date.now(), text: text });
        return text;
      } catch (err) { last = err; }
    }
    const e = last || new Error("unreachable");
    e.notFound = missing === SITE.sources.file.length;
    throw e;
  }

  async function docsRoute(rest, slug) {
    const token = ++docs.token;
    try { await ensureList(); } catch (err) { if (token === docs.token) showListError(err); return; }
    if (token !== docs.token) return;
    let rel = rest;
    if (rel === "" || rel.charAt(rel.length - 1) === "/") {
      const folder = rel.replace(/\/+$/, "");
      const g = docs.groups.find((x) => x.name.toLowerCase() === folder.toLowerCase());
      rel = folder && g ? g.items[0] : homeDoc();
    } else {
      rel = findDoc(rel) || rel;
    }
    if (rel === docs.current && body.dataset.doc === rel) {
      if (!scrollToSlug(slug)) scrollToArticleTop();
      return;
    }
    await openDoc(rel, slug, token);
  }

  function setDocHeader(rel) {
    const repoPath = DOCS_PREFIX + rel;
    $("doc-path").textContent = repoPath;
    $("doc-github").href = fill(SITE.sources.blob, { path: encPath(repoPath) });
    const raw = $("doc-raw");
    raw.href = fill(SITE.sources.file[0].url, { path: encPath(repoPath) });
    raw.hidden = false;
    const tab = document.querySelector('[data-tab="docs"]');
    if (tab) tab.href = docHref(rel);
  }

  function stateBlock(title, lines, actions) {
    const d = el("div", "doc-state");
    d.appendChild(el("h2", "plate-title", title));
    for (const l of lines) {
      const p = el("p");
      if (typeof l === "string") p.textContent = l; else p.appendChild(l);
      d.appendChild(p);
    }
    if (actions) d.appendChild(actions);
    return d;
  }
  function linkTo(href, text, external) {
    const a = el("a", "", text);
    a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    return a;
  }
  function githubDocsLine() {
    const p = el("span");
    p.appendChild(document.createTextNode("Read them on GitHub: "));
    const tree = fill(SITE.sources.tree, { path: encPath(DOCS_DIR) });
    p.appendChild(linkTo(tree, tree.replace(/^https?:\/\//, ""), true));
    return p;
  }

  function showListError(err) {
    listBox.textContent = "";
    listBox.appendChild(el("p", "muted", "The document list did not load."));
    $("docs-toc-box").hidden = true;
    body.dataset.doc = "";
    body.textContent = "";
    const retry = el("button", "btn", "TRY AGAIN");
    retry.type = "button";
    retry.addEventListener("click", () => { body.textContent = ""; body.appendChild(el("p", "muted", "Trying again...")); route(); });
    const box = el("div"); box.appendChild(retry);
    body.appendChild(stateBlock("THE DOCS DID NOT LOAD", [
      "Neither GitHub nor its jsDelivr mirror answered just now (" + err.message + ").",
      githubDocsLine()
    ], box));
  }

  function showDocError(rel, err) {
    body.dataset.doc = "";
    body.textContent = "";
    $("docs-toc-box").hidden = true;
    const box = el("div");
    const home = linkTo("#/docs", "BACK TO THE DOCS HOME", false); home.className = "btn";
    box.appendChild(home);
    if (err.notFound) {
      body.appendChild(stateBlock("NOT IN THE DOCS", [
        DOCS_PREFIX + rel + " is not on the " + REPO.branch + " branch. It may have been renamed or moved.",
        githubDocsLine()
      ], box));
    } else {
      body.appendChild(stateBlock("THIS PAGE DID NOT LOAD", [
        "GitHub did not return " + DOCS_PREFIX + rel + " just now (" + err.message + ").",
        githubDocsLine()
      ], box));
    }
  }

  async function openDoc(rel, slug, token) {
    docs.current = rel;
    renderList();
    setDocHeader(rel);
    if (narrow()) listDetails.open = false;
    body.dataset.doc = "";
    body.textContent = "";
    body.appendChild(el("p", "muted doc-state", "Loading " + DOCS_PREFIX + rel + " ..."));
    try {
      const md = await fetchDoc(DOCS_PREFIX + rel);
      if (token !== docs.token) return;
      renderDoc(rel, md);
      if (!scrollToSlug(slug)) scrollToArticleTop();
    } catch (err) {
      if (token === docs.token) showDocError(rel, err);
    }
  }

  function renderDoc(rel, md) {
    const repoPath = DOCS_PREFIX + rel;
    let html;
    if (window.marked && window.DOMPurify) {
      html = window.DOMPurify.sanitize(window.marked.parse(md, { gfm: true, async: false }));
      body.innerHTML = html;
    } else {
      /* renderer scripts missing: show the markdown source as is */
      body.textContent = "";
      const pre = el("pre"); pre.appendChild(el("code", "", md));
      body.appendChild(pre);
    }
    body.dataset.doc = rel;
    decorate(body, rel, repoPath);
    buildToc(body, rel);
    const h1 = body.querySelector("h1");
    document.title = (h1 ? h1.dataset.title : docLabel(rel)) + " / libdense docs";
  }

  /* Map a link in a doc to: an in-page heading, another doc, a repository
     file on GitHub, or an external page. */
  function classifyLink(href, fromRepoPath) {
    if (!href) return { kind: "none" };
    if (href.charAt(0) === "#") return { kind: "anchor", slug: decodeSafe(href.slice(1)) };
    let u;
    try { u = new URL(href, LINK_BASE + encPath(fromRepoPath)); } catch (err) { return { kind: "none" }; }
    if (u.origin !== new URL(LINK_BASE).origin) return { kind: "external" };
    const path = decodeSafe(u.pathname.slice(1));
    const slug = u.hash ? decodeSafe(u.hash.slice(1)) : "";
    if (path.indexOf(DOCS_PREFIX) === 0 && isMd(path)) return { kind: "doc", rel: path.slice(DOCS_PREFIX.length), slug: slug };
    if (path === DOCS_DIR || path === DOCS_PREFIX) return { kind: "doc", rel: "", slug: slug };
    const dir = path === "" || path.charAt(path.length - 1) === "/";
    const url = fill(dir ? SITE.sources.tree : SITE.sources.blob, { path: encPath(path.replace(/\/+$/, "")) }) + (u.hash || "");
    return { kind: "repo", path: path, url: url };
  }
  function imageUrl(src, fromRepoPath) {
    const t = classifyLink(src, fromRepoPath);
    if (t.kind === "external" || t.kind === "none" || t.kind === "anchor") return null;
    const path = t.kind === "doc" ? DOCS_PREFIX + t.rel : t.path;
    const ext = (path.split(".").pop() || "").toLowerCase();
    const tpl = SITE.sources.cdnImageExt.indexOf(ext) >= 0 ? SITE.sources.cdnImage : SITE.sources.rawImage;
    return fill(tpl, { path: encPath(path) });
  }

  function decorate(root, rel, repoPath) {
    /* headings: GitHub-compatible slugs, ids prefixed so they cannot clash with the page */
    const seen = new Map(); /* github-slugger rule: x, x-1, x-2, ... */
    for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const text = h.textContent.trim();
      const base = slugify(text) || "section";
      let slug = base;
      while (seen.has(slug)) {
        seen.set(base, seen.get(base) + 1);
        slug = base + "-" + seen.get(base);
      }
      seen.set(slug, 0);
      h.id = "md-" + slug;
      h.dataset.slug = slug;
      h.dataset.title = text;
      if (h.tagName !== "H1") {
        const a = el("a", "h-anchor", "#");
        a.href = docHref(rel, slug);
        a.setAttribute("aria-label", "Link to this section");
        h.appendChild(a);
      }
    }
    for (const a of root.querySelectorAll("a[href]")) {
      if (a.classList.contains("h-anchor")) continue;
      const t = classifyLink(a.getAttribute("href"), repoPath);
      if (t.kind === "external") { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      else if (t.kind === "anchor") a.href = docHref(rel, t.slug);
      else if (t.kind === "doc") a.href = t.rel ? docHref(t.rel, t.slug) : "#/docs";
      else if (t.kind === "repo") { a.href = t.url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
    }
    /* inline code naming a doc that exists, such as `BENCHMARK-SCOPE.md`, becomes a link */
    const dir = rel.indexOf("/") >= 0 ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
    for (const code of root.querySelectorAll("code")) {
      if (code.closest("pre, a")) continue;
      const t = code.textContent.trim();
      if (!/^[\w./-]+\.(md|markdown)$/i.test(t)) continue;
      const tries = [dir + t, t, t.indexOf(DOCS_PREFIX) === 0 ? t.slice(DOCS_PREFIX.length) : ""];
      let hit = "";
      for (const c of tries) {
        if (!c) continue;
        const norm = new URL(c, LINK_BASE).pathname.slice(1);
        hit = findDoc(decodeSafe(norm));
        if (hit) break;
      }
      if (!hit || hit === rel) continue;
      const a = el("a");
      a.href = docHref(hit);
      code.parentNode.insertBefore(a, code);
      a.appendChild(code);
    }
    for (const img of root.querySelectorAll("img[src]")) {
      const u = imageUrl(img.getAttribute("src"), repoPath);
      if (u) img.src = u;
      img.loading = "lazy"; img.decoding = "async";
    }
    for (const code of root.querySelectorAll("pre > code")) {
      const m = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className);
      const lang = m ? m[1].toLowerCase() : "";
      if (NO_LANG_LABEL.indexOf(lang) < 0) code.parentElement.dataset.lang = lang.toUpperCase();
    }
    for (const table of root.querySelectorAll("table")) {
      if (table.parentElement.classList.contains("table-wrap")) continue;
      const wrap = el("div", "table-wrap");
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
    for (const box of root.querySelectorAll('li > input[type="checkbox"], li > p > input[type="checkbox"]')) {
      box.closest("li").classList.add("task");
    }
  }

  function buildToc(root, rel) {
    const list = $("docs-toc");
    list.textContent = "";
    const sel = DOCS.tocLevels.map((l) => "h" + l).join(", ");
    const hs = Array.from(root.querySelectorAll(sel)).slice(0, DOCS.tocMax);
    $("docs-toc-box").hidden = hs.length < 2;
    for (const h of hs) {
      const li = el("li", "l" + h.tagName.charAt(1));
      const a = el("a", "", h.dataset.title);
      a.href = docHref(rel, h.dataset.slug);
      li.appendChild(a);
      list.appendChild(li);
    }
  }

  function scrollToSlug(slug) {
    if (!slug) return false;
    const t = document.getElementById("md-" + slug) || document.getElementById("md-" + slug.toLowerCase()) ||
      document.getElementById("md-" + slugify(slug));
    if (!t) return false;
    t.scrollIntoView({ block: "start" });
    return true;
  }
  function scrollToArticleTop() {
    const art = document.querySelector(".docs-article");
    const top = art.getBoundingClientRect().top + window.scrollY - tabsHeight() - 10;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  }

  /* ---------------- boot ---------------- */

  window.addEventListener("hashchange", route);
  route();
})();
