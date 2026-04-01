// ── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  sourceOrigin: "https://rms.dev.caspeco.net",
  localOrigin:  "https://localhost.caspeco.net:9552",
  sourcePath:   "/api/navigation/marc/",
  localPath:    "/api/navigation/marc-local/",
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get("localTriggerSettings", (data) => {
      if (data.localTriggerSettings) {
        settings = { ...DEFAULT_SETTINGS, ...data.localTriggerSettings };
      }
      resolve();
    });
  });
}

function saveSettings(newSettings) {
  settings = { ...newSettings };
  chrome.storage.local.set({ localTriggerSettings: settings });
}

// ── URL transformation ──────────────────────────────────────────────────────

function convertToLocal(url) {
  let result = url.replace(settings.sourceOrigin, settings.localOrigin);
  if (settings.sourcePath && settings.localPath) {
    result = result.replace(settings.sourcePath, settings.localPath);
  }
  return result;
}

// ── Deduplication ───────────────────────────────────────────────────────────

function requestKey(url, method, headers, body) {
  const sortedHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  return `${method}::${url}::${sortedHeaders}::${body || ""}`;
}

// ── State ───────────────────────────────────────────────────────────────────

const seenKeys = new Set();
let requestCount = 0;

// ── DOM refs ────────────────────────────────────────────────────────────────

const listEl        = document.getElementById("request-list");
const emptyState    = document.getElementById("empty-state");
const countBadge    = document.getElementById("count");
const clearBtn      = document.getElementById("btn-clear");
const filterInput   = document.getElementById("filter-input");
const settingsBtn   = document.getElementById("btn-settings");
const settingsPanel = document.getElementById("settings-panel");
const inSourceOrigin = document.getElementById("in-source-origin");
const inLocalOrigin  = document.getElementById("in-local-origin");
const inSourcePath   = document.getElementById("in-source-path");
const inLocalPath    = document.getElementById("in-local-path");
const saveSettingsBtn   = document.getElementById("btn-save-settings");
const cancelSettingsBtn = document.getElementById("btn-cancel-settings");

function populateSettingsForm() {
  inSourceOrigin.value = settings.sourceOrigin;
  inLocalOrigin.value  = settings.localOrigin;
  inSourcePath.value   = settings.sourcePath;
  inLocalPath.value    = settings.localPath;
}

settingsBtn.addEventListener("click", () => {
  const isOpen = settingsPanel.classList.toggle("open");
  settingsBtn.classList.toggle("active", isOpen);
  if (isOpen) populateSettingsForm();
});

cancelSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.remove("open");
  settingsBtn.classList.remove("active");
});

