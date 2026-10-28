(() => {
  "use strict";

  const cfg = window.HGCFBC_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const isConfigured = () =>
    cfg.owner &&
    cfg.repo &&
    !cfg.owner.startsWith("YOUR_") &&
    !cfg.repo.startsWith("YOUR_");
  const apiRoot = () =>
    `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;

  // Token is stored only in this browser's localStorage when the user chooses
  // to save it. It is never embedded in the public source files.
  const TOKEN_STORAGE_KEY = "hgcfbc_github_token";
  function getSavedToken() {
    try { return localStorage.getItem(TOKEN_STORAGE_KEY) || ""; }
    catch (_) { return ""; }
  }
  function getGitHubToken(message) {
    const saved = getSavedToken();
    if (saved) return saved;
    const token = window.prompt(message || "Paste a GitHub token with repository Contents read/write access.");
    return token ? token.trim() : "";
  }
  const categoryPath = category =>
    category === "saxophone" ? cfg.saxophonePath : cfg.guitarPath;
  const esc = s =>
    String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  const formatBytes = n =>
    n < 1024 ? `${n} B` :
    n < 1048576 ? `${(n / 1024).toFixed(1)} KB` :
    `${(n / 1048576).toFixed(2)} MB`;
  const dateText = date => {
    if (!date) return "Repository file";
    const d = new Date(date);
    return Number.isNaN(d.getTime())
      ? "Repository file"
      : d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
  };
  const ext = name => (name.split(".").pop() || "FILE").toUpperCase();

  function toast(message) {
    const old = $(".toast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 4000);
  }

  function showMessage(el, message, type = "info") {
    if (!el) return;
    el.className = `message ${type}`;
    el.textContent = message;
  }

  function hideMessage(el) {
    if (el) el.classList.add("hidden");
  }

  function fileRawUrl(path) {
    const isUserSite =
      String(cfg.repo || "").toLowerCase() ===
      `${cfg.owner}.github.io`.toLowerCase();

    const repoPrefix = isUserSite ? "" : `${encodeURIComponent(cfg.repo)}/`;
    const filePath = path.split("/").map(encodeURIComponent).join("/");
    return `${location.origin}/${repoPrefix}${filePath}`;
  }

  async function listFolder(path) {
    const response = await fetch(
      `${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(cfg.branch || "main")}`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? "GitHub API rate limit or access restriction. Try again shortly."
          : `GitHub listing failed (${response.status}). Check repository name, branch, and folder path.`
      );
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter(item => item.type === "file" && !item.name.startsWith("."))
      .map(item => ({
        name: item.name,
        path: item.path,
        size: item.size || 0,
        sha: item.sha,
        html_url: item.html_url,
        download_url: item.download_url,
        updated_at: item._links?.git ? null : null
      }));
  }

  async function getDirectoryItems(path) {
    const response = await fetch(
      `${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(cfg.branch || "main")}`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(
        `GitHub API error ${response.status}. Check that the repository is public and the folder exists.`
      );
    }
    const data = await response.json();
    return Array.isArray(data)
      ? data
          .filter(x => x.type === "file" && !x.name.startsWith("."))
          .map(x => ({
            name: x.name,
            path: x.path,
            size: x.size || 0,
            sha: x.sha,
            html_url: x.html_url,
            download_url: x.download_url
          }))
      : [];
  }

  function actionButton(label, icon, cls = "") {
    return `<button class="icon-action ${cls}" type="button" title="${esc(label)}" aria-label="${esc(label)}">${icon}</button>`;
  }

  /* ---------- YouTube reference videos ---------- */
  // Shared references live in one JSON file in the repository (REF_FILE).
  // Reading is public (served by GitHub Pages). Writing uses the same
  // "paste a GitHub token for this request" flow as upload/delete, so no
  // credential is ever stored in this public script.
  const REF_FILE = "song-references.json";
  const refs = { map: {}, promise: null, error: "" };

  const utf8ToB64 = str => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };
  const b64ToUtf8 = b64 => {
    const bin = atob(String(b64).replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  };

  function parseStartSeconds(value) {
    if (!value) return 0;
    if (/^\d+$/.test(value)) return Number(value);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
    if (!m || !(m[1] || m[2] || m[3])) return 0;
    return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  }

  // Returns { id, start } for a valid YouTube link, otherwise null.
  function parseYouTube(raw) {
    let text = String(raw || "").trim();
    if (!text) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
    let u;
    try { u = new URL(text); } catch (_) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
    const parts = u.pathname.split("/").filter(Boolean);
    let id = "";
    if (host === "youtu.be") {
      id = parts[0] || "";
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (parts[0] === "watch") id = u.searchParams.get("v") || "";
      else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1] || "";
    } else {
      return null;
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const start = parseStartSeconds(u.searchParams.get("t") || u.searchParams.get("start"));
    return { id, start };
  }

  const youTubeEmbedUrl = p =>
    `https://www.youtube-nocookie.com/embed/${p.id}?rel=0&playsinline=1${p.start ? `&start=${p.start}` : ""}`;
  const youTubeWatchUrl = p =>
    `https://www.youtube.com/watch?v=${p.id}${p.start ? `&t=${p.start}s` : ""}`;

  function normalizeRefs(data) {
    const out = {};
    const src = data && typeof data === "object" && data.references && typeof data.references === "object" && !Array.isArray(data.references)
      ? data.references : {};
    Object.keys(src).forEach(key => {
      const entry = src[key];
      const url = typeof entry === "string" ? entry : entry && entry.url;
      if (typeof url === "string" && url) out[key] = { url, updated: (entry && entry.updated) || "" };
    });
    return out;
  }

  function loadReferences(force = false) {
    if (refs.promise && !force) return refs.promise;
    const attempt = (async () => {
      try {
        const r = await fetch(`${fileRawUrl(REF_FILE)}?v=${Date.now()}`, { cache: "no-store" });
        if (r.ok) {
          refs.map = normalizeRefs(await r.json());
          refs.error = "";
        } else if (r.status === 404) {
          refs.map = {};
          refs.error = "";
        } else {
          throw new Error(`HTTP ${r.status}`);
        }
      } catch (err) {
        refs.error = "Could not load saved references. The chord sheet still works.";
        refs.promise = null; // retry next time
        console.warn("Reference file load problem:", err);
      }
      return refs.map;
    })();
    refs.promise = attempt;
    return attempt;
  }

  // Adds, changes (url = string) or removes (url = null) one reference.
  // Re-reads the latest file from GitHub first so other people's references
  // are never overwritten, and only ever touches REF_FILE.
  async function saveReference(path, url, token) {
    const endpoint = `${apiRoot()}/contents/${REF_FILE}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const branch = cfg.branch || "main";

    for (let attempt = 0; attempt < 3; attempt++) {
      let sha;
      let data = { version: 1, references: {} };
      const read = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers });
      if (read.status !== 404) {
        if (!read.ok) {
          const d = await read.json().catch(() => ({}));
          throw new Error(d.message || `Could not read ${REF_FILE} (${read.status}).`);
        }
        const file = await read.json();
        sha = file.sha;
        try {
          data = JSON.parse(b64ToUtf8(file.content || ""));
        } catch (_) {
          throw new Error(`${REF_FILE} in the repository is not valid JSON, so nothing was changed. Fix or delete that file on GitHub and try again.`);
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) data = { version: 1, references: {} };
        if (!data.references || typeof data.references !== "object" || Array.isArray(data.references)) data.references = {};
      }

      if (url) data.references[path] = { url, updated: new Date().toISOString() };
      else delete data.references[path];

      const body = {
        message: `${url ? "Set" : "Remove"} YouTube reference for ${path.split("/").pop()}`,
        content: utf8ToB64(`${JSON.stringify(data, null, 2)}\n`),
        branch
      };
      if (sha) body.sha = sha;

      const write = await fetch(endpoint, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (write.ok) {
        refs.map = normalizeRefs(data);
        refs.promise = Promise.resolve(refs.map);
        refs.error = "";
        return;
      }
      // Someone else saved at the same moment: re-read and try again.
      if ((write.status === 409 || write.status === 422) && attempt < 2) continue;
      const d = await write.json().catch(() => ({}));
      throw new Error(d.message || `GitHub save failed (${write.status}).`);
    }
  }

  // Asks YouTube whether the video can be embedded (401 = embedding disabled,
  // 404 = missing/private). Network or CORS problems are ignored.
  async function checkEmbeddable(p) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${p.id}`)}`);
      if (r.status === 401) return "blocked";
      if (r.status === 404) return "missing";
    } catch (_) { /* unknown: leave the player in place */ }
    return "ok";
  }

  const viewerTabs = [];
  let activeViewerId = null;
  let viewerRenderToken = 0;
  let listenRenderToken = 0;

  function paintListen(panel, tab) {
    const entry = refs.map[tab.path];
    const parsed = entry ? parseYouTube(entry.url) : null;
    const badSaved = Boolean(entry && !parsed);
    panel.dataset.videoId = parsed ? parsed.id : "";

    panel.innerHTML = `
      <div class="listen-head">
        <div class="viewer-heading">
          <span class="viewer-dot"></span>
          <strong>LISTEN</strong>
          <small>REFERENCE VIDEO</small>
        </div>
        <button type="button" class="listen-hide" aria-label="Hide video">×</button>
      </div>
      <div class="listen-body">
        <p class="listen-song">${esc(tab.name)}</p>
        ${refs.error ? `<div class="message error">${esc(refs.error)}</div>` : ""}
        ${parsed ? `
          <div class="listen-frame">
            <iframe src="${esc(youTubeEmbedUrl(parsed))}" title="YouTube reference for ${esc(tab.name)}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
          </div>
          <div class="listen-status message hidden" data-listen-status role="status"></div>
          <div class="listen-actions">
            <a class="button button-quiet" href="${esc(youTubeWatchUrl(parsed))}" target="_blank" rel="noopener noreferrer">Open in YouTube ↗</a>
            <button type="button" class="button button-quiet" data-ref-edit>Change reference</button>
            <button type="button" class="button button-quiet" data-ref-remove>Remove</button>
          </div>
          <p class="listen-note">If the player says the video is unavailable, the owner may have disabled embedding. Use “Open in YouTube” instead.</p>
        ` : `
          <div class="listen-empty">
            <strong>${badSaved ? "The saved link is not a valid YouTube link" : "No reference video yet"}</strong>
            <p>The chord sheet above works as usual. Paste a YouTube link below to add a reference for this song.</p>
          </div>
        `}
        <form class="listen-form ${parsed ? "hidden" : ""}" data-ref-form novalidate>
          <label class="field-label" for="refInput">YouTube link</label>
          <div class="listen-form-row">
            <input id="refInput" class="field-control" type="text" inputmode="url" autocomplete="off"
              placeholder="https://www.youtube.com/watch?v=…" value="${esc(badSaved ? entry.url : "")}">
            <button type="submit" class="button button-primary">Save Reference</button>
            ${parsed ? `<button type="button" class="button button-quiet" data-ref-cancel>Cancel</button>` : ""}
          </div>
          <p class="listen-note">Saving updates the shared list for every musician and needs the team's GitHub access token.</p>
          <div class="message hidden" data-ref-message role="status"></div>
        </form>
      </div>`;

    if (parsed) {
      const id = parsed.id;
      checkEmbeddable(parsed).then(state => {
        if (state === "ok" || panel.dataset.videoId !== id) return;
        const frame = panel.querySelector(".listen-frame");
        const status = panel.querySelector("[data-listen-status]");
        if (frame) frame.remove();
        showMessage(status, state === "blocked"
          ? "The video owner has disabled embedding for this video. Use “Open in YouTube” to watch it in a new tab."
          : "This video is unavailable or private. Check the link, or change the reference.", "error");
      });
    }
  }

  async function renderListenPanel(shell, tab) {
    const panel = shell.querySelector(".listen-panel");
    if (!panel) return;
    const token = ++listenRenderToken;
    if (!tab || !tab.listen) {
      panel.innerHTML = "";
      panel.dataset.videoId = "";
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    panel.dataset.videoId = "";
    panel.innerHTML = `<div class="listen-body"><p class="listen-song">Loading reference…</p></div>`;
    await loadReferences();
    if (token !== listenRenderToken || activeViewerId !== tab.id) return;
    paintListen(panel, tab);
  }

  function clearListenPanel(shell) {
    listenRenderToken++;
    const panel = shell.querySelector(".listen-panel");
    if (panel) {
      panel.innerHTML = "";
      panel.dataset.videoId = "";
      panel.classList.add("hidden");
    }
  }

  async function handleReferenceSubmit(shell, form) {
    const tab = viewerTabs.find(t => t.id === activeViewerId);
    if (!tab) return;
    const msg = form.querySelector("[data-ref-message]");
    const parsed = parseYouTube(form.querySelector("input").value);
    if (!parsed) {
      showMessage(msg, "That doesn't look like a YouTube link. Use a youtube.com/watch, youtu.be or youtube.com/shorts link.", "error");
      return;
    }
    if (!isConfigured()) {
      showMessage(msg, "Repository is not configured yet. Edit assets/config.js first.", "error");
      return;
    }
    const token = getGitHubToken("Paste a GitHub token with Contents: Read and write access to this repository.");
    if (!token) {
      toast("Save cancelled. No token entered.");
      return;
    }
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      await saveReference(tab.path, youTubeWatchUrl(parsed), token);
      toast("Reference saved for everyone. Other devices may need a minute to see it.");
      if (activeViewerId === tab.id) paintListen(shell.querySelector(".listen-panel"), tab);
    } catch (err) {
      showMessage(msg, `Could not save: ${err.message}`, "error");
      submit.disabled = false;
      submit.textContent = "Save Reference";
    }
  }

  async function handleReferenceRemove(shell) {
    const tab = viewerTabs.find(t => t.id === activeViewerId);
    if (!tab) return;
    if (!window.confirm(`Remove the YouTube reference for "${tab.name}"?\n\nThe chord sheet itself is not affected.`)) return;
    const token = getGitHubToken("Paste a GitHub token with Contents: Read and write access to this repository.");
    if (!token) {
      toast("Remove cancelled. No token entered.");
      return;
    }
    try {
      await saveReference(tab.path, null, token);
      toast("Reference removed.");
      if (activeViewerId === tab.id) paintListen(shell.querySelector(".listen-panel"), tab);
    } catch (err) {
      toast(`Remove failed: ${err.message}`);
    }
  }

  function ensureViewer() {
    let shell = $("#chordViewer");
    if (shell) return shell;

    shell = document.createElement("section");
    shell.id = "chordViewer";
    shell.className = "chord-viewer hidden";
    shell.setAttribute("aria-label", "Chord sheet viewer");
    shell.innerHTML = `
      <div class="viewer-top">
        <div class="viewer-heading">
          <span class="viewer-dot"></span>
          <strong>CHORD VIEWER</strong>
          <small>OPEN SHEETS</small>
        </div>
        <button type="button" class="viewer-close" aria-label="Close viewer">×</button>
      </div>
      <div class="viewer-tabs" role="tablist" aria-label="Open chord sheets"></div>
      <div class="viewer-content">
        <div class="viewer-welcome">
          <span>♫</span>
          <strong>Your chord sheets will appear here</strong>
          <p>Open one or more files from the library.</p>
        </div>
      </div>
      <div class="listen-panel hidden" aria-label="YouTube reference video"></div>`;

    const listPanel = $(".library-panel");
    if (listPanel) listPanel.insertAdjacentElement("afterend", shell);
    else document.querySelector("main")?.appendChild(shell);

    shell.addEventListener("click", e => {
      const close = e.target.closest(".viewer-close");
      if (close) {
        shell.classList.add("hidden");
        clearListenPanel(shell); // stop any playing video when the viewer closes
        return;
      }
      const closeTab = e.target.closest("[data-viewer-close]");
      if (closeTab) {
        e.stopPropagation();
        removeViewerTab(closeTab.dataset.viewerClose);
        return;
      }
      const tab = e.target.closest("[data-viewer-tab]");
      if (tab) activateViewerTab(tab.dataset.viewerTab);
    });

    const listenPanel = shell.querySelector(".listen-panel");
    listenPanel.addEventListener("click", e => {
      const tab = viewerTabs.find(t => t.id === activeViewerId);
      if (e.target.closest(".listen-hide")) {
        if (tab) tab.listen = false;
        clearListenPanel(shell);
        return;
      }
      if (e.target.closest("[data-ref-edit]")) {
        listenPanel.querySelector("[data-ref-form]")?.classList.remove("hidden");
        listenPanel.querySelector("#refInput")?.focus();
        return;
      }
      if (e.target.closest("[data-ref-cancel]")) {
        listenPanel.querySelector("[data-ref-form]")?.classList.add("hidden");
        return;
      }
      if (e.target.closest("[data-ref-remove]")) handleReferenceRemove(shell);
    });
    listenPanel.addEventListener("submit", e => {
      const form = e.target.closest("[data-ref-form]");
      if (!form) return;
      e.preventDefault();
      handleReferenceSubmit(shell, form);
    });

    return shell;
  }

  function openViewer(path, name, options = {}) {
    const shell = ensureViewer();
    let tab = viewerTabs.find(t => t.path === path);
    if (!tab) {
      tab = {
        id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path,
        name,
        listen: false
      };
      viewerTabs.push(tab);
    }
    if (options.listen) tab.listen = true;
    shell.classList.remove("hidden");
    activateViewerTab(tab.id);
    shell.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function activateViewerTab(id) {
    const shell = ensureViewer();
    const tab = viewerTabs.find(t => t.id === id);
    if (!tab) return;

    const thisRenderToken = ++viewerRenderToken;
    activeViewerId = id;

    shell.querySelector(".viewer-tabs").innerHTML = viewerTabs.map(t => `
      <button type="button" role="tab"
        aria-selected="${t.id === id}"
        class="viewer-tab ${t.id === id ? "active" : ""}"
        data-viewer-tab="${esc(t.id)}">
        <span>♫</span>
        <span class="viewer-tab-name">${esc(t.name)}</span>
        <span class="viewer-tab-close" data-viewer-close="${esc(t.id)}"
          aria-label="Close ${esc(t.name)}">×</span>
      </button>`).join("");

    // Video player (if this song's Listen is on) sits directly below the sheet.
    renderListenPanel(shell, tab);

    const content = shell.querySelector(".viewer-content");
    const url = fileRawUrl(tab.path);
    const lower = tab.name.toLowerCase();

    if (/\.(jpg|jpeg|png)$/i.test(lower)) {
      content.innerHTML = `<div class="viewer-image-wrap"><img src="${esc(url)}" alt="${esc(tab.name)}" class="viewer-image"></div>`;
      return;
    }

    if (!lower.endsWith(".pdf")) {
      content.innerHTML = `<div class="viewer-fallback"><strong>Preview unavailable</strong><p>This file type cannot be previewed here.</p></div>`;
      return;
    }

    if (!window.pdfjsLib) {
      content.innerHTML = `<div class="viewer-fallback"><strong>PDF viewer unavailable</strong><p>PDF.js did not load. Check the script tag in this page, then reload.</p></div>`;
      return;
    }

    content.innerHTML = `
      <div class="pdf-toolbar">
        <button type="button" data-zoom-out aria-label="Zoom out">−</button>
        <span data-zoom-label>100%</span>
        <button type="button" data-zoom-in aria-label="Zoom in">+</button>
        <button type="button" data-fit-width>Fit width</button>
      </div>
      <div class="pdf-scroll-area"><div class="pdf-pages"></div></div>`;

    const pages = content.querySelector(".pdf-pages");
    const scrollArea = content.querySelector(".pdf-scroll-area");
    const zoomLabel = content.querySelector("[data-zoom-label]");

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    let pdf;
    try {
      pdf = await window.pdfjsLib.getDocument({ url }).promise;
    } catch (error) {
      if (thisRenderToken !== viewerRenderToken) return;
      pages.innerHTML = `<p class="pdf-error">Could not load this PDF. Check the file URL, connection, and GitHub Pages deployment.</p>`;
      console.error("PDF loading error:", error);
      return;
    }

    if (thisRenderToken !== viewerRenderToken) return;

    let scale = 1;
    let renderVersion = 0;
    let activeRenderTasks = [];
    let resizeTimer = null;

    async function renderPages() {
      const renderId = ++renderVersion;
      activeRenderTasks.forEach(task => {
        try { task.cancel(); } catch (_) {}
      });
      activeRenderTasks = [];
      pages.innerHTML = "";
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (renderId !== renderVersion || thisRenderToken !== viewerRenderToken) return;

        let page;
        try {
          page = await pdf.getPage(pageNumber);
        } catch (error) {
          if (renderId === renderVersion) console.error("PDF page error:", error);
          return;
        }

        if (renderId !== renderVersion || thisRenderToken !== viewerRenderToken) return;

        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.className = "pdf-page";

        const wrapper = document.createElement("div");
        wrapper.className = "pdf-page-wrapper";
        wrapper.appendChild(canvas);
        pages.appendChild(wrapper);

        const task = page.render({
          canvasContext: context,
          viewport,
          transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null
        });
        activeRenderTasks.push(task);

        try {
          await task.promise;
        } catch (error) {
          if (error?.name !== "RenderingCancelledException") console.error("PDF render error:", error);
          return;
        }
      }
    }

    content.querySelector("[data-zoom-in]").addEventListener("click", () => {
      scale = Math.min(scale + 0.2, 3);
      renderPages();
    });
    content.querySelector("[data-zoom-out]").addEventListener("click", () => {
      scale = Math.max(scale - 0.2, 0.5);
      renderPages();
    });
    content.querySelector("[data-fit-width]").addEventListener("click", async () => {
      try {
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, scrollArea.clientWidth - 24);
        scale = Math.max(0.5, Math.min(3, availableWidth / baseViewport.width));
        renderPages();
      } catch (error) {
        console.error("Could not fit PDF to width:", error);
      }
    });

    let initialDistance = 0;
    let initialScale = 1;
    let pinchActive = false;
    const getTouchDistance = touches => Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );

    scrollArea.addEventListener("touchstart", event => {
      if (event.touches.length === 2) {
        initialDistance = getTouchDistance(event.touches);
        initialScale = scale;
        pinchActive = true;
      }
    }, { passive: true });
    scrollArea.addEventListener("touchmove", event => {
      if (event.touches.length !== 2 || !pinchActive || !initialDistance) return;
      event.preventDefault();
      scale = Math.max(0.5, Math.min(3, initialScale * getTouchDistance(event.touches) / initialDistance));
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }, { passive: false });
    scrollArea.addEventListener("touchend", event => {
      if (event.touches.length < 2 && pinchActive) {
        pinchActive = false;
        initialDistance = 0;
        renderPages();
      }
    }, { passive: true });
    scrollArea.addEventListener("touchcancel", () => {
      if (pinchActive) {
        pinchActive = false;
        initialDistance = 0;
        renderPages();
      }
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (thisRenderToken !== viewerRenderToken) return;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (thisRenderToken === viewerRenderToken) renderPages();
      }, 180);
    }, { passive: true });

    await renderPages();
  }

  function removeViewerTab(id) {
    const index = viewerTabs.findIndex(t => t.id === id);
    if (index < 0) return;
    viewerTabs.splice(index, 1);
    const shell = ensureViewer();

    if (!viewerTabs.length) {
      viewerRenderToken++;
      activeViewerId = null;
      clearListenPanel(shell);
      shell.querySelector(".viewer-tabs").innerHTML = "";
      shell.querySelector(".viewer-content").innerHTML = `
        <div class="viewer-welcome"><span>♫</span><strong>Your chord sheets will appear here</strong><p>Open one or more files from the library.</p></div>`;
      return;
    }
    if (activeViewerId === id) activateViewerTab(viewerTabs[Math.max(0, index - 1)].id);
    else activateViewerTab(activeViewerId || viewerTabs[0].id);
  }

  async function initLibrary() {
    const category = document.body.dataset.category;
    const list = $("#fileList");
    const count = $("#libraryCount");
    const message = $("#libraryMessage");
    const empty = $("#emptyState");
    if (!list || !count) return;

    let allFiles = [];
    let view = "list";

    const render = () => {
      const query = ($("#searchInput")?.value || "").trim().toLowerCase();
      const sort = $("#sortSelect")?.value || "name-asc";
      const rows = allFiles
        .filter(f => f.name.toLowerCase().includes(query))
        .sort((a, b) =>
          sort === "name-desc" ? b.name.localeCompare(a.name) :
          sort === "newest" ? b.path.localeCompare(a.path) :
          sort === "oldest" ? a.path.localeCompare(b.path) :
          a.name.localeCompare(b.name)
        );

      count.textContent = `${rows.length} ${rows.length === 1 ? "file" : "files"} · ${category === "saxophone" ? "Saxophone" : "Guitar / Keyboard"}`;
      list.classList.toggle("grid-view", view === "grid");

      list.innerHTML = rows.map(f => {
        const isPdf = f.name.toLowerCase().endsWith(".pdf");
        const downloadUrl = fileRawUrl(f.path);
        return `
          <article class="file-row" data-path="${esc(f.path)}">
            <div class="file-icon">${isPdf ? "PDF" : esc(ext(f.name).slice(0, 4))}</div>
            <div class="file-info">
              <button class="file-name file-open-link viewer-open" type="button"
                data-open-path="${esc(f.path)}" data-open-name="${esc(f.name)}"
                title="Preview ${esc(f.name)}">${esc(f.name)}</button>
              <div class="file-meta">${formatBytes(f.size)} · ${esc(category === "saxophone" ? "Saxophone" : "Guitar / Keyboard")}</div>
            </div>
            <div class="file-actions">
              <button class="icon-action viewer-open" type="button"
                data-open-path="${esc(f.path)}" data-open-name="${esc(f.name)}"
                title="Preview in this page" aria-label="Preview in this page">↗</button>
              <a class="icon-action" href="${esc(downloadUrl)}" download="${esc(f.name)}"
                title="Download" aria-label="Download">↓</a>
              <button class="icon-action viewer-open listen-btn" type="button"
                data-open-path="${esc(f.path)}" data-open-name="${esc(f.name)}" data-listen="1"
                title="Listen with YouTube reference" aria-label="Listen to ${esc(f.name)}">♪</button>
              <button class="icon-action delete" type="button" data-delete="${esc(f.path)}"
                data-name="${esc(f.name)}" title="Delete file" aria-label="Delete ${esc(f.name)}">×</button>
            </div>
          </article>`;
      }).join("");

      if (empty) empty.classList.toggle("hidden", rows.length !== 0);
    };

    async function load() {
      hideMessage(message);
      count.textContent = "Loading files…";
      list.innerHTML = "";
      if (!isConfigured()) {
        showMessage(message, "Set your GitHub username and repository name in assets/config.js before using the library.", "error");
        count.textContent = "Repository not configured";
        empty?.classList.add("hidden");
        return;
      }
      try {
        allFiles = await getDirectoryItems(categoryPath(category));
        render();
      } catch (e) {
        showMessage(message, e.message, "error");
        count.textContent = "Could not load files";
        empty?.classList.add("hidden");
      }
    }

    $("#searchInput")?.addEventListener("input", render);
    $("#sortSelect")?.addEventListener("change", render);

    // Robust view toggle: supports buttons using data-view="grid"/"list" or common IDs.
    const viewButtons = $$(".view-btn");
    viewButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        let selectedView = btn.dataset.view;
        if (!selectedView && /grid/i.test(btn.id || btn.getAttribute("aria-label") || btn.title || "")) {
          selectedView = "grid";
        }
        if (!selectedView && /list/i.test(btn.id || btn.getAttribute("aria-label") || btn.title || "")) {
          selectedView = "list";
        }
        if (selectedView !== "grid" && selectedView !== "list") {
          console.warn("View button needs data-view='grid' or data-view='list':", btn);
          return;
        }

        view = selectedView;
        viewButtons.forEach(button => {
          const buttonView = button.dataset.view ||
            (/grid/i.test(button.id || button.getAttribute("aria-label") || button.title || "") ? "grid" :
             /list/i.test(button.id || button.getAttribute("aria-label") || button.title || "") ? "list" : "");
          const active = buttonView === view;
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        render();
      });
    });

    $("#refreshBtn")?.addEventListener("click", load);

    list.addEventListener("click", async e => {
      const openBtn = e.target.closest("[data-open-path]");
      if (openBtn) {
        e.preventDefault();
        openViewer(openBtn.dataset.openPath, openBtn.dataset.openName, {
          listen: openBtn.hasAttribute("data-listen")
        });
        return;
      }

      const btn = e.target.closest("[data-delete]");
      if (!btn) return;
      const path = btn.dataset.delete;
      const name = btn.dataset.name;
      const confirmed = window.confirm(`Delete "${name}" from the shared library?\n\nThis removes the file from the GitHub repository. This cannot be undone from this page.`);
      if (!confirmed) return;

      const token = getGitHubToken("Paste a GitHub token with Contents: Read and write access to this repository.");
      if (!token) {
        toast("Delete cancelled. No token entered.");
        return;
      }

      btn.disabled = true;
      try {
        const item = await getAuthenticatedContent(path, token);
        const result = await fetch(
          `${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2022-11-28",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: `Delete chord sheet ${name}`, sha: item.sha, branch: cfg.branch || "main" })
          }
        );
        if (!result.ok) {
          const detail = await result.json().catch(() => ({}));
          throw new Error(detail.message || `GitHub delete failed (${result.status}).`);
        }
        toast(`Deleted ${name}.`);
        await load();
      } catch (err) {
        toast(`Delete failed: ${err.message}`);
        btn.disabled = false;
      }
    });

    await load();
  }

  async function getAuthenticatedContent(path, token) {
    const r = await fetch(
      `${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(cfg.branch || "main")}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || `Could not read repository file (${r.status}).`);
    }
    return r.json();
  }

  function initUpload() {
    const drop = $("#dropZone");
    const input = $("#fileInput");
    const browse = $("#browseBtn");
    const selected = $("#selectedFile");
    const category = $("#categorySelect");
    const preview = $("#destinationPreview");
    const review = $("#reviewUploadBtn");
    const clear = $("#clearSelectionBtn");
    const msg = $("#uploadMessage");
    const modal = $("#confirmModal");
    if (!drop || !input) return;

    let file = null;
    const pathFor = () => categoryPath(category.value);
    const updatePath = () => {
      if (preview) preview.innerHTML = `<span>↳</span><code>${esc(pathFor())}/</code>`;
    };

    const choose = f => {
      hideMessage(msg);
      if (!f) return;
      const allowed = /\.(pdf|jpe?g|png)$/i.test(f.name);
      if (!allowed) {
        file = null;
        selected?.classList.add("hidden");
        if (review) review.disabled = true;
        showMessage(msg, "Unsupported file type. Please choose a PDF, JPG, or PNG.", "error");
        return;
      }
      if (f.size > (cfg.maxFileBytes || 10485760)) {
        file = null;
        selected?.classList.add("hidden");
        if (review) review.disabled = true;
        showMessage(msg, `File is too large (${formatBytes(f.size)}). Maximum size is 10 MB.`, "error");
        return;
      }
      file = f;
      selected?.classList.remove("hidden");
      if (selected) {
        selected.innerHTML = `<span class="file-icon">${esc(ext(f.name).slice(0, 4))}</span><span class="selected-name">${esc(f.name)}</span><span class="selected-size">${formatBytes(f.size)}</span><button type="button" class="remove-file" aria-label="Remove selected file">×</button>`;
      }
      if (review) review.disabled = false;
    };

    drop.addEventListener("click", e => {
      if (e.target.closest("#browseBtn")) return;
      input.click();
    });
    drop.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    browse?.addEventListener("click", e => {
      e.stopPropagation();
      input.click();
    });
    input.addEventListener("change", () => {
      choose(input.files?.[0]);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault();
      drop.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault();
      drop.classList.remove("dragging");
    }));
    drop.addEventListener("drop", e => choose(e.dataTransfer?.files?.[0]));
    category?.addEventListener("change", updatePath);

    selected?.addEventListener("click", e => {
      if (e.target.closest(".remove-file")) {
        file = null;
        selected.classList.add("hidden");
        if (review) review.disabled = true;
        hideMessage(msg);
      }
    });
    clear?.addEventListener("click", () => {
      file = null;
      input.value = "";
      selected?.classList.add("hidden");
      if (review) review.disabled = true;
      hideMessage(msg);
    });
    review?.addEventListener("click", () => {
      if (!file || !modal) return;
      $("#confirmFilename").textContent = file.name;
      $("#confirmPath").textContent = `${pathFor()}/${file.name}`;
      modal.classList.remove("hidden");
      $("#confirmUploadBtn")?.focus();
    });
    $("#cancelUploadBtn")?.addEventListener("click", () => modal?.classList.add("hidden"));
    modal?.addEventListener("click", e => {
      if (e.target === modal) modal.classList.add("hidden");
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") modal?.classList.add("hidden");
    });

    $("#confirmUploadBtn")?.addEventListener("click", async () => {
      if (!file) return;
      if (!isConfigured()) {
        modal?.classList.add("hidden");
        showMessage(msg, "Repository is not configured yet. Edit assets/config.js with your GitHub username, repository name, and branch, then reload.", "error");
        return;
      }
      const chosen = file;
      const path = `${pathFor()}/${chosen.name}`;
      const btn = $("#confirmUploadBtn");
      const token = getGitHubToken("Paste a GitHub token with Contents: Read and write access to this repository.");
      if (!token) {
        modal?.classList.add("hidden");
        toast("Upload cancelled. No token entered.");
        return;
      }
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Checking duplicate…";
      try {
        const existing = await getAuthenticatedContent(path, token);
        if (existing && existing.sha) {
          modal?.classList.add("hidden");
          showMessage(msg, `A file named "${chosen.name}" already exists in ${pathFor()}/. Nothing was overwritten. Rename your file or choose another folder.`, "error");
          return;
        }
      } catch (e) {
        if (!String(e.message).includes("404") && !String(e.message).toLowerCase().includes("not found")) {
          modal?.classList.add("hidden");
          showMessage(msg, `Could not check for duplicates: ${e.message}. No upload was made.`, "error");
          return;
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Confirm upload";
      }

      btn.disabled = true;
      btn.textContent = "Uploading…";
      const progress = $("#uploadProgress");
      const bar = $("#progressBar");
      const percent = $("#progressPercent");
      const label = $("#progressLabel");
      progress?.classList.remove("hidden");
      if (label) label.textContent = "Preparing file…";
      if (bar) bar.style.width = "10%";
      if (percent) percent.textContent = "10%";

      try {
        const base64 = await fileToBase64(chosen);
        if (bar) bar.style.width = "35%";
        if (percent) percent.textContent = "35%";
        if (label) label.textContent = "Uploading to GitHub…";
        const response = await fetch(`${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
          method: "PUT",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ message: `Add chord sheet ${chosen.name}`, content: base64, branch: cfg.branch || "main" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `GitHub upload failed (${response.status}).`);
        if (bar) bar.style.width = "100%";
        if (percent) percent.textContent = "100%";
        if (label) label.textContent = "Upload committed to repository.";
        modal?.classList.add("hidden");
        showMessage(msg, `Upload successful: ${chosen.name} was added to ${pathFor()}/. It may take a short time for GitHub Pages to reflect the change.`, "success");
        file = null;
        selected?.classList.add("hidden");
        if (review) review.disabled = true;
        toast("Upload successful. Repository updated.");
      } catch (e) {
        modal?.classList.add("hidden");
        showMessage(msg, `Upload failed: ${e.message}. Please check your token permissions, branch, repository, and connection.`, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Confirm upload";
        window.setTimeout(() => {
          progress?.classList.add("hidden");
          if (bar) bar.style.width = "0";
          if (percent) percent.textContent = "0%";
        }, 3500);
      }
    });

    updatePath();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
    });
  }

  function initTokenManager() {
    const panel = $("#tokenManager");
    if (!panel) return;
    const passForm = $("#tokenPassForm");
    const passInput = $("#tokenPasscode");
    const unlockMessage = $("#tokenUnlockMessage");
    const tools = $("#tokenTools");
    const tokenInput = $("#githubTokenInput");
    const status = $("#tokenStatus");
    const copyBtn = $("#copyTokenBtn");
    const saveBtn = $("#saveTokenBtn");
    const clearBtn = $("#clearTokenBtn");
    const PASSCODE = "777";

    function showStatus(message, kind = "info") {
      if (!status) return;
      status.className = `message ${kind}`;
      status.textContent = message;
      status.classList.remove("hidden");
    }
    function refreshTokenState() {
      const token = getSavedToken();
      if (tokenInput) tokenInput.value = token;
      if (copyBtn) copyBtn.disabled = !token;
      if (clearBtn) clearBtn.disabled = !token;
      if (status) {
        status.className = "message info";
        status.textContent = token
          ? "A token is saved in this browser. You can copy it or replace it."
          : "No token is saved in this browser yet.";
        status.classList.remove("hidden");
      }
    }
    passForm?.addEventListener("submit", e => {
      e.preventDefault();
      if (passInput?.value === PASSCODE) {
        tools?.classList.remove("hidden");
        passForm.classList.add("hidden");
        if (unlockMessage) unlockMessage.classList.add("hidden");
        refreshTokenState();
      } else {
        if (unlockMessage) {
          unlockMessage.textContent = "Incorrect passcode. Please try again.";
          unlockMessage.className = "message error";
          unlockMessage.classList.remove("hidden");
        }
        passInput?.select();
      }
    });
    saveBtn?.addEventListener("click", () => {
      const token = tokenInput?.value.trim() || "";
      if (!token) {
        showStatus("Paste your GitHub token first.", "error");
        return;
      }
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        refreshTokenState();
        showStatus("Token saved in this browser. Upload, delete, and reference-saving actions can use it.", "success");
      } catch (_) {
        showStatus("This browser blocked local storage. The token was not saved.", "error");
      }
    });
    copyBtn?.addEventListener("click", async () => {
      const token = getSavedToken();
      if (!token) {
        showStatus("Save a token first.", "error");
        return;
      }
      try {
        await navigator.clipboard.writeText(token);
        showStatus("Token copied to clipboard.", "success");
      } catch (_) {
        if (tokenInput) {
          tokenInput.value = token;
          tokenInput.type = "text";
          tokenInput.focus();
          tokenInput.select();
          const copied = document.execCommand("copy");
          showStatus(copied ? "Token copied to clipboard." : "Automatic copying was blocked. Select and copy the token manually.", copied ? "success" : "info");
        }
      }
    });
    clearBtn?.addEventListener("click", () => {
      if (!window.confirm("Remove the saved token from this browser? This does not revoke the token on GitHub.")) return;
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        refreshTokenState();
        showStatus("Saved token removed from this browser. Revoke it on GitHub separately if needed.", "success");
      } catch (_) {
        showStatus("Could not clear local storage in this browser.", "error");
      }
    });
    const revealBtn = $("#revealTokenBtn");
    revealBtn?.addEventListener("click", () => {
      if (!tokenInput) return;
      const reveal = tokenInput.type === "password";
      tokenInput.type = reveal ? "text" : "password";
      revealBtn.textContent = reveal ? "Hide" : "Show";
    });
    // Keep token manager locked on every page load; passcode is a convenience
    // gate only, not a security boundary for a public static website.
    tools?.classList.add("hidden");
    passForm?.classList.remove("hidden");
    if (copyBtn) copyBtn.disabled = !getSavedToken();
    if (clearBtn) clearBtn.disabled = !getSavedToken();
  }

  function initNav() {
    const toggle = $(".menu-toggle");
    const nav = $(".nav-links");
    toggle?.addEventListener("click", () => {
      if (!nav) return;
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    $$('a[href$=".html"]').forEach(a => {
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && !a.target) {
        a.addEventListener("click", e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          document.body.classList.add("page-leaving");
          window.setTimeout(() => location.href = url.href, 110);
        });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    initTokenManager();
    initLibrary();
    initUpload();
  });
})();
