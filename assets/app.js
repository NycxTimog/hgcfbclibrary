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

  const viewerTabs = [];
  let activeViewerId = null;
  let viewerRenderToken = 0;

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
      </div>`;

    const listPanel = $(".library-panel");
    if (listPanel) listPanel.insertAdjacentElement("afterend", shell);
    else document.querySelector("main")?.appendChild(shell);

    shell.addEventListener("click", e => {
      const close = e.target.closest(".viewer-close");
      if (close) {
        shell.classList.add("hidden");
        return;
      }
      const closeTab = e.target.closest("[data-viewer-close]");
      if (closeTab) {
        e.stopPropagation();
        removeViewerTab(closeTab.dataset.viewerClose);
        return;
      }
      const tab = e.target.closest("[data-viewer-tab]");
      if (tab) {
        activateViewerTab(tab.dataset.viewerTab);
      }
    });

    return shell;
  }

  function openViewer(path, name) {
    const shell = ensureViewer();
    let tab = viewerTabs.find(t => t.path === path);
    if (!tab) {
      tab = {
        id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path,
        name
      };
      viewerTabs.push(tab);
    }
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
      <button
        type="button"
        role="tab"
        aria-selected="${t.id === id}"
        class="viewer-tab ${t.id === id ? "active" : ""}"
        data-viewer-tab="${esc(t.id)}">
        <span>♫</span>
        <span class="viewer-tab-name">${esc(t.name)}</span>
        <span
          class="viewer-tab-close"
          data-viewer-close="${esc(t.id)}"
          aria-label="Close ${esc(t.name)}">×</span>
      </button>`).join("");

    const content = shell.querySelector(".viewer-content");
    const url = fileRawUrl(tab.path);
    const lower = tab.name.toLowerCase();

    if (/\.(jpg|jpeg|png)$/i.test(lower)) {
      content.innerHTML = `
        <div class="viewer-image-wrap">
          <img src="${esc(url)}" alt="${esc(tab.name)}" class="viewer-image">
        </div>`;
      return;
    }

    if (!lower.endsWith(".pdf")) {
      content.innerHTML = `
        <div class="viewer-fallback">
          <strong>Preview unavailable</strong>
          <p>This file type cannot be previewed here.</p>
        </div>`;
      return;
    }

    if (!window.pdfjsLib) {
      content.innerHTML = `
        <div class="viewer-fallback">
          <strong>PDF viewer unavailable</strong>
          <p>PDF.js did not load. Check the script tag in this page, then reload.</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="pdf-toolbar">
        <button type="button" data-zoom-out aria-label="Zoom out">−</button>
        <span data-zoom-label>100%</span>
        <button type="button" data-zoom-in aria-label="Zoom in">+</button>
        <button type="button" data-fit-width>Fit width</button>
      </div>
      <div class="pdf-scroll-area">
        <div class="pdf-pages"></div>
      </div>`;

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
      pages.innerHTML = `
        <p class="pdf-error">
          Could not load this PDF. Check the file URL, connection, and GitHub Pages deployment.
        </p>`;
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
        if (
          renderId !== renderVersion ||
          thisRenderToken !== viewerRenderToken
        ) return;

        let page;
        try {
          page = await pdf.getPage(pageNumber);
        } catch (error) {
          if (renderId === renderVersion) console.error("PDF page error:", error);
          return;
        }

        if (
          renderId !== renderVersion ||
          thisRenderToken !== viewerRenderToken
        ) return;

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
          transform: pixelRatio !== 1
            ? [pixelRatio, 0, 0, pixelRatio, 0, 0]
            : null
        });
        activeRenderTasks.push(task);

        try {
          await task.promise;
        } catch (error) {
          if (error?.name !== "RenderingCancelledException") {
            console.error("PDF render error:", error);
          }
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

      const distance = getTouchDistance(event.touches);
      const nextScale = Math.max(
        0.5,
        Math.min(3, initialScale * distance / initialDistance)
      );
      scale = nextScale;
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
      shell.querySelector(".viewer-tabs").innerHTML = "";
      shell.querySelector(".viewer-content").innerHTML = `
        <div class="viewer-welcome">
          <span>♫</span>
          <strong>Your chord sheets will appear here</strong>
          <p>Open one or more files from the library.</p>
        </div>`;
      return;
    }

    if (activeViewerId === id) {
      activateViewerTab(viewerTabs[Math.max(0, index - 1)].id);
    } else {
      activateViewerTab(activeViewerId || viewerTabs[0].id);
    }
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

      count.textContent =
        `${rows.length} ${rows.length === 1 ? "file" : "files"} · ${category === "saxophone" ? "Saxophone" : "Guitar / Keyboard"}`;
      list.classList.toggle("grid-view", view === "grid");

      list.innerHTML = rows.map(f => {
        const isPdf = f.name.toLowerCase().endsWith(".pdf");
        const downloadUrl = fileRawUrl(f.path);
        return `
          <article class="file-row" data-path="${esc(f.path)}">
            <div class="file-icon">${isPdf ? "PDF" : esc(ext(f.name).slice(0, 4))}</div>
            <div class="file-info">
              <button
                class="file-name file-open-link viewer-open"
                type="button"
                data-open-path="${esc(f.path)}"
                data-open-name="${esc(f.name)}"
                title="Preview ${esc(f.name)}">${esc(f.name)}</button>
              <div class="file-meta">${formatBytes(f.size)} · ${esc(category === "saxophone" ? "Saxophone" : "Guitar / Keyboard")}</div>
            </div>
            <div class="file-actions">
              <button
                class="icon-action viewer-open"
                type="button"
                data-open-path="${esc(f.path)}"
                data-open-name="${esc(f.name)}"
                title="Preview in this page"
                aria-label="Preview in this page">↗</button>
              <a
                class="icon-action"
                href="${esc(downloadUrl)}"
                download="${esc(f.name)}"
                title="Download"
                aria-label="Download">↓</a>
              <button
                class="icon-action delete"
                type="button"
                data-delete="${esc(f.path)}"
                data-name="${esc(f.name)}"
                title="Delete file"
                aria-label="Delete ${esc(f.name)}">×</button>
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
        showMessage(
          message,
          "Set your GitHub username and repository name in assets/config.js before using the library.",
          "error"
        );
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

    $$(".view-btn").forEach(btn => btn.addEventListener("click", () => {
      view = btn.dataset.view;
      $$(".view-btn").forEach(b => b.classList.toggle("active", b === btn));
      render();
    }));

    $("#refreshBtn")?.addEventListener("click", load);

    list.addEventListener("click", async e => {
      const openBtn = e.target.closest("[data-open-path]");
      if (openBtn) {
        e.preventDefault();
        openViewer(openBtn.dataset.openPath, openBtn.dataset.openName);
        return;
      }

      const btn = e.target.closest("[data-delete]");
      if (!btn) return;

      const path = btn.dataset.delete;
      const name = btn.dataset.name;
      const confirmed = window.confirm(
        `Delete "${name}" from the shared library?\n\nThis removes the file from the GitHub repository. This cannot be undone from this page.`
      );
      if (!confirmed) return;

      const token = window.prompt(
        "For beta testing, paste a GitHub token with Contents: Read and write access to this repository. The token is used for this request only and is not saved by this page."
      );
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
            body: JSON.stringify({
              message: `Delete chord sheet ${name}`,
              sha: item.sha,
              branch: cfg.branch || "main"
            })
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
        selected.innerHTML = `
          <span class="file-icon">${esc(ext(f.name).slice(0, 4))}</span>
          <span class="selected-name">${esc(f.name)}</span>
          <span class="selected-size">${formatBytes(f.size)}</span>
          <button type="button" class="remove-file" aria-label="Remove selected file">×</button>`;
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
        showMessage(
          msg,
          "Repository is not configured yet. Edit assets/config.js with your GitHub username, repository name, and branch, then reload.",
          "error"
        );
        return;
      }

      const chosen = file;
      const path = `${pathFor()}/${chosen.name}`;
      const btn = $("#confirmUploadBtn");
      const token = window.prompt(
        "Beta upload: paste a GitHub token with Contents: Read and write access to this repository. It will only be used for this request and will not be saved by this page."
      );

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
          showMessage(
            msg,
            `A file named "${chosen.name}" already exists in ${pathFor()}/. Nothing was overwritten. Rename your file or choose another folder.`,
            "error"
          );
          return;
        }
      } catch (e) {
        if (
          !String(e.message).includes("404") &&
          !String(e.message).toLowerCase().includes("not found")
        ) {
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

        const response = await fetch(
          `${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
          {
            method: "PUT",
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2022-11-28",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              message: `Add chord sheet ${chosen.name}`,
              content: base64,
              branch: cfg.branch || "main"
            })
          }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `GitHub upload failed (${response.status}).`);

        if (bar) bar.style.width = "100%";
        if (percent) percent.textContent = "100%";
        if (label) label.textContent = "Upload committed to repository.";

        modal?.classList.add("hidden");
        showMessage(
          msg,
          `Upload successful: ${chosen.name} was added to ${pathFor()}/. It may take a short time for GitHub Pages to reflect the change.`,
          "success"
        );

        file = null;
        selected?.classList.add("hidden");
        if (review) review.disabled = true;
        toast("Upload successful. Repository updated.");
      } catch (e) {
        modal?.classList.add("hidden");
        showMessage(
          msg,
          `Upload failed: ${e.message}. Please check your token permissions, branch, repository, and connection.`,
          "error"
        );
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
    initLibrary();
    initUpload();
  });
})();
