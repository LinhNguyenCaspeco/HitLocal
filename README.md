# HitLocal

A Chrome / Edge DevTools extension that intercepts network requests and replays them against your local development server with one click — preserving the original method, headers, and body.

---

## Features

- Captures Fetch/XHR requests from a configurable source origin
- Transforms the URL to your local server with one click
- Replays the request and displays the response with a collapsible JSON tree
- Fires the request from the inspected tab context so it appears in the **Network tab**
- Copy any request as a `curl` command

---

## Manual Installation

### Google Chrome

1. Download or clone this repository to your machine
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner
4. Click **Load unpacked**
5. Select the root folder of this repository (the folder containing `manifest.json`)
6. The **HitLocal** extension will appear in the list — no restart required

### Microsoft Edge

1. Download or clone this repository to your machine
2. Open Edge and navigate to `edge://extensions`
3. Enable **Developer mode** using the toggle in the bottom-left sidebar
4. Click **Load unpacked**
5. Select the root folder of this repository (the folder containing `manifest.json`)
6. The **HitLocal** extension will appear in the list — no restart required

> **Note:** After pulling any updates from this repository, go back to the extensions page and click the **refresh icon** (↺) on the HitLocal card to reload the latest version. Then close and reopen DevTools.

---

## Usage

1. Open DevTools (`F12`) on any page served from your configured source origin
2. Click the **HitLocal** tab in the DevTools panel bar
3. Network requests matching the source origin will appear automatically
4. Click a row to expand and see the transformed local URL
5. Click **Hit Local** to replay the request against your local server
6. The response status and body appear inline, with JSON rendered as a collapsible tree
7. Click **Copy cURL** to copy the request as a `curl` command

### Configure URL mapping

Click the **⚙** gear icon in the toolbar to open the settings panel:

| Field | Description | Default |
|---|---|---|
| Source Origin | The origin to capture requests from | `https://rms.dev.caspeco.net` |
| Local Origin | The origin to send requests to | `https://localhost.caspeco.net:9552` |
| Source Path | Optional path prefix to replace | `/api/navigation/marc/` |
| Local Path | Replacement path prefix | `/api/navigation/marc-local/` |

Settings are saved automatically and persist across DevTools sessions.

---

## Project Structure

```
├── manifest.json      # Extension manifest (MV3)
├── devtools.html      # DevTools page entry point
├── devtools.js        # Registers the HitLocal panel
├── panel.html         # Panel UI and styles
├── panel.js           # Request capture, dedup, URL transform, card logic
├── background.js      # Service worker — executes fetches and injects into tab
└── icons/
    ├── icon.svg           # Source icon (vector)
    ├── generate.html      # Open in browser to export PNG icons
    ├── icon16.png         # Required by Chrome/Edge
    ├── icon48.png
    └── icon128.png
```

---

## Known Limitations

- **Cookies are not forwarded** — the browser's Fetch API treats `Cookie` as a forbidden header and strips it silently. All other headers (e.g. `Authorization`, `Content-Type`) are preserved.
- **CORS** — the injected page-context fetch (visible in the Network tab) may be blocked by CORS if your local server does not return the appropriate `Access-Control-Allow-Origin` header. The service worker fetch (used for response display in the panel) is unaffected.
- **After reloading the extension**, close and reopen DevTools before using the panel again to avoid stale context errors.
