# On-device LLMs in Android Chrome: no browser-provided model yet, three shippable runtimes, none proven on the target phones

Ticket: [#688](https://github.com/benjr70/Smart-Smoker-V2/issues/688) (part of
wayfinder map
[#687](https://github.com/benjr70/Smart-Smoker-V2/issues/687) — Voice Fill:
speak a Ramble to fill the smoke screens). Researched on 2026-10-02.

Sources: Chrome for Developers built-in AI docs (Prompt API, get-started,
structured output); chromestatus.com feature API; the Prompt API Intent to Ship
on blink-dev; Chromium source at `f9a17e44` (`about_flags.cc`,
`runtime_enabled_features.json5`); gpuweb Implementation Status wiki; ML Kit
GenAI device list; Google Store and Samsung Newsroom spec pages; WebLLM,
Transformers.js, LiteRT-LM, MediaPipe and wllama repos, docs, npm registry and
issue trackers; Hugging Face model API (file sizes, licences, gating) with live
anonymous-download probes. Every URL is listed in [Sources](#sources).

## TL;DR

- **The browser-provided route does not exist on Android today.** Chrome's
  Prompt API shipped on desktop in Chrome 148; Chrome's docs say Android is "not
  yet supported", the Blink feature is `stable` only on Win/Mac/Linux/ChromeOS,
  and every `prompt-api*` flag is desktop-only, so there is no flag or origin
  trial to opt a phone in. A "Prompt API on Android" entry exists on
  chromestatus (created 2026-07-30, status Proposed, no milestone).
- **It is likely to arrive, and it would fit both phones.** The Intent to Ship
  says the Android implementation will use "that platform's OS-level built-in
  language model"; ML Kit lists Gemini Nano for the Pixel 10 Pro (nano-v3) and
  the Galaxy Z Fold8 Ultra (nano-v4). The desktop API already takes a JSON
  Schema (`responseConstraint`). So the Spec should put the LLM behind a seam
  that the Prompt API can fill later, and feature-detect it.
- **So today Voice Fill must ship its own model.** WebGPU is documented as
  enabled by default for both phones' GPU families (Qualcomm since Chrome 121;
  Imagination on Android 16+ since Chrome 139).
- **Three runtimes are credible**, all Apache-2.0, all able to pull weights
  anonymously from Hugging Face: Transformers.js (ONNX Runtime Web), WebLLM
  (MLC) and LiteRT-LM JS (Google, successor to MediaPipe LLM Inference, which is
  now maintenance-only).
- **Size bar (about 2 GB shared with speech-to-text):** Qwen-family models at
  4-bit fit with room to spare (0.4 to 1.5 GB). Gemma 4 E2B, the only model
  LiteRT-LM JS supports, is 1.9 GB on its own, so it passes only if
  speech-to-text is browser-provided or tiny.
- **Latency bar (15 s): nothing documented proves any pairing passes on these
  phones.** The only vendor figures are for other hardware (Gemma 4 E2B: 52
  tok/s decode native on an S26 Ultra; 73 tok/s WebGPU on an M4 Max). The only
  Android Chrome figures are user reports against WebLLM and they are bad
  (about 5 tok/s prefill on a Pixel 8 Pro; engine init crashes on Adreno GPUs,
  open). This needs the phones.
- **Schema-constrained JSON is available on every route**, at different
  maturity: WebLLM (built in, XGrammar), Transformers.js (first-party but
  "experimental" add-on package), LiteRT-LM JS (only through tool-call
  constrained decoding, with an open web bug), wllama (GBNF grammar).
- **Shortlist to try on the phones:** 1. Transformers.js + Qwen3.5-2B (fall back
  to Qwen3-1.7B / Qwen3.5-0.8B); 2. WebLLM + Qwen3-1.7B; 3. LiteRT-LM JS +
  Gemma 4 E2B. Details and what each must prove are in
  [Ranked shortlist](#ranked-shortlist).

## The two phones

| Phone               | SoC                                             | RAM         | Source                    |
| ------------------- | ----------------------------------------------- | ----------- | ------------------------- |
| Pixel 10 Pro        | Google Tensor G5                                | 16 GB       | Google Store spec page    |
| Galaxy Z Fold8 Ultra | Snapdragon 8 Elite Gen 5 Mobile Platform for Galaxy | 12 or 16 GB | Samsung Newsroom, samsung.com |

The map calls the test device "Galaxy Fold 8 Ultra"; Samsung's name is Galaxy Z
Fold8 Ultra.

**Unconfirmed from a primary source:** the GPU vendor in each phone. Neither
spec page names it. Press reporting says the Tensor G5 uses an Imagination
PowerVR GPU and the Snapdragon 8 Elite Gen 5 an Adreno 840. Which RAM variant
the user's Fold has is also unknown. Both are a one-minute check on the device
at <https://webgpureport.org> (it also shows `shader-f16` and buffer limits,
which the f16 model builds below depend on).

## Route 1: browser-provided model (Chrome built-in AI)

### Not available in Chrome on Android

- Chrome's Prompt API page (last updated 2026-08-26) lists the supported
  operating systems as "Windows 10 or 11; macOS 13+ (Ventura and onwards);
  Linux; or ChromeOS (from Platform 16389.0.0 and onwards) on Chromebook Plus
  devices" and states: "Chrome for Android, iOS, and ChromeOS on non-Chromebook
  Plus devices are not yet supported by the APIs which use foundation models."
  The get-started page repeats the sentence. This covers the relatives too
  (Summarizer, Writer, Rewriter, Proofreader); Translator and Language Detector
  "do not work on mobile devices" either.
- chromestatus, feature "Prompt API" (id 5134603979063296): shipped on desktop
  in 148 (origin trial 139 to 144), `android: null`, `webview: null`.
- Chromium source at `f9a17e44` (2026-10-02):
  - `third_party/blink/renderer/platform/runtime_enabled_features.json5`:
    `AIPromptAPI` is `stable` on `Win`, `Mac`, `Linux`, `ChromeOS` and
    `"default": ""`, meaning off everywhere else, including Android.
  - `chrome/browser/about_flags.cc`: `prompt-api`, `prompt-api-multimodal-input`,
    `prompt-api-tool-use` and `prompt-api-sampling-mode` are all registered with
    `kOsDesktop`. There is no Android flag to turn the API on.
- Origin trials: the Prompt API origin trial ran on desktop only (139 to 144,
  extended to 147) and ended when the API shipped. No Android origin trial is
  recorded on chromestatus.

### What is on the way

- The Intent to Ship (blink-dev, 2026-04-01) answers the "all six Blink
  platforms" question with "No. The initial launch focuses on Windows, Mac,
  Linux, and ChromeOS (on Chromebook Plus devices)" and adds: "An implementation
  for Android using that platform's OS-level built-in language model is being
  prototyped and will ship after the initial launch." Not available in WebView.
- chromestatus, feature "Prompt API on Android" (id 5888755098583040): created
  2026-07-30, status "Proposed", no milestones, no flag name, no intent thread.
  Summary: "Exposes the Prompt JavaScript Web APIs on Chrome for Android
  (Clank)."
- The OS-level model exists on both phones for native apps: ML Kit's GenAI
  device list (last updated 2026-09-28) puts the Pixel 10 Pro under `nano-v3`
  and the Galaxy Z Fold8 Ultra under `nano-v4`. ML Kit is an Android-native
  SDK; a web page cannot call it.

**Unconfirmed:** when the Android Prompt API ships, which devices it will
accept, and whether it will keep the desktop download and hardware rules. No
primary source gives a date or a device list.

### Structured output, for when it lands

The desktop API takes a JSON Schema: "pass the JSON Schema as an argument to the
`prompt()` or the `promptStreaming()` methods' options object as the value of a
`responseConstraint` field", "available as of Chrome version 137". chromestatus
describes it as "response constraints ensure that generated text conforms with
predefined regex and JSON schema formats". Whether the Android implementation
supports `responseConstraint` is **unconfirmed**.

### What this means for the Spec

The map prefers a browser-provided model when available. It is not available on
either target phone today, so the feature cannot depend on it. The cheap way to
honour the preference is a seam: detect `'LanguageModel' in self` and
`LanguageModel.availability()` at runtime, use it when present, and otherwise
use the shipped model. That keeps the download prompt off phones that gain the
API later.

## Route 2: models we ship

### WebGPU on the two phones

- Chrome docs: WebGPU is on by default "in Chrome 121 on devices running Android
  12 and greater powered by Qualcomm and ARM GPUs".
- gpuweb Implementation Status wiki (edited 2026-10-02), Chromium on Android:
  "ARM/Qualcomm/Intel, Android 12+: 121", "Imagination, Android 16+: 139",
  "Samsung Xclipse, Android 12+: TBD".
- So both GPU families the phones are reported to use are covered by default,
  with no flag. Subject to the GPU-vendor caveat above.

**Needs a device:** per-tab GPU memory actually available, `shader-f16` support
(required by every `f16` build below), and `maxBufferSize` /
`maxStorageBufferBindingSize`. No primary source documents these for either
phone.

### Runtimes

| Runtime | Version (date) | Licence | Backend | Schema-constrained output | Notes |
| --- | --- | --- | --- | --- | --- |
| Transformers.js (`@huggingface/transformers`) | 4.3.0 (2026-09-16) | Apache-2.0 | ONNX Runtime Web, `device: 'webgpu'` | Yes, via `@huggingface/transformers-structured-output` 4.3.0: JSON Schema, JSON object or regex as a `logits_processor`. README calls it "Experimental". | Same runtime runs Whisper in the browser, so one runtime could serve both halves of Voice Fill. |
| WebLLM (`@mlc-ai/web-llm`) | 0.2.85 (2026-09-08) | Apache-2.0 | WebGPU only (TVM/MLC) | Yes, built in: `response_format` of type `json_object` with a `schema`, `grammar` (EBNF) or `structural_tag`; XGrammar. | Prebuilt model list with per-model VRAM figures. Open Android bugs, see below. |
| LiteRT-LM JS (`@litert-lm/core`) | 0.17.1 (2026-09-16) | Apache-2.0 | WebGPU | Only through tool calling: `ConversationConfig.enableConstrainedDecoding` constrains tool-call output. No general JSON-schema response option is documented. | "early preview", "text-in / text-out". Supports exactly two models: Gemma 4 E2B and E4B web builds. |
| MediaPipe LLM Inference (`@mediapipe/tasks-genai`) | 0.10.29 (2026-07-08) | Apache-2.0 | WebGPU | None documented | "maintenance-only mode"; Google recommends migrating to LiteRT-LM JS. Not a candidate for new work. |
| wllama (`@wllama/wllama`) | 3.8.1 (2026-10-02) | MIT | llama.cpp in WASM (SIMD), WebGPU since v3 | Yes: `grammar` (GBNF string) sampling option | 2 GB per-file limit; multi-threading needs COOP/COEP headers on our frontend. Fallback if WebGPU routes fail. |

Details behind the table:

- **WebLLM constrained output** is in `src/openai_api_protocols/chat_completion.ts`
  (`ResponseFormat`). It carries a warning worth copying into the Spec: when
  using JSON mode "you **must** also instruct the model to produce JSON
  following the schema ... Without this, the model may generate an unending
  stream of whitespace until the generation reaches the token limit".
- **Transformers.js constrained output** supports "a practical JSON Schema
  2020-12 profile" including `enum`, `const`, numeric bounds and nested objects.
  String `pattern` and `format` are rejected. It handles one sequence at a time,
  which is all Voice Fill needs.
- **LiteRT-LM JS**: declaring one tool whose parameters are the screen's fields
  would give a constrained arguments object, which is the JSON we want. That is
  a reading of the types, not a documented recipe. An open issue
  (google-ai-edge/LiteRT-LM #2434, opened 2026-06-02) reports the web SDK
  failing with "Invalid token at state 201" on the second decode round after a
  tool response when constrained decoding is on. Voice Fill needs only the first
  round, so it may not be hit. **Needs a prototype.**
- **MediaPipe** could run the smaller Gemma 3 1B (`gemma3-1b-it-int4-web.task`,
  667 MB), but that file is gated (anonymous download returns 401, see probes),
  it is under the Gemma licence, the runtime is in maintenance, and it has no
  constrained output. Ruled out.

### Models, sizes and licences

Sizes are from the Hugging Face API on 2026-10-02 (`?blobs=true`, bytes to MiB).
"Anonymous" means an unauthenticated request for a file returned 200, which is
what a browser pulling from a public model host needs.

| Runtime | Model build | Download | Licence (upstream card) | Anonymous | Runtime's stated GPU memory |
| --- | --- | --- | --- | --- | --- |
| WebLLM | `Qwen3.5-0.8B-q4f16_1-MLC` | 426 MB | Apache-2.0 | yes | 1629 MB |
| WebLLM | `Qwen3-1.7B-q4f16_1-MLC` | 938 MB | Apache-2.0 | yes | 2037 MB |
| WebLLM | `Qwen3.5-2B-q4f16_1-MLC` | 1032 MB | Apache-2.0 | yes | 2245 MB (not flagged low-resource) |
| WebLLM | `gemma3-1b-it-q4f16_1-MLC` | 574 MB | Gemma terms | yes | 711 MB |
| WebLLM | `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | 921 MB | Apache-2.0 | not probed | 1774 MB |
| WebLLM | `Llama-3.2-3B-Instruct-q4f16_1-MLC` | 1732 MB | Llama 3.2 Community | yes | 2264 MB |
| Transformers.js | `onnx-community/Qwen3.5-0.8B-ONNX` q4f16 | about 560 MB (decoder 416 + embeddings 140), plus 59 MB vision encoder if it must load | Apache-2.0 | yes | not stated |
| Transformers.js | `onnx-community/Qwen3-1.7B-ONNX` q4f16 | 1360 MB | Apache-2.0 | not probed | not stated |
| Transformers.js | `onnx-community/Qwen3.5-2B-ONNX` q4f16 | about 1320 MB (1039 + 280), plus 187 MB vision encoder if it must load | Apache-2.0 | not probed | not stated |
| Transformers.js | `onnx-community/gemma-3-1b-it-ONNX-GQA` q4f16 | 727 MB | Gemma terms | yes | not stated |
| Transformers.js | `onnx-community/LFM2-1.2B-ONNX` q4f16 | 725 MB | LFM Open License v1.0 (custom) | not probed | not stated |
| Transformers.js | `onnx-community/gemma-4-E2B-it-ONNX` q4f16 | about 2970 MB (decoder 1449 + embeddings 1517) | Apache-2.0 | not probed | not stated |
| LiteRT-LM JS | `gemma-4-E2B-it-web.litertlm` | 1915 MB | Apache-2.0 | yes | about 1800 MB (M4 Max) |
| LiteRT-LM JS | `gemma-4-E4B-it-web.litertlm` | 2831 MB | Apache-2.0 | not probed | not stated |

Reading the table against the 2 GB bar:

- Gemma 4 E4B (LiteRT) and Gemma 4 E2B in ONNX form are over budget on their
  own. Out.
- Gemma 4 E2B web (LiteRT) leaves about 130 MB for speech-to-text. It passes
  only if the speech-to-text ticket lands on a browser-provided recogniser or a
  very small model.
- The Qwen builds leave 0.5 to 1.6 GB for speech-to-text.
- Licence: Apache-2.0 models (Qwen3, Qwen3.5, SmolLM2, Gemma 4) carry no
  use conditions that matter for a site that only links to the weights. Gemma 3 and Llama 3.2 carry their own terms, and
  their upstream repos are gated; avoid them when an Apache model does the job.
- WebLLM's `vram_required_MB` is the runtime's own estimate in
  `src/config.ts` at `fa722107`. It is larger than the download because it
  includes the KV cache for a 4096-token context.

**Unconfirmed:** whether Transformers.js needs to download the Qwen3.5 vision
encoder for text-only use (the model card's example loads it); the Qwen3.5-2B
ONNX repo has no `transformers.js` tag, although its 0.8B sibling's card shows
Transformers.js usage via `Qwen3_5ForConditionalGeneration` and
`@huggingface/transformers@next`. Qwen3 and Qwen3.5 are reasoning-capable
models; turning thinking off for extraction is a prototype detail.

### Latency against the 15-second bar

What the job costs (an estimate, not a source): a 300-word Ramble is roughly 400
tokens; the instructions plus the screen's field contract add a few hundred; the
JSON reply is roughly 50 to 150 tokens. So about 700 to 1000 tokens of prefill
and up to 150 of decode, plus model load if the model is not already in GPU
memory. Load can start when the user taps the button, so it overlaps the Ramble
itself.

Documented figures:

- LiteRT-LM model card, Gemma 4 E2B: Samsung S26 Ultra **native** GPU, prefill
  3,808 tok/s, decode 52.1 tok/s, time to first token 0.3 s; **web** on a
  MacBook Pro M4 Max, prefill 4,853 tok/s, decode 73 tok/s, time to first token
  1.09 s, GPU memory about 1800 MB. At anything near those rates the job takes a
  few seconds. There is no figure for WebGPU in Chrome on a phone.
- WebLLM, Transformers.js and wllama publish no phone figures.

User reports from the runtimes' own trackers (not vendor statements, not our
devices):

- mlc-ai/web-llm #759 (open, 2026-01-03): Pixel 8 Pro, Llama 3.2 3B q4f16,
  "prefill: 5.38 tok/s, decoding: 5.08 tok/s", with a 148-token prompt taking 20
  s or more. At that prefill rate a full Ramble would take minutes. The reporter
  says switching to 1B / 1.7B Qwen gave similar results.
- mlc-ai/web-llm #836 (open, 2026-06-21): engine init fails with
  `VK_ERROR_DEVICE_LOST` on Qualcomm Adreno GPUs (Adreno 6xx on Android 10 and
  Adreno 810 on Android 16, Chrome about 149). A collaborator notes 0.2.79
  appears to work and 0.2.80+ fails. Unresolved. The Fold is reported to have an
  Adreno GPU.
- mlc-ai/web-llm #722 (open): `CreateComputePipelines failed with
  VK_ERROR_UNKNOWN` on Android Chrome; a collaborator's reply is "I believe
  WebLLM should work on mobile Chrome".
- huggingface/transformers.js #1205 (closed 2026-02-09): a WebGPU crash on
  Android Chrome 133 with a small vision model; fp16 embeddings were not
  supported on that device.

**Nothing documented says any pairing meets 15 s on a Pixel 10 Pro or a Galaxy
Z Fold8 Ultra.** This is the main thing the real-phone run has to settle.

## Ranked shortlist

Ranked by how likely each is to clear both bars on both phones, given only what
is documented. All three are Apache-2.0 end to end and download anonymously.

1. **Transformers.js 4.3 + Qwen3.5-2B ONNX (q4f16), stepping down to
   Qwen3-1.7B or Qwen3.5-0.8B if it is slow.** About 1.3 GB (0.56 GB for 0.8B),
   so it leaves real room for speech-to-text. First-party JSON-Schema
   constraint. The same runtime runs Whisper, so Voice Fill might need one
   runtime, not two. Weakness: the constraint package is "experimental", there
   are no phone performance figures, and Qwen3.5 support is recent.
2. **WebLLM 0.2.85 + Qwen3-1.7B (q4f16).** 938 MB. The most mature constrained
   output of the three (JSON Schema and EBNF, in WASM). Weakness: the open
   Adreno init crash and the Pixel prefill report both point at exactly our two
   device families. Worth one run because, if it works, it is the simplest
   integration. If 0.2.85 crashes on the Fold, try 0.2.79 before giving up on
   it.
3. **LiteRT-LM JS 0.17 + Gemma 4 E2B web.** The strongest model here and the
   only one with vendor benchmarks, from Google's own stack. Weakness: 1915 MB
   eats the download budget, the runtime is an early preview, and constrained
   JSON comes only through tool calling with an open web bug. Try it to learn
   the ceiling; it becomes the pick only if speech-to-text costs almost nothing
   to download.

Not on the list: the Prompt API (not on Android), MediaPipe LLM Inference
(maintenance-only, gated model, no constraint), Gemma 4 E4B and Llama 3.2 3B
(size), wllama (kept as the fallback if WebGPU proves unusable on a phone, since
it can run on CPU and has grammar support; needs COOP/COEP headers for
threads).

## Documented versus needs a device

Documented (primary source cited above):

- Prompt API and relatives are not available in Chrome on Android, with no flag
  or origin trial; an Android implementation is planned on the OS-level model.
- Both phones have OS-level Gemini Nano for native apps.
- WebGPU is on by default in Android Chrome for Qualcomm/ARM (121) and
  Imagination on Android 16+ (139).
- Runtime versions, licences, constrained-output features, supported models.
- Download sizes, model licences, anonymous access for the probed files.
- RAM: 16 GB on the Pixel 10 Pro, 12 or 16 GB on the Fold.

Needs a device, or is otherwise unconfirmed:

- GPU vendor and `shader-f16` / buffer limits on each phone (webgpureport.org).
- Whether each candidate loads at all in Chrome on each phone (WebLLM has open
  crash reports on Adreno).
- Prefill and decode speed, and therefore the 15-second bar, for every
  candidate.
- Peak memory and whether Chrome kills the tab with a 1 to 2 GB model plus a
  speech-to-text model loaded.
- JSON accuracy of a 0.8B to 2B model on real Rambles (constraint guarantees
  shape, not correctness).
- LiteRT-LM JS tool-call constrained decoding for a single-shot extraction.
- Whether Transformers.js fetches the Qwen3.5 vision encoder for text-only use.
- Date and device list for the Prompt API on Android.

## Live probes

Run on 2026-10-02.

```bash
# Prompt API on chromestatus (desktop 148, android null) and the Android entry
curl -s https://chromestatus.com/api/v0/features/5134603979063296 | tail -c +6 | jq '.browsers.chrome'
curl -s https://chromestatus.com/api/v0/features/5888755098583040 | tail -c +6 | jq '{name, summary, created: .created.when, status: .browsers.chrome.status.text}'
# -> "Prompt API on Android", created 2026-07-30, "Proposed"

# Chromium source: flags are desktop-only, runtime feature has no Android status
curl -s "https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/about_flags.cc?format=TEXT" | base64 -d | grep -n -A2 '"prompt-api'
# -> {"prompt-api", ..., kOsDesktop, ...} (and the same for the other three)
curl -s "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/runtime_enabled_features.json5?format=TEXT" | base64 -d | grep -n -A9 'name: "AIPromptAPI"'
# -> status: { "Win": "stable", "Mac": "stable", "Linux": "stable", "ChromeOS": "stable", "default": "" }

# Anonymous download (HTTP status of an unauthenticated HEAD, following redirects)
# 401 litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4-web.task
# 200 litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm
# 200 mlc-ai/gemma3-1b-it-q4f16_1-MLC/resolve/main/mlc-chat-config.json
# 200 mlc-ai/Qwen3-1.7B-q4f16_1-MLC/resolve/main/mlc-chat-config.json
# 200 mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json
# 200 onnx-community/gemma-3-1b-it-ONNX-GQA/resolve/main/config.json
# 200 onnx-community/Qwen3.5-0.8B-ONNX/resolve/main/config.json

# Sizes and licences
curl -s "https://huggingface.co/api/models/<repo>?blobs=true" | jq '.cardData.license, [.siblings[].size] | add'

# Runtime versions
curl -s https://registry.npmjs.org/@mlc-ai/web-llm | jq '."dist-tags".latest'            # 0.2.85
curl -s https://registry.npmjs.org/@huggingface/transformers | jq '."dist-tags".latest'  # 4.3.0
curl -s https://registry.npmjs.org/@litert-lm/core | jq '."dist-tags".latest'            # 0.17.1
curl -s https://registry.npmjs.org/@wllama/wllama | jq '."dist-tags".latest'             # 3.8.1
```

## Sources

Chrome built-in AI:

- <https://developer.chrome.com/docs/ai/prompt-api> (last updated 2026-08-26)
- <https://developer.chrome.com/docs/ai/get-started>
- <https://developer.chrome.com/docs/ai/structured-output-for-prompt-api> (last
  updated 2025-05-13)
- <https://chromestatus.com/feature/5134603979063296> (Prompt API)
- <https://chromestatus.com/feature/5888755098583040> (Prompt API on Android)
- Intent to Ship: Prompt API, blink-dev, 2026-04-01:
  <https://groups.google.com/a/chromium.org/d/msgid/blink-dev/CAJcT_Zj73wjXZfmMcpQRWePp-H%3D5LzxYBOnasViYcn%3DFzY2vVQ%40mail.gmail.com>
- Chromium `main` at `f9a17e4486732812967652de7d35291f1747485d`:
  `chrome/browser/about_flags.cc`,
  `third_party/blink/renderer/platform/runtime_enabled_features.json5`
- <https://developers.google.com/ml-kit/genai> (last updated 2026-09-28)

WebGPU and devices:

- <https://developer.chrome.com/docs/web-platform/webgpu/overview>
- <https://github.com/gpuweb/gpuweb/wiki/Implementation-Status>
- <https://store.google.com/product/pixel_10_pro_specs>
- <https://news.samsung.com/global/samsung-galaxy-z-fold8-ultra-fold8-and-flip8foldables-perfected-for-every-way-of-living>

Runtimes:

- WebLLM: <https://github.com/mlc-ai/web-llm> at `fa722107` (`README.md`,
  `src/config.ts`, `src/openai_api_protocols/chat_completion.ts`); issues
  [#836](https://github.com/mlc-ai/web-llm/issues/836),
  [#759](https://github.com/mlc-ai/web-llm/issues/759),
  [#722](https://github.com/mlc-ai/web-llm/issues/722)
- Transformers.js: <https://huggingface.co/docs/transformers.js/guides/webgpu>;
  <https://github.com/huggingface/transformers.js> at `836b9cb1`
  (`packages/transformers-structured-output/README.md`); issue
  [#1205](https://github.com/huggingface/transformers.js/issues/1205)
- LiteRT-LM JS: <https://developers.google.com/edge/litert-lm/js> (last updated
  2026-09-04); <https://github.com/google-ai-edge/LiteRT-LM> at `400273c4`
  (`js/packages/core/README.md`, `js/packages/core/src/conversation_config.ts`);
  issue [#2434](https://github.com/google-ai-edge/LiteRT-LM/issues/2434)
- MediaPipe LLM Inference for web:
  <https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js>
  (last updated 2026-06-12)
- wllama: <https://github.com/ngxson/wllama> at `7ed17361` (`README.md`,
  `src/types/types.ts`)

Models (Hugging Face, queried 2026-10-02):

- <https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm> (sizes,
  benchmark tables)
- <https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm>
- <https://huggingface.co/litert-community/Gemma3-1B-IT>
- `mlc-ai/*-MLC` repos named in the table
- `onnx-community/*-ONNX` repos named in the table
- Upstream licence fields: `Qwen/Qwen3-1.7B`, `Qwen/Qwen3.5-0.8B`,
  `Qwen/Qwen3.5-2B`, `google/gemma-3-1b-it`, `google/gemma-4-E2B-it`,
  `meta-llama/Llama-3.2-3B-Instruct`, `HuggingFaceTB/SmolLM2-1.7B-Instruct`,
  `LiquidAI/LFM2-1.2B`
