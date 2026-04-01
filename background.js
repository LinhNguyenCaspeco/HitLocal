// HitLocal — Service Worker
// Executes fetch requests on behalf of the DevTools panel to bypass CORS restrictions.

const FORBIDDEN_HEADERS = new Set([
  "host",
  "content-length",
  "cookie",
  "cookie2",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse("PONG");
    return false;
  }

  // Inject a fire-and-forget fetch into the inspected tab so it appears in the Network tab.
  if (message.type === "INJECT_FETCH") {
    const { tabId, url, method, headers, body } = message;
    chrome.scripting.executeScript({
      target: { tabId },
      func: (fetchUrl, fetchMethod, fetchHeaders, fetchBody) => {
        const opts = { method: fetchMethod, headers: fetchHeaders };
        if (fetchBody && fetchMethod !== "GET" && fetchMethod !== "HEAD") {
          opts.body = fetchBody;
        }
        fetch(fetchUrl, opts).catch(() => {});
      },
      args: [url, method, headers, body || null],
    });
    return false;
  }

  if (message.type !== "HIT_LOCAL") return false;

  const { url, method, headers, body } = message;

  const cleanHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.startsWith(":")) continue; // HTTP/2 pseudo-headers
    if (!FORBIDDEN_HEADERS.has(key.toLowerCase())) {
      cleanHeaders[key] = value;
    }
  }

  const fetchOptions = {
    method,
    headers: cleanHeaders,
  };

  if (body && method !== "GET" && method !== "HEAD") {
    fetchOptions.body = body;
  }

  fetch(url, fetchOptions)
    .then(async (res) => {
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      sendResponse({
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        body: json !== null ? json : text,
        isJson: json !== null,
      });
    })
    .catch((err) => {
      sendResponse({
        ok: false,
        status: 0,
        statusText: err.message,
        body: null,
        isJson: false,
      });
    });

  return true; // keep message channel open for async sendResponse
});
