# Voice Fill models: pull from Hugging Face, keep in the Cache API, ask for persistence, add isolation headers only if the runtime needs threads

Ticket: [#690](https://github.com/benjr70/Smart-Smoker-V2/issues/690) (part of
wayfinder map
[#687](https://github.com/benjr70/Smart-Smoker-V2/issues/687) — Voice Fill:
speak a Ramble to fill the smoke screens). Researched on 2026-10-02.

Sources: live `curl` probes against `huggingface.co`, its CDN,
`cdn.jsdelivr.net`, `raw.githubusercontent.com` and the production frontend
(commands and output in [Live probes](#live-probes)); Hugging Face Hub docs
(rate limits, storage limits) and Terms of Service; Chrome for Developers
"Cache AI models in the browser"; web.dev "Storage for the web", "Persistent
storage" and "Making your website cross-origin isolated"; MDN (storage quotas
and eviction, `StorageManager.persist()`, OPFS, `Cache.put()`,
`NetworkInformation.type`, COEP header, Background Fetch API) and
`mdn/browser-compat-data`; Chromium source (`quota_settings.cc`,
`quota_features.cc`, `persistent_storage_permission_context.cc`,
`important_sites_util.cc`); the WICG Network Information draft; runtime docs and
source for transformers.js, ONNX Runtime Web, WebLLM, MediaPipe LLM Inference
and whisper.cpp; nginx `ngx_http_headers_module` docs; Tailscale Funnel docs;
the Public Suffix List; and this repo's `apps/frontend/nginx.conf`,
`apps/frontend/public/sw.js`, `apps/frontend/public/index.html`,
`apps/frontend/src/push/browserPushAdapter.ts`, `apps/frontend/webpack.*.js`,
`.github/workflows/publish.yml` and the Tailscale host vars. Every URL is listed
in [Source list](#source-list). All pages were read on 2026-10-02.

Anything marked **Unconfirmed** could not be established from a primary source
and needs the real-phone run
([#691](https://github.com/benjr70/Smart-Smoker-V2/issues/691)) or a further
look.

## TL;DR

- **Hosting works as the map wants it.** A browser can pull model files straight
  from Hugging Face with no server of ours in the path: `/resolve/` URLs answer
  cross-origin requests with CORS headers, redirect to a CDN that sends
  `Access-Control-Allow-Origin: *`, and honour `Range`. Anonymous use is rate
  limited to 3,000 `/resolve/` requests per 5 minutes per IP, far above what one
  phone needs. The Terms of Service give no uptime promise and say nothing
  explicit for or against this kind of use.
- **Gated repos are the catch.** A gated model answers an anonymous browser with
  `401 GatedRepo`. The Gemma repos probed are gated, so a model that needs a
  licence click-through cannot be pulled "straight from the host" without
  shipping a token in the bundle. Pick ungated repos.
- **Store in the Cache API.** It is what Chrome's storage team recommends for
  models, and it is the default cache of both transformers.js and WebLLM, so the
  recommended path needs no storage code of our own. OPFS is the fallback when a
  runtime hands us raw bytes to keep (MediaPipe) or when we want resumable
  partial downloads, which the Cache API cannot hold (`Cache.put()` rejects 206
  responses).
- **Quota is not the constraint; eviction is.** Chrome lets one origin use up to
  60% of the disk, and grants zero quota only when the device is nearly full.
  Eviction is all-or-nothing per origin, least recently used first. A 2 GB model
  can vanish, and it takes the rest of the origin's stored data with it.
- **`navigator.storage.persist()` is worth calling and will very likely be
  granted here.** Chrome decides silently: granted if the site is installed, or
  is among its top "important sites", a list that counts notification
  permission, home-screen install, bookmarks and engagement. This app already
  asks for notification permission and is installable. Granted persistence stops
  eviction under storage pressure; it does not stop the user clearing site data.
- **Wi-Fi detection is available on the target browsers but is not a
  standard.** `navigator.connection.type` returns `"wifi"` or `"cellular"` in
  Chrome on Android (since Chrome 38) and Samsung Internet. It is experimental,
  absent in Firefox and Safari, and on desktop Chrome only works on ChromeOS.
  Treat anything other than a definite `"wifi"` as "ask the user".
  **Unconfirmed**: whether a phone tethered to another phone's hotspot reports
  `"wifi"` (the draft only says the value is the connection type in use).
- **This repo needs no change for delivery or storage.** `nginx.conf` and
  `sw.js` can stay as they are. Cross-origin isolation headers (COOP/COEP) are
  needed only if the chosen runtime runs multi-threaded WebAssembly. If they are
  added, nothing the frontend loads today breaks, because the frontend loads
  nothing cross-origin, and the model and runtime downloads are CORS requests,
  which COEP does not block.
- **Unconfirmed, for the real phones:** that a single multi-hundred-megabyte
  `Cache.put()` completes within memory limits on Android Chrome, and how long
  the download takes there.

## 1. Hosting: pulling from Hugging Face in the browser

### CORS and range requests

Probed live (P1 to P6). A `/resolve/` URL for a large file on an ungated repo:

- answers `302` with `access-control-allow-origin` echoing the requesting
  origin, `accept-ranges: bytes`, and the file size and hash exposed to script
  through `access-control-expose-headers` (`X-Linked-Size`, `X-Linked-ETag`,
  `ETag`, `Content-Range`, `Accept-Ranges`);
- redirects to `us.aws.cdn.hf.co` (served through CloudFront), which answers a
  `Range` request with `206`, `content-range`, and
  `access-control-allow-origin: *`. It also answers with `*` when the `Origin`
  header is `null`, which is what a browser sends after a cross-origin redirect
  of a CORS request;
- passes a CORS preflight for the `Range` header on both hops (P3, P6).

Small files (`config.json` and the like) redirect to a same-host
`/api/resolve-cache/...` path instead (P4). The redirect responses carry
`cache-control: no-store`, so the browser's HTTP cache will not keep them; reuse
has to come from storage the page controls (section 2).

The CDN response carries no `Cross-Origin-Resource-Policy` header (P5). That
matters only for `no-cors` loads under COEP; `fetch()` in CORS mode is
unaffected (section 4).

### Rate limits

The Hub's rate-limit page (values "in September '25") counts `/resolve/` URLs in
their own "Resolvers" bucket: **3,000 requests per 5-minute fixed window per IP
for anonymous users**, 5,000 for a free logged-in user. Exceeding it returns
`429`. The live probes show the same policy in the response headers:
`ratelimit-policy: "fixed window";"resolvers";q=3000;w=300`. The page notes the
anonymous and free numbers are "subject to change over time depending on
platform health".

A model is a few dozen files at most, so one phone's first-run download is two
orders of magnitude below the limit. The limit is per IP, so it is the home
network's public address that is counted, not this project's server.

### Terms

The Terms of Service (effective 2022-09-15) do not mention hotlinking, CDNs or
third-party apps downloading public files. What they do say: the Services are
provided "as is" and "as available" with no promise that they will be
"uninterrupted or available at any time", and Hugging Face may "suspend or
terminate your access to the Services anytime with or without cause". The
rate-limit page describes `/resolve/` as "the URLs that are constructed by open
source libraries ... or AI applications ... to download model/dataset files from
HF", which is the use in question.

So: permitted by silence and by the documented purpose of the endpoint, with no
availability guarantee. A missing model on first run has to be a handled
failure, not an assumption. The per-model licence (a separate matter from the
host's terms) is covered by the LLM and speech-to-text tickets.

### Gated repos

Probes P7 and P8: `google/gemma-3-1b-it` and `litert-community/Gemma3-1B-IT`
both answer an anonymous request with `401` and `x-error-code: GatedRepo`
("You must have access to it and be authenticated to access it"). An end user's
browser has no Hugging Face session and the bundle must not carry a token, so a
gated model cannot be delivered the way the map requires. Each shortlisted model
repo needs an anonymous `curl -I` on its weight files before it is accepted.

### What the candidate runtimes do by default

| Runtime | Where it fetches from by default | Where it caches by default |
| --- | --- | --- |
| transformers.js (`@huggingface/transformers`) | `https://huggingface.co/` + `{model}/resolve/{revision}/`, revision `main` unless set (`env.js`, `hub.js`). ONNX Runtime wasm from `https://cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/` (`backends/onnx.js`) | Cache API, cache name `transformers-cache`, including the wasm binaries (`useBrowserCache`, `useWasmCache`, `cacheKey`) |
| WebLLM (`@mlc-ai/web-llm`) | Weights from `https://huggingface.co/mlc-ai/...`; compiled model libraries from `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/` (`config.ts`) | Cache API. `cacheBackend` can be set to `indexeddb`, `opfs` or `cross-origin`; the source notes "the Cache API is the most well-tested in WebLLM as of now" |
| MediaPipe LLM Inference (`@mediapipe/tasks-genai`) | Nowhere: the guide has the developer download the model and "store the model within your project directory", then pass `modelAssetPath`. Wasm from `cdn.jsdelivr.net` | None documented. The page would have to fetch and store the file itself |
| whisper.cpp WASM example | A `fetch()` of a URL the page supplies (`examples/helpers.js`) | IndexedDB (`examples/helpers.js`) |

Two consequences. transformers.js and WebLLM already do what the map asks, with
no code of ours, and both pin nothing by default: transformers.js follows
`main`, so a repo owner's push changes what users download. Passing a commit
hash as `revision` fixes the bytes. MediaPipe's documented path is to self-host,
which the map rules out; using it would mean pointing `modelAssetPath` at a
Hugging Face URL of an ungated repo and writing the cache ourselves.

jsdelivr and `raw.githubusercontent.com` both answer with
`access-control-allow-origin: *` and
`cross-origin-resource-policy: cross-origin` (P11, P12).

## 2. Storage in Chrome on Android

### Which mechanism

Chrome's own guidance ("Cache AI models in the browser", last updated
2024-06-12): "the Chrome storage team recommends the Cache API for optimal
performance", and "The OPFS and the IndexedDB APIs need to serialize the data
before it can be stored. IndexedDB also needs to deserialize the data when it's
retrieved, making it the worst place to store large models."

| Mechanism | For | Against |
| --- | --- | --- |
| Cache API | Chrome's recommendation; default in transformers.js and WebLLM; stores the `Response` as is | `Cache.put()` rejects `206` responses (MDN), so a partially downloaded file cannot be kept and resumed |
| OPFS | Streamed, incremental writes through `createWritable()`; in-place writes; fast synchronous handles in a dedicated worker (MDN) | No runtime uses it by default; our own code to write, verify and hand the bytes over. WebLLM supports it as an option |
| IndexedDB | Works everywhere | Slowest for large blobs per Chrome's guidance |

All three draw on the same per-origin quota and are evicted together (MDN: "all
of its data, not parts of it, is deleted at the same time"). The choice does not
change how much can be stored or how long it survives.

### Quota

- An origin can store up to **60% of total disk size** in Chrome, in both
  best-effort and persistent modes (MDN; web.dev). Chromium source agrees: the
  pool is 80% of the disk (`kPoolSizeRatio` 0.8) and one storage key may use 75%
  of the pool (`kDefaultPerStorageKeyRatio` 0.75).
- `navigator.storage.estimate()` in Chrome reports that 60% figure regardless of
  free space (web.dev: Chrome "will always report 60% of the actual disk size"),
  so a large reported quota does not prove 2 GB will fit.
- Chromium keeps a reserve free: if less than `min(2 GB, 10% of disk)` is free,
  "Chrome will grant 0 quota to origins"; below `min(1 GB, 1% of disk)` "data
  will be aggressively evicted" (`quota_settings.cc`, `quota_features.cc`).
- Writes over quota fail with `QuotaExceededError` and must be caught (web.dev).
- Incognito is much smaller (a fraction of system memory in the source). Voice
  Fill should not offer the download there. **Unconfirmed**: a reliable way to
  detect incognito other than a small reported quota.

On the target phones (256 GB class storage) 2 GB is well inside quota. The
practical check before prompting is free space, which the page cannot read
directly: attempt the download, catch `QuotaExceededError`, and report it.

### Eviction

Chromium-based browsers "begin to evict data when the browser runs out of space,
clearing all site data from the least recently used origin first, then the next,
until the browser is no longer over the limit" (web.dev). Best-effort data lasts
"as long as the origin is below its quota, the device has enough storage space,
and the user doesn't choose to delete the data" (MDN). There is no time-based
eviction in Chrome; the seven-day rule on MDN is Safari's.

Because eviction is per origin and total, losing the model also loses the
origin's other stored data, such as the cached colour-scheme choice that
`apps/frontend/public/index.html` reads from `localStorage`. That is harmless
here, but it means the app must check for the model on every use and treat "not
there" as a normal state that leads back to the download prompt.

### What `navigator.storage.persist()` guarantees

- Granted: "Storage will not be cleared except by explicit user action" (MDN).
  Persistent data "is only evicted, or deleted, if the user chooses to" (MDN).
- Not covered: the user clearing site data in Chrome, or clearing Chrome's data
  from Android settings. web.dev notes manual clearing is far more common than
  automatic eviction.
- Chrome shows no prompt: "Chrome, and most other Chromium-based browsers
  automatically handle the permission request" (web.dev, 2020).
- How Chrome decides (`persistent_storage_permission_context.cc`): denied if the
  request is not from the top-level origin or cookies are session-only or
  blocked; **granted if the site's registrable domain belongs to an installed
  app**; otherwise granted if that domain is among the top 10 "important sites".
  `important_sites_util.cc` builds that list from site engagement (medium or
  higher), **notification permission**, bookmarks, and home-screen install.
- It needs a secure context (MDN). Prod and dev-cloud are HTTPS.

For this app: it already requests notification permission
(`browserPushAdapter.ts`) and has a manifest with `display: standalone`, so a
user who has allowed notifications or installed the app should be granted
persistence. `ts.net` is on the Public Suffix List, so the registrable domain is
the tailnet's (`tail74646.ts.net`), shared by prod and dev-cloud; a grant earned
by one host name counts for the other. **Unconfirmed** on the real phones: that
`persist()` returns `true` on the customer's Pixel. The call returns a boolean,
so the app can record the answer and show it.

## 3. Telling Wi-Fi from cellular

`navigator.connection.type` returns the connection type in use; the enum
includes `"wifi"`, `"cellular"`, `"ethernet"`, `"none"`, `"unknown"` and
`"other"` (MDN; WICG draft).

Support, from `mdn/browser-compat-data`:

| Browser | `NetworkInformation.type` |
| --- | --- |
| Chrome on Android | Yes, since 38 |
| Samsung Internet | Yes (mirrors Chrome on Android) |
| Android WebView | Yes, since 50 |
| Chrome desktop | Partial: "Only supported on ChromeOS" |
| Firefox | Removed in 99 (Android); never on desktop |
| Safari | No |

MDN flags the property "Experimental" and "Limited availability", and the spec
is a WICG draft, not a standard. For the two target phones it is present and
gives the answer the map needs. `navigator.connection` also fires a `change`
event (Chrome on Android since 38), so the page can stop a download that started
on Wi-Fi when the phone drops to cellular, and `saveData` reports the user's
Data Saver preference.

Limits:

- The value describes the connection type, not whether it is metered.
  **Unconfirmed**: a phone on another phone's hotspot most likely reports
  `"wifi"`; no primary source states it either way.
- On a desktop browser (used during development and by the hermetic e2e suite)
  `type` is undefined. The code must treat a missing or non-`"wifi"` value as
  "unknown" and ask the user to confirm, not block and not assume.

So "reliably" is: yes on Chrome for Android for the Wi-Fi/cellular distinction;
no for metered Wi-Fi. The prompt should state the download size in every case,
which makes the user the final check.

## 4. This repo

### What is there today

- `apps/frontend/nginx.conf`: one `server` on port 3000, static files with an
  SPA fallback, `/api/` and `/socket.io/` proxied to the backend. No
  `add_header` anywhere. Probe P10 confirms production sends no COOP, COEP or
  CORP headers.
- TLS is terminated in front by Tailscale Funnel (prod) or Serve (dev-cloud),
  port 443 to container port 80/3000
  (`infra/proxmox/ansible/inventory/host_vars/*.yml`). P10 shows nginx's own
  `server:` and `etag` headers reaching the client, so response headers set in
  nginx pass through.
- `apps/frontend/public/sw.js`: `install`, `activate`, `push` and
  `notificationclick` handlers only. There is no `fetch` handler, so the worker
  does not sit in the path of any download. It is registered from
  `browserPushAdapter.ts` only when the user subscribes to notifications.
- `apps/frontend/public/manifest.json`: installable, `display: standalone`.
- What the frontend loads cross-origin: **nothing**. The API base URL is
  `/api/` (`.github/workflows/publish.yml` writes `REACT_APP_CLOUD_URL=/api/`),
  Socket.IO connects to `io('')` (same origin), the font is self-hosted through
  `@fontsource` and emitted by webpack, and a grep of `apps/frontend/src`,
  `apps/frontend/public` and `packages/*/src` finds no absolute `http(s)` asset
  URL, `<iframe>`, `window.open`, `.opener`, `postMessage`, `new Worker` or
  `SharedArrayBuffer`.

### Does delivery or storage need a repo change?

No. Model files come from another origin by `fetch()`, are stored by the runtime
in the Cache API, and never pass through nginx or the service worker. Serving
them from this box would be a poor idea in any case: Tailscale's docs say
"Traffic sent over a Funnel is subject to non-configurable bandwidth limits".

Do not add a `fetch` handler to `sw.js` to cache models. The runtimes cache from
the page, and a handler would put the push worker in the path of every request
the app makes.

### Are COOP/COEP needed?

Only for multi-threaded WebAssembly. ONNX Runtime Web: "Only when the browser
supports WebAssembly multi-threading and `crossOriginIsolated` mode is enabled,
multi-threading will be enabled"; without it the wasm backend runs on one
thread. Cross-origin isolation needs both `Cross-Origin-Opener-Policy:
same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or
`credentialless`) on the document (MDN; web.dev).

- A WebGPU route (transformers.js on WebGPU, WebLLM, MediaPipe) is not
  documented as needing isolation. **Unconfirmed** that every WebGPU path is
  fast enough without wasm threads for the parts that still run on the CPU; that
  is for the speech-to-text and LLM tickets and the phone run.
- A wasm route (transformers.js on the wasm backend, whisper.cpp) needs the
  headers to get more than one thread.

So the headers are a consequence of the stack pick, not of delivery.

### If the headers are added, what breaks?

Nothing that exists today, on the evidence above:

- **COEP `require-corp`** blocks cross-origin `no-cors` loads that lack a CORP
  header. The frontend has none. "Requests in `cors` mode won't be blocked by
  COEP but must still be permitted by CORS" (MDN), and `fetch()` to Hugging Face
  is a CORS request that the host permits (P1 to P6). The runtime's wasm from
  jsdelivr and WebLLM's libraries from GitHub are served with both CORS and
  `cross-origin-resource-policy: cross-origin` (P11, P12).
- **COOP `same-origin`** cuts the link between the page and cross-origin windows
  it opens or is opened by (web.dev). The frontend opens no windows and uses no
  `window.opener`.
- **Same-origin traffic** (`/api/`, `/socket.io/`, the bundle, fonts, `sw.js`,
  `manifest.json`) is not subject to COEP. Push notifications are unaffected.
- **Workers**: a worker script must be same-origin (web.dev), which a bundled
  worker is.

Things to get right when adding them:

- nginx `add_header` at `server` level is inherited by a `location` "if and only
  if there are no `add_header` directives defined on the current level" (nginx
  docs). None of the three locations has one today, so two lines at `server`
  level cover everything; anyone who later adds an `add_header` inside a
  `location` silently drops both headers there.
- Without `always`, `add_header` applies only to 2xx/3xx responses (nginx docs).
- `webpack.dev.js` (`devServer`) would need the same two headers, or threaded
  wasm will work in production and not locally.
- Future cross-origin embeds (an image, a map tile, an analytics script) would
  be blocked unless served with CORS or CORP. `credentialless` loosens this for
  `no-cors` loads and is supported in Chrome on Android, but not Safari
  (`browser-compat-data`).
- The Electron smoker app has its own nginx config (`apps/smoker/nginx.conf`)
  and is out of scope for Voice Fill; it is not affected.

**Unconfirmed**: the effect of isolation on the hermetic e2e suite and on the
`/verify-pr` browser. Nothing in the reading suggests a problem, but it has not
been run.

### A side observation

Probe P10 shows production serving a 978-byte `sw.js` last modified 2026-09-02,
smaller than the file on master. That is most likely the deployed release
trailing master, and it does not affect these findings; it is noted only because
the ticket asks about that file.

## 5. Recommended approach

1. **Host**: fetch model files from ungated Hugging Face repos through the
   runtime's own loader, with the revision pinned to a commit hash. Leave the
   runtime's wasm on its default CDN (the version is already pinned in the URL).
   Before accepting any model, run an anonymous `curl -I` on its weight files
   and reject it if the answer is `401`.
2. **Store**: let the runtime keep the files in the Cache API (its default).
   Call `navigator.storage.persist()` when the user accepts the download prompt
   and record the result. Check for the model on every Voice Fill use and treat
   "missing" as the trigger for the prompt again. Catch `QuotaExceededError`.
   Fall back to OPFS only if the chosen runtime takes raw bytes from us, or if
   the phone run shows that an interrupted download restarting from zero is
   unacceptable.
3. **Network**: prompt with the total size. If `navigator.connection.type` is
   `"wifi"`, offer the download; if `"cellular"`, say so and do not start; if
   absent or anything else, ask the user to confirm they are on Wi-Fi. Abort on
   a `change` to `"cellular"`.
4. **Headers**: add COOP/COEP only if the stack pick uses threaded wasm. If so,
   two `add_header ... always;` lines at `server` level in `nginx.conf` and the
   same in `webpack.dev.js`.
5. **Service worker**: leave `sw.js` alone. The Background Fetch API (Chrome 74
   and later, experimental, needs a service worker) could carry the download
   past a closed tab, but it would mean new handlers in the push worker and
   moving files into the runtime's cache by hand. Not recommended for a first
   version.

### Repo files this would touch

| File | Change | When |
| --- | --- | --- |
| `apps/frontend/package.json` | add the runtime dependency | always |
| new module under `apps/frontend/src/` (one port in the style of `src/push/`) | model presence check, persist request, connection check, download with progress, quota and network failure handling | always |
| `apps/frontend/src/components/smoke/` (the three wizard steps) | button, prompt and progress UI that call the module | always |
| `apps/frontend/nginx.conf` | two `add_header` lines at `server` level | only with threaded wasm |
| `apps/frontend/webpack.dev.js` | `devServer.headers` with the same two headers | only with threaded wasm |
| `apps/frontend/webpack.prod.js` | a rule or copy step for wasm or worker assets | only if the runtime's wasm is self-hosted instead of left on its CDN |
| `apps/frontend/public/sw.js`, `apps/frontend/src/push/browserPushAdapter.ts`, `apps/frontend/public/manifest.json` | none | never, unless Background Fetch is adopted later |
| `CONTEXT.md` | Voice Fill vocabulary, with the Spec | always |

## Live probes

Run on 2026-10-02 (22:04 UTC) from the agent box. Output trimmed to the headers
that matter.

**P1** `curl -sI -H 'Origin: https://smokecloud.tail74646.ts.net' https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx`

```
HTTP/2 302
location: https://us.aws.cdn.hf.co/xet-bridge-us/...
ratelimit: "resolvers";r=2999;t=124
ratelimit-policy: "fixed window";"resolvers";q=3000;w=300
access-control-allow-origin: https://smokecloud.tail74646.ts.net
access-control-expose-headers: X-Repo-Commit,X-Request-Id,X-Error-Code,X-Error-Message,X-Total-Count,ETag,Link,Accept-Ranges,Content-Range,X-Linked-Size,X-Linked-ETag,X-Xet-Hash
accept-ranges: bytes
x-linked-size: 82468078
cache-control: no-store
```

**P2** the same URL with `-L -H 'Range: bytes=0-1023'`, final hop:

```
HTTP/2 206
content-type: application/octet-stream
accept-ranges: bytes
content-length: 1024
content-range: bytes 0-1023/82468078
access-control-allow-origin: *
access-control-expose-headers: *
via: 1.1 ...cloudfront.net (CloudFront)      (on the 302 hop)
```

**P3** `curl -X OPTIONS` on the hub URL with
`Access-Control-Request-Method: GET` and `Access-Control-Request-Headers: range`:

```
HTTP/2 200
access-control-allow-origin: https://smokecloud.tail74646.ts.net
access-control-allow-headers: range
access-control-allow-methods: GET
```

**P4** `curl -sI` on `.../whisper-base/resolve/main/config.json`: `HTTP/2 307`,
`location: /api/resolve-cache/models/onnx-community/whisper-base/<commit>/config.json...`,
same CORS headers as P1.

**P5** the CDN URL from P1 with `-H 'Origin: null' -H 'Range: bytes=1000-1999'`,
all headers:

```
HTTP/2 206
content-type: application/octet-stream
accept-ranges: bytes
content-disposition: inline; filename*=UTF-8''encoder_model.onnx; filename="encoder_model.onnx";
etag: "2a37684e..."
access-control-allow-headers: Content-Range, Content-Type, Content-Disposition, ETag
access-control-expose-headers: *
content-length: 1000
content-range: bytes 1000-1999/82468078
vary: origin, access-control-request-method, access-control-request-headers
access-control-allow-origin: *
x-hf-cdn-pop: aws-us-east-1
```

No `cross-origin-resource-policy` header.

**P6** `curl -X OPTIONS` on the CDN URL with `Origin: null` and a `range`
preflight: `HTTP/2 200`, `access-control-allow-origin: *`,
`access-control-allow-headers: *`, `access-control-allow-methods: *`.

**P7** `curl -sI https://huggingface.co/google/gemma-3-1b-it/resolve/main/config.json`

```
HTTP/2 401
x-error-code: GatedRepo
x-error-message: Access to model google/gemma-3-1b-it is restricted. You must have access to it and be authenticated to access it. Please log in.
```

**P8** `curl -sI https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4.task`:
`HTTP/2 401`, `x-error-code: GatedRepo`.

**P9** `curl -sI https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json`:
`HTTP/2 307`, CORS headers as P1 (ungated).

**P10** `curl -sI https://smokecloud.tail74646.ts.net/` and `/sw.js`:

```
HTTP/2 200
accept-ranges: bytes
content-type: text/html
etag: "6a976800-a43"
last-modified: Wed, 02 Sep 2026 00:04:16 GMT
server: nginx/1.31.4
content-length: 2627
```

`/sw.js`: `200`, `content-type: application/javascript`, `content-length: 978`.
No COOP, COEP or CORP header on either.

**P11** `curl -sI https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort-wasm-simd-threaded.wasm`:
`HTTP/2 200`, `content-type: application/wasm`,
`access-control-allow-origin: *`, `cross-origin-resource-policy: cross-origin`.

**P12** `curl -sI https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/README.md`:
`HTTP/2 200`, `access-control-allow-origin: *`,
`cross-origin-resource-policy: cross-origin`.

**Repo greps** (in the worktree at `2e4e7add`), each returning no match outside
tests:

```
grep -rnE "window\.open|<iframe|<webview|postMessage|\.opener|target=\"_blank\"|new Worker|SharedArrayBuffer" apps/frontend/src packages/*/src
grep -rnE "src=\"http|href=\"http|url\(http" apps/frontend/src apps/frontend/public packages/*/src
grep -n "fetch" apps/frontend/public/sw.js
```

## Source list

Hosting:

- Hub rate limits: <https://huggingface.co/docs/hub/rate-limits>
- Hub storage limits (files "are served to the users using CloudFront"):
  <https://huggingface.co/docs/hub/storage-limits>
- Hugging Face Terms of Service (effective 2022-09-15):
  <https://huggingface.co/terms-of-service>
- transformers.js `env` reference:
  <https://huggingface.co/docs/transformers.js/api/env>
- transformers.js source, `packages/transformers/src/env.js`, `utils/hub.js`,
  `backends/onnx.js` on `main`: <https://github.com/huggingface/transformers.js>
- WebLLM advanced usage:
  <https://webllm.mlc.ai/docs/user/advanced_usage.html>; source `src/config.ts`
  on `main`: <https://github.com/mlc-ai/web-llm>
- MediaPipe LLM Inference guide for Web (updated 2026-06-12):
  <https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js>
- whisper.cpp `examples/helpers.js` and `examples/whisper.wasm/README.md` on
  `master`: <https://github.com/ggml-org/whisper.cpp>
- Tailscale Funnel (updated 2026-01-20): <https://tailscale.com/kb/1223/funnel>

Storage:

- Cache AI models in the browser (updated 2024-06-12):
  <https://developer.chrome.com/docs/ai/cache-models>
- Storage for the web (updated 2024-09-23):
  <https://web.dev/articles/storage-for-the-web>
- Persistent storage (updated 2020-05-12):
  <https://web.dev/articles/persistent-storage>
- MDN, Storage quotas and eviction criteria (modified 2026-01-05):
  <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- MDN, `StorageManager.persist()` (modified 2024-07-26):
  <https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist>
- MDN, Origin private file system (modified 2025-07-14):
  <https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system>
- MDN, `Cache.put()` (modified 2025-06-24):
  <https://developer.mozilla.org/en-US/docs/Web/API/Cache/put>
- Chromium `storage/browser/quota/quota_settings.cc` and `quota_features.cc` on
  `main`: <https://github.com/chromium/chromium/tree/main/storage/browser/quota>
- Chromium `chrome/browser/storage/persistent_storage_permission_context.cc`:
  <https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/storage/persistent_storage_permission_context.cc>
- Chromium `chrome/browser/engagement/important_sites_util.cc` and `.h`:
  <https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/engagement/important_sites_util.cc>
- Public Suffix List (`ts.net` entry, Tailscale Inc.):
  <https://publicsuffix.org/list/public_suffix_list.dat>

Network awareness:

- MDN, `NetworkInformation.type` (modified 2024-03-24):
  <https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/type>
- WICG Network Information draft: <https://wicg.github.io/netinfo/>
- `mdn/browser-compat-data`, `api/NetworkInformation.json`,
  `api/BackgroundFetchManager.json`, `api/StorageManager.json`,
  `http/headers/Cross-Origin-Embedder-Policy.json` on `main`:
  <https://github.com/mdn/browser-compat-data>

Cross-origin isolation and this repo:

- MDN, `Cross-Origin-Embedder-Policy` (modified 2026-09-04):
  <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy>
- Making your website "cross-origin isolated" using COOP and COEP (updated
  2022-06-21): <https://web.dev/articles/coop-coep>
- ONNX Runtime Web, env flags and session options:
  <https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html>
- nginx `ngx_http_headers_module` (`add_header`):
  <https://nginx.org/en/docs/http/ngx_http_headers_module.html>
- MDN, Background Fetch API (modified 2026-09-12):
  <https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API>
- Repo files read: `apps/frontend/nginx.conf`, `apps/frontend/public/sw.js`,
  `apps/frontend/public/manifest.json`, `apps/frontend/public/index.html`,
  `apps/frontend/src/push/browserPushAdapter.ts`,
  `apps/frontend/webpack.prod.js`, `apps/frontend/webpack.dev.js`,
  `apps/frontend/Dockerfile`, `cloud.docker-compose.yml`,
  `.github/workflows/publish.yml`,
  `infra/proxmox/ansible/inventory/host_vars/smart-smoker-cloud-prod.yml` and
  `smart-smoker-dev-cloud.yml`.
