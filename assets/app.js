(() => {
  "use strict";
  const cfg = window.HGCFBC_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const isConfigured = () => cfg.owner && cfg.repo && !cfg.owner.startsWith("YOUR_") && !cfg.repo.startsWith("YOUR_");
  const apiRoot = () => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const categoryPath = (category) => category === "saxophone" ? cfg.saxophonePath : cfg.guitarPath;
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;
  const dateText = (date) => { if (!date) return "Repository file"; const d = new Date(date); return Number.isNaN(d.getTime()) ? "Repository file" : d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}); };
  const ext = (name) => (name.split(".").pop() || "FILE").toUpperCase();
  function toast(message) {
    const old = $(".toast"); if (old) old.remove();
    const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role","status"); el.textContent = message;
    document.body.appendChild(el); window.setTimeout(() => el.remove(), 4000);
  }
  function showMessage(el, message, type = "info") {
    if (!el) return; el.className = `message ${type}`; el.textContent = message;
  }
  function hideMessage(el) { if (el) el.classList.add("hidden"); }
  function fileRawUrl(path) {
    return `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${encodeURIComponent(cfg.branch || "main")}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  async function listFolder(path) {
    const response = await fetch(`${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(cfg.branch || "main")}`, {headers:{"Accept":"application/vnd.github+json"}});
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(response.status === 403 ? "GitHub API rate limit or access restriction. Try again shortly." : `GitHub listing failed (${response.status}). Check repository name, branch, and folder path.`);
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(item => item.type === "file" && !item.name.startsWith(".")).map(item => ({name:item.name,path:item.path,size:item.size||0,sha:item.sha,html_url:item.html_url,download_url:item.download_url,updated_at:item._links?.git ? null : null}));
  }
  async function getDirectoryItems(path) {
    const response = await fetch(`${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(cfg.branch || "main")}`, {headers:{"Accept":"application/vnd.github+json"}});
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`GitHub API error ${response.status}. Check that the repository is public and the folder exists.`);
    const data = await response.json();
    return Array.isArray(data) ? data.filter(x => x.type === "file" && !x.name.startsWith(".")).map(x => ({name:x.name,path:x.path,size:x.size||0,sha:x.sha,html_url:x.html_url,download_url:x.download_url})) : [];
  }
  function actionButton(label, icon, cls = "") {
    return `<button class="icon-action ${cls}" type="button" title="${esc(label)}" aria-label="${esc(label)}">${icon}</button>`;
  }
  async function initLibrary() {
    const category = document.body.dataset.category;
    const list = $("#fileList"), count = $("#libraryCount"), message = $("#libraryMessage"), empty = $("#emptyState");
    if (!list || !count) return;
    let allFiles = [], view = "list";
    const render = () => {
      const query = ($("#searchInput")?.value || "").trim().toLowerCase();
      const sort = $("#sortSelect")?.value || "name-asc";
      let rows = allFiles.filter(f => f.name.toLowerCase().includes(query));
      rows.sort((a,b) => sort === "name-desc" ? b.name.localeCompare(a.name) : sort === "newest" ? (b.path.localeCompare(a.path)) : sort === "oldest" ? (a.path.localeCompare(b.path)) : a.name.localeCompare(b.name));
      count.textContent = `${rows.length} ${rows.length === 1 ? "file" : "files"} · ${category === "saxophone" ? "Saxophone" : "Guitar / Keyboard"}`;
      list.classList.toggle("grid-view", view === "grid");
      list.innerHTML = rows.map(f => {
        const isPdf = f.name.toLowerCase().endsWith(".pdf");
        const openUrl = fileRawUrl(f.path);
        return `<article class="file-row" data-path="${esc(f.path)}"><div class="file-icon">${isPdf ? "PDF" : esc(ext(f.name).slice(0,4))}</div><div class="file-info"><div class="file-name">${esc(f.name)}</div><div class="file-meta">${formatBytes(f.size)} · ${esc(category === "saxophone" ? "Saxophone" : "Guitar / Keyboard")}</div></div><div class="file-actions"><a class="icon-action" href="${esc(openUrl)}" target="_blank" rel="noopener noreferrer" title="Open in new tab" aria-label="Open in new tab">↗</a><a class="icon-action" href="${esc(openUrl)}" download="${esc(f.name)}" title="Download" aria-label="Download">↓</a><button class="icon-action delete" type="button" data-delete="${esc(f.path)}" data-name="${esc(f.name)}" title="Delete file" aria-label="Delete ${esc(f.name)}">×</button></div></article>`;
      }).join("");
      empty.classList.toggle("hidden", rows.length !== 0);
    };
    async function load() {
      hideMessage(message); count.textContent = "Loading files…"; list.innerHTML = "";
      if (!isConfigured()) { showMessage(message,"Set your GitHub username and repository name in assets/config.js before using the library.","error"); count.textContent = "Repository not configured"; empty.classList.add("hidden"); return; }
      try { allFiles = await getDirectoryItems(categoryPath(category)); render(); }
      catch (e) { showMessage(message,e.message,"error"); count.textContent = "Could not load files"; empty.classList.add("hidden"); }
    }
    $("#searchInput")?.addEventListener("input", render);
    $("#sortSelect")?.addEventListener("change", render);
    $$(".view-btn").forEach(btn => btn.addEventListener("click", () => { view = btn.dataset.view; $$(".view-btn").forEach(b => b.classList.toggle("active", b === btn)); render(); }));
    $("#refreshBtn")?.addEventListener("click", load);
    list.addEventListener("click", async e => {
      const btn = e.target.closest("[data-delete]"); if (!btn) return;
      const path = btn.dataset.delete, name = btn.dataset.name;
      const confirmed = window.confirm(`Delete "${name}" from the shared library?\n\nThis removes the file from the GitHub repository. This cannot be undone from this page.`);
      if (!confirmed) return;
      const token = window.prompt("For beta testing, paste a GitHub token with Contents: Read and write access to this repository. The token is used for this request only and is not saved by this page.");
      if (!token) { toast("Delete cancelled. No token entered."); return; }
      btn.disabled = true;
      try {
        const item = await getAuthenticatedContent(path, token);
        const result = await fetch(`${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
          method:"DELETE", headers:{"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
          body:JSON.stringify({message:`Delete chord sheet ${name}`,sha:item.sha,branch:cfg.branch||"main"})
        });
        if (!result.ok) { const detail = await result.json().catch(()=>({})); throw new Error(detail.message || `GitHub delete failed (${result.status}).`); }
        toast(`Deleted ${name}.`); await load();
      } catch(err) { toast(`Delete failed: ${err.message}`); btn.disabled = false; }
    });
    await load();
  }
  async function getAuthenticatedContent(path, token) {
    const r = await fetch(`${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(cfg.branch||"main")}`, {headers:{"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28"}});
    if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d.message || `Could not read repository file (${r.status}).`); }
    return r.json();
  }
  function initUpload() {
    const drop = $("#dropZone"), input = $("#fileInput"), browse = $("#browseBtn"), selected = $("#selectedFile"), category = $("#categorySelect"), preview = $("#destinationPreview"), review = $("#reviewUploadBtn"), clear = $("#clearSelectionBtn"), msg = $("#uploadMessage"), modal = $("#confirmModal");
    if (!drop || !input) return;
    let file = null;
    const pathFor = () => categoryPath(category.value);
    const updatePath = () => { preview.innerHTML = `<span>↳</span><code>${esc(pathFor())}/</code>`; };
    const choose = f => {
      hideMessage(msg);
      if (!f) return;
      const allowed = /\.(pdf|jpe?g|png)$/i.test(f.name);
      if (!allowed) { file = null; selected.classList.add("hidden"); review.disabled = true; showMessage(msg,"Unsupported file type. Please choose a PDF, JPG, or PNG.","error"); return; }
      if (f.size > (cfg.maxFileBytes || 10485760)) { file = null; selected.classList.add("hidden"); review.disabled = true; showMessage(msg,`File is too large (${formatBytes(f.size)}). Maximum size is 10 MB.`,"error"); return; }
      file = f; selected.classList.remove("hidden"); selected.innerHTML = `<span class="file-icon">${esc(ext(f.name).slice(0,4))}</span><span class="selected-name">${esc(f.name)}</span><span class="selected-size">${formatBytes(f.size)}</span><button type="button" class="remove-file" aria-label="Remove selected file">×</button>`;
      review.disabled = false;
    };
    drop.addEventListener("click", e => { if (e.target.closest("#browseBtn")) return; input.click(); });
    drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }});
    browse.addEventListener("click", e => { e.stopPropagation(); input.click(); });
    input.addEventListener("change", () => { choose(input.files?.[0]); input.value = ""; });
    ["dragenter","dragover"].forEach(ev => drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("dragging");}));
    ["dragleave","drop"].forEach(ev => drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("dragging");}));
    drop.addEventListener("drop", e => choose(e.dataTransfer?.files?.[0]));
    category.addEventListener("change", updatePath);
    selected.addEventListener("click", e => { if (e.target.closest(".remove-file")) { file=null; selected.classList.add("hidden"); review.disabled=true; hideMessage(msg); }});
    clear.addEventListener("click", () => { file=null; input.value=""; selected.classList.add("hidden"); review.disabled=true; hideMessage(msg); });
    review.addEventListener("click", () => {
      if (!file) return;
      $("#confirmFilename").textContent = file.name; $("#confirmPath").textContent = `${pathFor()}/${file.name}`; modal.classList.remove("hidden"); $("#confirmUploadBtn").focus();
    });
    $("#cancelUploadBtn").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") modal.classList.add("hidden"); });
    $("#confirmUploadBtn").addEventListener("click", async () => {
      if (!file) return;
      if (!isConfigured()) { modal.classList.add("hidden"); showMessage(msg,"Repository is not configured yet. Edit assets/config.js with your GitHub username, repository name, and branch, then reload.","error"); return; }
      const chosen = file, path = `${pathFor()}/${chosen.name}`;
      const token = window.prompt("Beta upload: paste a GitHub token with Contents: Read and write access to this repository. It will only be used for this request and will not be saved by this page.");
      if (!token) { modal.classList.add("hidden"); toast("Upload cancelled. No token entered."); return; }
      const btn = $("#confirmUploadBtn"); btn.disabled = true; btn.textContent = "Checking duplicate…";
      try {
        const existing = await getAuthenticatedContent(path, token);
        if (existing && existing.sha) {
          modal.classList.add("hidden");
          showMessage(msg,`A file named "${chosen.name}" already exists in ${pathFor()}/. Nothing was overwritten. Rename your file or choose another folder.`,"error");
          return;
        }
      } catch(e) {
        if (!String(e.message).includes("404") && !String(e.message).toLowerCase().includes("not found")) {
          modal.classList.add("hidden"); showMessage(msg,`Could not check for duplicates: ${e.message}. No upload was made.`,"error"); return;
        }
      } finally { btn.disabled = false; btn.textContent = "Confirm upload"; }
      btn.disabled = true; btn.textContent = "Uploading…";
      const progress = $("#uploadProgress"), bar = $("#progressBar"), percent = $("#progressPercent"), label = $("#progressLabel");
      progress.classList.remove("hidden"); label.textContent = "Preparing file…"; bar.style.width="10%"; percent.textContent="10%";
      try {
        const base64 = await fileToBase64(chosen);
        bar.style.width="35%"; percent.textContent="35%"; label.textContent="Uploading to GitHub…";
        const response = await fetch(`${apiRoot()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
          method:"PUT",headers:{"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
          body:JSON.stringify({message:`Add chord sheet ${chosen.name}`,content:base64,branch:cfg.branch||"main"})
        });
        const data = await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(data.message || `GitHub upload failed (${response.status}).`);
        bar.style.width="100%"; percent.textContent="100%"; label.textContent="Upload committed to repository.";
        modal.classList.add("hidden"); showMessage(msg,`Upload successful: ${chosen.name} was added to ${pathFor()}/. It may take a short time for GitHub Pages to reflect the change.`,"success");
        file=null; selected.classList.add("hidden"); review.disabled=true;
        toast("Upload successful. Repository updated.");
      } catch(e) { modal.classList.add("hidden"); showMessage(msg,`Upload failed: ${e.message}. Please check your token permissions, branch, repository, and connection.`,"error"); }
      finally { btn.disabled=false; btn.textContent="Confirm upload"; window.setTimeout(()=>{progress.classList.add("hidden");bar.style.width="0";percent.textContent="0%";},3500); }
    });
    updatePath();
  }
  function fileToBase64(file) {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const result=String(reader.result||"");const comma=result.indexOf(",");resolve(comma>=0?result.slice(comma+1):result);};reader.onerror=()=>reject(new Error("Could not read the selected file."));reader.readAsDataURL(file);});
  }
  function initNav() {
    const toggle = $(".menu-toggle"), nav = $(".nav-links");
    toggle?.addEventListener("click",()=>{const open=nav.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open));});
    $$('a[href$=".html"]').forEach(a=>{const url=new URL(a.href,location.href);if(url.origin===location.origin && !a.target){a.addEventListener("click",e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();document.body.classList.add("page-leaving");window.setTimeout(()=>location.href=url.href,110);});}});
  }
  document.addEventListener("DOMContentLoaded",()=>{initNav();initLibrary();initUpload();});
})();