saveSettingsBtn.addEventListener("click", () => {
  const src = inSourceOrigin.value.trim();
  const loc = inLocalOrigin.value.trim();
  if (!src || !loc) {
    inSourceOrigin.style.borderColor = src ? "" : "#e84e4e";
    inLocalOrigin.style.borderColor  = loc ? "" : "#e84e4e";
    return;
  }
  inSourceOrigin.style.borderColor = "";
  inLocalOrigin.style.borderColor  = "";
  saveSettings({
    sourceOrigin: src,
    localOrigin:  loc,
    sourcePath:   inSourcePath.value.trim(),
    localPath:    inLocalPath.value.trim(),
  });
  settingsPanel.classList.remove("open");
  settingsBtn.classList.remove("active");
  // Update empty state hint
  const hintEl = document.getElementById("empty-hint-host");
  if (hintEl) hintEl.textContent = new URL(src).hostname;
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function methodClass(method) {
  const m = (method || "").toUpperCase();
  if (["GET","POST","PUT","DELETE","PATCH"].includes(m)) return `method-${m}`;
  return "method-OTHER";
}

function updateCount() {
  countBadge.textContent = requestCount;
}

function applyFilter() {
  const q = filterInput.value.trim().toLowerCase();
  document.querySelectorAll(".request-card").forEach((card) => {
    const url = card.dataset.url || "";
    card.classList.toggle("hidden", q.length > 0 && !url.toLowerCase().includes(q));
  });
}

// Builds a JS fetch snippet safe to inject via inspectedWindow.eval().
// Using JSON.stringify for headers/body avoids any escaping issues.
function buildPageFetchCode(localUrl, method, headers, body) {
  const fetchInit = { method, headers };
  if (body && method !== "GET" && method !== "HEAD") {
    fetchInit.body = body;
  }
  return `fetch(${JSON.stringify(localUrl)}, ${JSON.stringify(fetchInit)})`;
}

function buildCurlCommand(localUrl, method, headers, body) {
  const parts = [`curl -X ${method} '${localUrl}'`];
  for (const [k, v] of Object.entries(headers)) {
    const safe = v.replace(/'/g, "'\\''");
    parts.push(`  -H '${k}: ${safe}'`);
  }
  if (body && method !== "GET" && method !== "HEAD") {
    const safeBody = body.replace(/'/g, "'\\''");
    parts.push(`  --data '${safeBody}'`);
  }
  return parts.join(" \\\n");
}

// ── JSON tree renderer ────────────────────────────────────────────────────────

function renderJsonTree(data) {
  const root = document.createElement("div");
  root.className = "json-tree";
  root.appendChild(jsonNode(data));
  return root;
}

function jsonNode(value, key, isLast) {
  const line = document.createElement("div");
  line.className = "jn-line";

  if (key !== undefined) {
    const k = document.createElement("span");
    k.className = "jn-key";
    k.textContent = `"${key}": `;
    line.appendChild(k);
  }

  if (value === null) {
    const v = document.createElement("span");
    v.className = "jn-null";
    v.textContent = "null";
    line.appendChild(v);
  } else if (typeof value === "boolean") {
    const v = document.createElement("span");
    v.className = "jn-bool";
    v.textContent = String(value);
    line.appendChild(v);
  } else if (typeof value === "number") {
    const v = document.createElement("span");
    v.className = "jn-number";
    v.textContent = String(value);
    line.appendChild(v);
  } else if (typeof value === "string") {
    const v = document.createElement("span");
    v.className = "jn-string";
    v.textContent = `"${value}"`;
    line.appendChild(v);
  } else if (Array.isArray(value)) {
    line.appendChild(jsonCollection(value, "[", "]", `${value.length} items`));
  } else if (typeof value === "object") {
    const keys = Object.keys(value);
    line.appendChild(jsonCollection(value, "{", "}", `${keys.length} keys`, true));
  }

  if (!isLast) {
    const comma = document.createElement("span");
    comma.className = "jn-comma";
    comma.textContent = ",";
    line.appendChild(comma);
  }

  return line;
}

function jsonCollection(value, open, close, previewText, isObject) {
  const wrapper = document.createElement("span");

  const toggle = document.createElement("span");
  toggle.className = "jn-toggle";
  toggle.textContent = "▾";

  const openBracket = document.createElement("span");
  openBracket.className = "jn-bracket";
  openBracket.textContent = open;

  const preview = document.createElement("span");
  preview.className = "jn-preview";
  preview.textContent = ` ${previewText} `;
  preview.style.display = "none";

  const children = document.createElement("div");
  children.className = "jn-children";

  const entries = isObject ? Object.entries(value) : value.map((v, i) => [undefined, v, i]);
  entries.forEach(([k, v], i) => {
    children.appendChild(jsonNode(v, isObject ? k : undefined, i === entries.length - 1));
  });

  const closeBracket = document.createElement("div");
  closeBracket.className = "jn-bracket";
  closeBracket.textContent = close;

  let collapsed = false;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    toggle.textContent = collapsed ? "▸" : "▾";
    children.style.display = collapsed ? "none" : "";
    closeBracket.style.display = collapsed ? "none" : "";
    preview.style.display = collapsed ? "" : "none";
  });

  wrapper.appendChild(toggle);
  wrapper.appendChild(openBracket);
  wrapper.appendChild(preview);
  wrapper.appendChild(children);
  wrapper.appendChild(closeBracket);
  return wrapper;
}

// ── Card creation ────────────────────────────────────────────────────────────

function createCard(originalUrl, localUrl, method, headers, body) {
  const card = document.createElement("div");
  card.className = "request-card";
  card.dataset.url = originalUrl;

  card.innerHTML = `
    <div class="card-header">
      <span class="chevron">▶</span>
      <span class="method-badge ${methodClass(method)}">${method}</span>
      <span class="card-url" title="${originalUrl}">${originalUrl}</span>
      <div class="card-actions">
        <button class="btn-hit">Hit Local</button>
        <button class="btn-curl">Copy cURL</button>
      </div>
      <span class="status-badge status-idle">—</span>
    </div>
    <div class="progress-bar"></div>
    <div class="card-detail">
      <div class="detail-section">
        <div class="detail-label">Local URL</div>
        <div class="detail-url">${localUrl}</div>
      </div>
      <div class="detail-section response-section" style="display:none">
        <div class="detail-label response-label">Response</div>
        <pre class="response-box"></pre>
      </div>
    </div>
  `;

  const header     = card.querySelector(".card-header");
  const detail     = card.querySelector(".card-detail");
  const hitBtn     = card.querySelector(".btn-hit");
  const curlBtn     = card.querySelector(".btn-curl");
  const statusEl    = card.querySelector(".status-badge");
  const respSection = card.querySelector(".response-section");
  const respLabel   = card.querySelector(".response-label");
  const progressBar = card.querySelector(".progress-bar");
  const respBox     = card.querySelector(".response-box");

  function showResponse(response) {
    progressBar.classList.remove("active");
    const isOk = response.ok;
    statusEl.className = `status-badge ${isOk ? "status-success" : "status-error"}`;
    statusEl.textContent = String(response.status);

    respSection.style.display = "block";
    respLabel.textContent = `Response — ${response.status} ${response.statusText}`;
    respBox.className = `response-box ${isOk ? "status-success" : "status-error"}`;
    respBox.innerHTML = "";

    if (response.status === 0) {
      respBox.textContent = response.statusText || "Network error";
    } else if (response.isJson) {
      respBox.appendChild(renderJsonTree(response.body));
    } else if (response.body) {
      respBox.textContent = response.body;
    } else {
      respBox.textContent = `${response.status} ${response.statusText} (no body)`;
    }

    if (!detail.classList.contains("open")) {
      header.classList.add("expanded");
      detail.classList.add("open");
    }
  }

  // ── Expand/collapse ──
  header.addEventListener("click", (e) => {
    if (e.target.closest(".card-actions")) return;
    header.classList.toggle("expanded");
    detail.classList.toggle("open");
  });

  // ── Hit Local ──
  hitBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    if (!chrome.runtime?.id) {
      statusEl.className = "status-badge status-error";
      statusEl.textContent = "ERR";
      respSection.style.display = "block";
      respBox.className = "response-box status-error";
      respBox.textContent = "Extension was reloaded — please close and reopen DevTools.";
      if (!detail.classList.contains("open")) {
        header.classList.add("expanded");
        detail.classList.add("open");
      }
      return;
    }

    hitBtn.disabled = true;
    statusEl.className = "status-badge status-loading";
    statusEl.textContent = "…";
    progressBar.classList.add("active");

    // Inject fetch into the inspected tab via background so it appears in the Network tab.
    chrome.runtime.sendMessage({
      type: "INJECT_FETCH",
      tabId: chrome.devtools.inspectedWindow.tabId,
      url: localUrl,
      method,
      headers,
      body,
    });

    const SW_TIMEOUT_MS = 15000;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      hitBtn.disabled = false;
      showResponse({
        ok: false,
        status: 0,
        statusText: "Timeout — service worker did not respond within 15 s. Check chrome://extensions → HitLocal → Service Worker.",
        body: null,
        isJson: false,
      });
    }, SW_TIMEOUT_MS);

    function sendHitLocal() {
      chrome.runtime.sendMessage(
        { type: "HIT_LOCAL", url: localUrl, method, headers, body },
        (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          hitBtn.disabled = false;

          if (chrome.runtime.lastError || !response) {
            showResponse({
              ok: false,
              status: 0,
              statusText: chrome.runtime.lastError?.message || "No response from service worker.",
              body: null,
              isJson: false,
            });
            return;
          }

          showResponse(response);
        }
      );
    }

    // Ping first to ensure the service worker is awake, then send the real request.
    chrome.runtime.sendMessage({ type: "PING" }, () => {
      if (chrome.runtime.lastError) {
        // SW failed to wake — the timeout will handle the error state.
        return;
      }
      sendHitLocal();
    });
  });

  // ── Copy cURL ──
  curlBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const cmd = buildCurlCommand(localUrl, method, headers, body);
    navigator.clipboard.writeText(cmd).then(() => {
      const orig = curlBtn.textContent;
      curlBtn.textContent = "Copied!";
      setTimeout(() => { curlBtn.textContent = orig; }, 1500);
    });
  });

  return card;
}

// ── Boot ─────────────────────────────────────────────────────────────────────

loadSettings().then(() => {
  populateSettingsForm();
  document.getElementById("empty-hint-host").textContent =
    new URL(settings.sourceOrigin).hostname;
});

// ── Network listener ─────────────────────────────────────────────────────────

chrome.devtools.network.onRequestFinished.addListener((harEntry) => {
  const url = harEntry.request.url;

  if (!url.includes(settings.sourceOrigin)) return;

  const method = harEntry.request.method;

  if (method === "OPTIONS") return;

  // Build headers map
  const headers = {};
  for (const { name, value } of harEntry.request.headers) {
    headers[name] = value;
  }

  // Body
  const postData = harEntry.request.postData;
  const body = postData ? postData.text || "" : "";

  // Deduplication
  const key = requestKey(url, method, headers, body);
  if (seenKeys.has(key)) return;
  seenKeys.add(key);

  const localUrl = convertToLocal(url);

  const card = createCard(url, localUrl, method, headers, body);

  if (emptyState.parentNode) emptyState.remove();
  listEl.prepend(card);

  requestCount++;
  updateCount();
  applyFilter();
});

// ── Clear ────────────────────────────────────────────────────────────────────

clearBtn.addEventListener("click", () => {
  listEl.innerHTML = "";
  listEl.appendChild(emptyState);
  seenKeys.clear();
  requestCount = 0;
  updateCount();
});

// ── Filter ───────────────────────────────────────────────────────────────────

filterInput.addEventListener("input", applyFilter);
