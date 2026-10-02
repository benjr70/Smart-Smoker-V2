# Chrome on Android has no on-device Web Speech mode; a shipped Moonshine or Whisper model is the only local route

Ticket: [#689](https://github.com/benjr70/Smart-Smoker-V2/issues/689) (part of
wayfinder map
[#687](https://github.com/benjr70/Smart-Smoker-V2/issues/687) — Voice Fill:
speak a Ramble to fill the smoke screens). Researched on 2026-10-02.

Sources: the Web Speech API draft (webaudio.github.io, dated 2026-09-18);
Chromium `main` source read on 2026-10-02 (`SpeechRecognitionImpl.java`,
`speech_recognition_manager_impl.cc`, `on_device_speech_recognition_impl.cc`,
`speech_recognition.cc`, `speech_recognition.idl`,
`runtime_enabled_features.json5`, `media_switches.cc`); Chrome Platform Status
API; MDN and `mdn/browser-compat-data`; the Android `SpeechRecognizer`
reference; Chrome's Prompt API and WebGPU docs; the gpuweb Implementation
Status wiki; the transformers.js docs and source; the ONNX Runtime Web docs; the
Hugging Face model API; the Moonshine repo, docs, npm package and CDN; the
whisper.cpp and openai/whisper repos. Live probes (commands and output) are
reproduced in [Live probes](#live-probes).

## TL;DR

- **Browser-provided recognition cannot meet the on-device constraint on
  Android.** The on-device Web Speech API (`processLocally`, `available()`,
  `install()`) is desktop-only: Chrome Platform Status lists desktop 139 and no
  Android milestone, MDN's compat data marks all three `false` for Chrome
  Android, and Chromium `main` hard-codes `available()` to `"unavailable"` and
  `install()` to `false` under `IS_ANDROID`.
- **Plain `SpeechRecognition` on Android hands the audio to a Google system
  app.** Chrome binds Android's `SpeechRecognizer` to
  `com.google.android.tts` (Android 12+) and passes only language, continuous
  and interim flags. Android documents that API as "likely to stream audio to
  remote servers". The page cannot request local processing and gets no signal
  about where recognition ran, so it cannot verify it either.
- **Chrome's built-in Gemini Nano audio input is not available on Android**
  (Prompt API docs, updated 2026-08-26), so it is not a route either.
- **Shipping a model is therefore the only route**, and it fits the size budget
  easily: every credible English model is 45 to 400 MB, against a 2 GB budget
  shared with the LLM.
- **The 15-second bar is the hard one, and no primary source measures any of
  these models on a Pixel 10 Pro or a Snapdragon 8 Elite Gen 5 in Chrome.** The
  only documented in-browser figure is whisper.cpp's "x2 or x3 real-time" for
  tiny and base on a desktop CPU, which would spend 40 to 60 seconds on a
  two-minute Ramble if run after the recording ends. Transcribing while the
  user is still speaking removes most of that cost from the budget; that is
  what the streaming models are built for.
- **Shortlist to try on the phones**: (1) Moonshine Small Streaming through
  `@moonshine-ai/moonshine-wasm`; (2) Whisper `base.en` through transformers.js
  on WebGPU with a WASM fallback; (3) Moonshine Base through transformers.js.
- **Cooking vocabulary**: nothing published measures it. The only biasing
  mechanism available to a page on Android is Moonshine's key-terms list
  (streaming models only). Web Speech `phrases` is desktop-only and the
  transformers.js speech pipeline exposes no prompt option.
- **Unconfirmed, needs a device**: real-time factor of each candidate on both
  phones; whether WebGPU is actually exposed on the Pixel 10 Pro; how each
  model writes spoken numbers and cook terms; whether Google's system
  recogniser happens to run offline on these phones.

## Route 1: browser-provided recognition

### What the standard offers

The Web Speech API draft (Draft Community Group Report, 18 September 2026)
defines an on-device mode
([spec](https://webaudio.github.io/web-speech-api/)):

- `SpeechRecognition.processLocally`: when `true` it "indicates a requirement
  that the speech recognition process MUST be performed locally on the user's
  device"; when `false`, "the user agent can choose between local and remote
  processing".
- `SpeechRecognition.available({ langs, processLocally })` resolves to
  `"unavailable"`, `"downloadable"`, `"downloading"` or `"available"`. It is
  gated behind the `on-device-speech-recognition` permissions policy (default
  allowlist `self`).
- `SpeechRecognition.install({ langs })` downloads a language pack and resolves
  to a boolean.
- `SpeechRecognition.phrases` (`SpeechRecognitionPhrase(phrase, boost)`, boost
  0.0 to 10.0) biases recognition toward listed phrases; an engine that cannot
  do it raises `phrases-not-supported`.
- A `start()` with `processLocally = true` and no installed pack fails with
  `language-not-supported`
  ([MDN, Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API),
  last modified 2026-08-31).

This is how a page would request and detect local recognition: check
`available()`, call `install()` if `"downloadable"`, set `processLocally = true`,
and treat a `language-not-supported` error as "not local, do not proceed".

### Where Chrome implements it: desktop only

| Evidence | Finding |
| --- | --- |
| Chrome Platform Status, feature [6090916291674112](https://chromestatus.com/feature/6090916291674112) "On-device Web Speech API" (API read 2026-10-02) | `desktop: 139`, `android: null`, `webview: null`. Summary: lets "websites ... ensure that neither audio nor transcribed speech are sent to a third-party service". |
| Chrome Platform Status, [5225615177023488](https://chromestatus.com/feature/5225615177023488) "Web Speech API contextual biasing" | `desktop: 142`, `android: null`. |
| Chrome Platform Status, [5136859632107520](https://chromestatus.com/feature/5136859632107520) "On-Device Recognition Quality" | `desktop: 150`, `android: null`. |
| [`mdn/browser-compat-data` `api/SpeechRecognition.json`](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json) (last commit 2026-09-22) | `available_static`, `install_static`, `processLocally`: Chrome 139, Chrome Android `false`. `phrases`: Chrome 142, Chrome Android `false`. `start(audioTrack)`: Chrome 135, Chrome Android `false`. |
| Chromium [`chrome/browser/speech/on_device_speech_recognition_impl.cc`](https://github.com/chromium/chromium/blob/main/chrome/browser/speech/on_device_speech_recognition_impl.cc) (last commit 2026-09-18) | `Available()` under `#if BUILDFLAG(IS_ANDROID)` runs the callback with `AvailabilityStatus::kUnavailable`; `Install()` runs it with `false`. No other Android branch. |
| Chromium [`content/browser/speech/speech_recognition_manager_impl.cc`](https://github.com/chromium/chromium/blob/main/content/browser/speech/speech_recognition_manager_impl.cc) (last commit 2026-09-29) | `UseOnDeviceSpeechRecognition()` returns `false` on Android and Fuchsia. The on-device engines (SODA, Gemini Nano, the small expert model) are included only when `!IS_ANDROID`. |

The JavaScript surface does exist on Android: `OnDeviceWebSpeechAvailable` and
`InstallOnDeviceSpeechRecognition` are `status: "stable"` on every platform in
[`runtime_enabled_features.json5`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/runtime_enabled_features.json5),
so `'available' in SpeechRecognition` is not a usable test. The answer is in
the resolved value. Reading
[`speech_recognition.cc`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/speech/speech_recognition.cc)
(last commit 2026-09-22), `start()` with `processLocally = true` and a `lang`
set first asks the browser for on-device availability and fires
`language-not-supported` unless the status is `available`. On Android that
status is always `unavailable`, so the call fails closed.

One trap in that same function: the availability check is skipped when `lang`
is unset (`if (process_locally_ && lang_)`), and the code falls through to the
ordinary start path. On Android the ordinary path is the system recogniser
described below. A page relying on `processLocally` as a guard must always set
`lang`.

These are readings of Chromium `main`. The current Android stable is
154.0.8037.94 (chromiumdash, 2026-10-02); the branch that shipped it was not
read separately. **Unconfirmed on the devices**: the actual value of
`await SpeechRecognition.available({ langs: ['en-US'], processLocally: true })`
on the two phones. It takes one line in the remote DevTools console and is
worth running once, because the map prefers a browser-provided model whenever
one exists.

### What plain `SpeechRecognition` does on Android

Chrome on Android does not run a recogniser of its own. Per
[`SpeechRecognitionImpl.java`](https://github.com/chromium/chromium/blob/main/content/public/android/java/src/org/chromium/content/browser/SpeechRecognitionImpl.java)
(last commit 2026-07-01):

- It looks up a `RecognitionService` from a Google package: on Android 12 and
  later `com.google.android.tts`, on older versions
  `com.google.android.googlequicksearchbox`.
- It creates the recogniser with
  `SpeechRecognizer.createSpeechRecognizer(context, provider)`. It never calls
  `createOnDeviceSpeechRecognizer`.
- `startRecognition` sets exactly three extras: `DICTATION_MODE` (continuous),
  `EXTRA_LANGUAGE` and `EXTRA_PARTIAL_RESULTS`. There is no
  `EXTRA_PREFER_OFFLINE`, and `processLocally` is not passed across the JNI
  boundary
  ([`speech_recognizer_impl_android.cc`](https://github.com/chromium/chromium/blob/main/content/browser/speech/speech_recognizer_impl_android.cc)
  forwards language, continuous and interim results only).

Android's own documentation for that API says: "The implementation of this API
is likely to stream audio to remote servers to perform speech recognition"
([`SpeechRecognizer` reference](https://developer.android.com/reference/android/speech/SpeechRecognizer)).
MDN repeats the consequence for Chrome: "using Speech Recognition on a web page
involves a server-based recognition engine. Your audio is sent to a web service
for recognition processing, so it won't work offline"
([MDN `SpeechRecognition`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition),
last modified 2026-08-19).

So, answering the ticket's four sub-questions for Chrome on Android:

| Question | Answer |
| --- | --- |
| When does audio leave the device? | Whenever Google's system recognition service decides to. Chrome hands it the microphone session and expresses no preference. |
| Is there an on-device mode? | Not one a page can select. The spec's mode is not implemented on Android. |
| How is it requested and detected? | `processLocally = true` plus `available()`; on Android both report that it is not available. |
| Can a page verify recognition stayed local? | No. The result events carry no provenance, and the only guarantee in the platform is the `processLocally` requirement, which Android cannot satisfy. |

**Unconfirmed**: whether `com.google.android.tts` recognises fully offline on a
Pixel 10 Pro or a Galaxy Fold 8 Ultra when an offline English pack is
installed. No primary source states it, and even if it does the page could
neither require nor prove it, so it does not satisfy a hard on-device
constraint. Two further limits apply to this path regardless: recognition is
ended when the page is not visible ("On Android, background speech recognition
is not permitted", `speech_recognition_manager_impl.cc`), and contextual
biasing is unavailable.

### Chrome's built-in model is not a substitute

The Prompt API accepts audio input and Chrome's docs name transcription as a
use, but "Chrome for Android, iOS, and ChromeOS on non-Chromebook Plus devices
are not yet supported by the APIs which use foundation models"
([Prompt API](https://developer.chrome.com/docs/ai/prompt-api), updated
2026-08-26).

## Route 2: models we ship

### What the phones give a page to run on

| Capability | Documented fact | Source |
| --- | --- | --- |
| WebGPU on Qualcomm (Galaxy Fold 8 Ultra) | Enabled by default since Chrome 121 on Android 12+ for ARM, Qualcomm and Intel GPUs. | [gpuweb Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) (edited 2026-10-02); [Chrome WebGPU overview](https://developer.chrome.com/docs/web-platform/webgpu/overview) |
| WebGPU on Imagination (Pixel 10 Pro) | "Imagination, Android 16+: 139". | gpuweb Implementation Status |
| ONNX Runtime Web WebGPU provider | "available out-of-box in latest versions of Chrome and Edge on Windows, macOS, Android and ChromeOS". | [ORT WebGPU EP](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) |
| Threaded WASM | "Only when the browser supports WebAssembly multi-threading and `crossOriginIsolated` mode is enabled, multi-threading will be enabled." | [ORT env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) |

Device facts that are **not** confirmed from a first-party page: that the
Pixel 10 Pro's GPU is an Imagination PowerVR part (press coverage says Tensor
G5 with a PowerVR DXT-48-1536; Google's spec page did not load in this
session). Samsung's product page confirms "Snapdragon 8 Elite Gen 5 for Galaxy"
for the
[Galaxy Z Fold8 Ultra](https://www.samsung.com/us/smartphones/galaxy-z-fold8-ultra/).
Neither matters for the decision: `navigator.gpu.requestAdapter()` on each
phone is the real test, and every candidate below has a CPU path.

Cross-origin isolation is the repo-facing consequence. Threaded WASM needs
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on the frontend's responses.
Whether those headers are safe for `apps/frontend` is the subject of sibling
ticket [Model delivery, storage and caching in the browser](https://github.com/benjr70/Smart-Smoker-V2/issues/690).

### Candidates

Sizes are bytes on the wire for the files a browser would fetch, from the
Hugging Face API or a `HEAD` against the model CDN on 2026-10-02.

| Candidate | Runtime | Download | Accuracy (published) | Licence | Backend |
| --- | --- | --- | --- | --- | --- |
| Moonshine Tiny Streaming (34 M params) | `@moonshine-ai/moonshine-wasm` 0.1.5 | 43 to 74 MB | 12.00% WER (Open ASR Leaderboard average) | MIT | WASM, CPU |
| Moonshine Small Streaming (123 M) | same | 136 to 214 MB | 7.84% | MIT | WASM, CPU |
| Moonshine Medium Streaming (245 M) | same | 257 to 397 MB | 6.65% | MIT | WASM, CPU |
| Moonshine Tiny (26 M), `onnx-community/moonshine-tiny-ONNX` | transformers.js 4.3.0 | 27 MB (q8) to 104 MB (fp32) | 12.66% | MIT | WebGPU or WASM |
| Moonshine Base (58 M), `onnx-community/moonshine-base-ONNX` | same | 60 MB (q8) to 236 MB (fp32) | 10.07% | MIT | WebGPU or WASM |
| Whisper `tiny.en` (39 M), `onnx-community/whisper-tiny.en` | same | 39 MB (q8) to 145 MB (fp32) | 8.44% (LibriSpeech test-clean only) | MIT (weights and code), Apache-2.0 (transformers.js) | WebGPU or WASM |
| Whisper `base.en` (74 M), `onnx-community/whisper-base.en` | same | 73 MB (q8) to 278 MB (fp32) | not in model metadata | same | WebGPU or WASM |
| Whisper `small.en` (244 M), `onnx-community/whisper-small.en` | same | 238 MB (q8) to 923 MB (fp32) | not in model metadata | same | WebGPU or WASM |
| Whisper tiny/base/small via whisper.cpp `whisper.wasm` | whisper.cpp (ggml) | 75 / 142 / 466 MiB | as Whisper | MIT | WASM, CPU only |

Notes on the table:

- Moonshine streaming download ranges: the lower figure excludes the
  `decoder_kv_with_attention.ort` file, matching the file list Moonshine's own
  download docs show for Medium Streaming
  ([downloading-models.md](https://github.com/moonshine-ai/moonshine/blob/main/docs/using/downloading-models.md));
  the upper figure is every file in the catalogue for that model. Which set the
  browser binding fetches is **unconfirmed**; its `onProgress` callback reports
  `bytes.total`, so the first load on a phone settles it.
- Moonshine WER and parameter counts are from
  [Available Models](https://moonshine-voice.readthedocs.io/en/latest/models/available-models/),
  which notes they are measured "on the floating-point reference" and that
  "Quantized English scores are a little higher, especially at Tiny". The
  browser binding ships the quantized files.
- Whisper WER is the only figure present in the Hugging Face model-index for
  [`openai/whisper-tiny.en`](https://huggingface.co/openai/whisper-tiny.en). It
  is a different benchmark from the Moonshine column, so the two are **not
  comparable** row to row.
- transformers.js lets the encoder and decoder use different precisions because
  "encoder-decoder models, like Whisper ... are extremely sensitive to
  quantization settings: especially of the encoder"
  ([dtypes guide](https://huggingface.co/docs/transformers.js/guides/dtypes)).
  A full-precision encoder with a 4-bit decoder for `base.en` is 78.6 + 117.9 =
  197 MB.
- Licences: `openai/whisper` MIT, `ggml-org/whisper.cpp` MIT,
  `@huggingface/transformers` Apache-2.0, `onnxruntime-web` MIT (GitHub and npm
  registry metadata); Moonshine code and English models MIT ("The models are
  MIT by default too ... the only exceptions are the legacy non-streaming
  models for languages other than English",
  [Moonshine README](https://github.com/moonshine-ai/moonshine)).

Every row fits the size bar with at least 1.6 GB left for the LLM.

### Speed relative to real time

Documented:

- whisper.cpp in the browser: "you should be able to achieve x2 or x3 real-time
  for the `tiny` and `base` models on a modern CPU and browser"; models "up to
  size `small` inclusive"; "The maximum length of the audio is limited to 120
  seconds"; greedy sampling only
  ([whisper.wasm README](https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm)).
- Moonshine Tiny needs about a fifth of Whisper `tiny.en`'s compute on a
  10-second segment ("a 5x reduction in compute requirements ... while
  incurring no increase in word error rates",
  [arXiv 2410.15608](https://arxiv.org/abs/2410.15608)).
- Moonshine's streaming models are "Optimized for live streaming, with low
  latency by doing work while the user is still talking"
  ([Moonshine README](https://github.com/moonshine-ai/moonshine)); the v2 paper
  describes the encoder as giving "bounded, low-latency inference"
  ([arXiv 2602.12241](https://arxiv.org/abs/2602.12241)).
- OpenAI's relative speeds between Whisper sizes on a GPU: tiny ~10x, base ~7x,
  small ~4x of large
  ([openai/whisper](https://github.com/openai/whisper)). That orders the sizes;
  it says nothing about a phone.

**Not documented anywhere found**: a real-time factor for any of these models
in Chrome on a Pixel 10 Pro, a Snapdragon 8 Elite Gen 5, or any other Android
phone, on WebGPU or WASM. Every per-device speed in this area is something to
measure.

What the documented numbers imply for the 15-second bar (inference, not a
measurement): a two-minute Ramble transcribed after the recording stops at 2x
to 3x real time takes 40 to 60 seconds, which fails the bar before the LLM
starts. Either the recogniser must run at roughly 15x real time or better in
batch, or it must transcribe during the recording so that only the last few
seconds remain when the Ramble ends. The second option makes the bar depend on
keeping pace with speech (anything above 1x real time), which is a far easier
target on a phone CPU.

### WebGPU versus WASM

- In transformers.js WebGPU is opt-in with `device: 'webgpu'`, and its guide's
  speech example uses
  `onnx-community/whisper-tiny.en`
  ([WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu)).
  The guide calls WebGPU experimental and expects some models to fail there
  that run in WASM.
- `@moonshine-ai/moonshine-wasm` is CPU-only WASM, built on its own cut-down
  ONNX Runtime. "The default build enables SIMD + multithreading ... which
  needs `SharedArrayBuffer`", so the page must be cross-origin isolated;
  otherwise a single-threaded build has to be compiled from source
  ([npm README](https://www.npmjs.com/package/@moonshine-ai/moonshine-wasm),
  0.1.5 published 2026-08-24).
- whisper.cpp's browser build is CPU-only and requires WASM SIMD.
- ONNX Runtime Web's proxy worker "cannot work with WebGPU", so WebGPU inference
  has to be placed in a Web Worker by the application to keep the UI thread
  free
  ([ORT env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)).

A GPU path also competes with the LLM for the same GPU and memory if the LLM
runs on WebGPU; a CPU-only recogniser does not. That interaction is
**unconfirmed** and belongs to the real-phone run.

### Capturing audio and feeding it to the model

- Capture with `navigator.mediaDevices.getUserMedia({ audio: true })`. Both
  environments are secure contexts (map Notes), which `getUserMedia` requires
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)).
- The models take 16 kHz mono float PCM. `new AudioContext({ sampleRate: 16000 })`
  is allowed (the option accepts 8,000 to 96,000 Hz,
  [MDN `AudioContext()`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext))
  and makes the context deliver 16 kHz samples.
- transformers.js resamples only when given a URL. Its `prepareAudios` passes a
  `Float32Array` straight through
  ([`_base.js`](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/pipelines/_base.js)),
  so the caller must supply 16 kHz mono samples itself.
- Whisper works on 30-second windows ("a sliding 30-second window",
  [openai/whisper](https://github.com/openai/whisper)). In transformers.js that
  is `chunk_length_s: 30, stride_length_s: 5`; the default is no chunking
  ([pipelines API](https://huggingface.co/docs/transformers.js/api/pipelines)).
  A one-to-two-minute Ramble is three to five windows.
- The transformers.js Moonshine path does **no** chunking. `_call_moonshine`
  feeds the whole clip in one pass and caps output at six tokens per second of
  audio
  ([`automatic-speech-recognition.js`](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/pipelines/automatic-speech-recognition.js),
  last commit 2026-09-07). The model card warns that hallucination and
  repetition "may be worse for short audio segments, or segments where parts of
  words are cut off"
  ([`UsefulSensors/moonshine-base`](https://huggingface.co/UsefulSensors/moonshine-base)).
  Using the non-streaming Moonshine models on a two-minute Ramble therefore
  needs our own splitting at pauses. How a single two-minute pass behaves is
  **unconfirmed**.
- `@moonshine-ai/moonshine-wasm` owns the whole capture path: `MicTranscriber`
  opens the microphone (a voice-activity detector is the one model embedded in
  the `.wasm`) and emits `onText` (partial) and `onLine` (final) callbacks. A buffer API
  exists too: `transcriber.transcribe(float32Pcm, { sampleRate: 16000 })`.
  Models are fetched from `https://download.moonshine.ai` on first `load()` and
  kept in Cache Storage (`moonshine-models-v1`); `Transcriber.loadFromUrls`
  takes other URLs.

## Cooking vocabulary

No primary source measures any of these models on meat cuts, wood names, or
spoken temperatures and weights. What the sources do establish:

- **Biasing toward known terms exists in one candidate only.** Moonshine's
  streaming models accept a key-terms list (`setKeyterms([...])`, or
  `keyterms` at load). The default boost "removes about a quarter of the errors
  on the words you listed for at most a quarter of a point on everything else";
  "A hundred terms ... cost half a point, a thousand cost a point". It works
  "on words the model can already spell" and cannot create "a spelling the
  tokenizer cannot produce". "Only the streaming architectures support any of
  this; the older Tiny and Base models raise an error"
  ([Domain Customization](https://moonshine-voice.readthedocs.io/en/latest/models/domain-customization/)).
  The app's existing suggestion lists (meat types, wood types, probe names) are
  a ready-made key-terms list of well under a hundred entries.
- **Web Speech `phrases`** would do the same job but is desktop-only (above).
- **transformers.js** documents no prompt or vocabulary option for the speech
  pipeline: its parameters are `return_timestamps`, `chunk_length_s`,
  `stride_length_s`, `language`, `task`, `force_full_sequences`
  ([pipelines API](https://huggingface.co/docs/transformers.js/api/pipelines)).
- **whisper.cpp's browser example** exposes no prompt either (probe below).
- **Numbers**: whether "two twenty-five" comes back as `225`, `two twenty five`
  or `2:25`, and whether "twelve and a half pounds" keeps its fraction, is
  **unconfirmed** for every candidate. The extraction contract (sibling ticket
  [Per-screen extraction contract](https://github.com/benjr70/Smart-Smoker-V2/issues/692))
  should assume both spelled-out and digit forms reach the LLM.
- The map already routes out-of-list values to "kept as spoken" and unsure
  values to Notes, which bounds the damage of a misheard wood or cut.

Phrases worth putting in the phone test Rambles because they are the likely
failure cases: brisket, pork butt, spatchcock, tri-tip, burnt ends; hickory,
mesquite, pecan, post oak; "two twenty-five", "one ninety-five internal", "two
oh three"; "twelve and a half pounds"; "rest for forty-five minutes".

## Ranked shortlist for the real phones

1. **Moonshine Small Streaming via `@moonshine-ai/moonshine-wasm`.**
   - Documented: MIT; 136 to 214 MB; 7.84% leaderboard WER (float); transcribes
     while the user speaks; key-terms biasing; CPU-only, so no WebGPU
     dependence and no GPU contention with the LLM; own VAD and microphone
     handling; models served from a public CDN with `accept-ranges: bytes`.
   - Costs: needs cross-origin isolation for the threaded build; the package is
     young (0.1.5, 2026-08-24); model host is the vendor's CDN, not Hugging
     Face.
   - Needs a device: that it keeps pace with speech on both phones; exact
     download size; quantized accuracy on cook terms with and without key
     terms; behaviour over a full two minutes. Step down to Tiny Streaming if
     it cannot keep up, up to Medium Streaming if it has headroom.
2. **Whisper `base.en` via transformers.js 4.x on WebGPU, WASM fallback.**
   - Documented: MIT weights, Apache-2.0 runtime; 73 to 278 MB depending on
     precision; first-class transformers.js support with 30-second chunking;
     WebGPU is on by default in Chrome on Android for Qualcomm GPUs and, from
     Chrome 139 on Android 16, Imagination GPUs; files on Hugging Face. If the LLM also runs on transformers.js this adds no second
     runtime.
   - Costs: no vocabulary biasing; batch by design, so it must either be fast
     enough after the fact or be driven window by window during recording by
     our own code.
   - Needs a device: real-time factor on WebGPU and on WASM; whether WebGPU
     initialises on the Pixel 10 Pro; whether `small.en` (238 to 923 MB) is
     fast enough to be worth its accuracy.
3. **Moonshine Base via transformers.js (`onnx-community/moonshine-base-ONNX`).**
   - Documented: MIT; 60 to 236 MB; same runtime as candidate 2, so trying it
     is a model-id change; compute scales with clip length rather than a fixed
     30-second window.
   - Costs: no chunking in the pipeline, no key-terms support on the
     non-streaming models.
   - Needs a device: speed; behaviour on a single long clip versus clips split
     at pauses.

Not shortlisted: **whisper.cpp WASM** (CPU-only, its one documented speed
figure fails the 15-second bar for a two-minute Ramble, and its example caps
audio at 120 seconds, the top of our range); **Web Speech API** (cannot be held
on-device on Android); **Prompt API audio** (not on Android).

One cheap check belongs beside the shortlist rather than in it: run
`SpeechRecognition.available({ langs: ['en-US'], processLocally: true })` on
both phones. Source says it resolves `"unavailable"`. If a phone ever reports
otherwise, the browser-provided route reopens and, per the map, would be
preferred.

## Live probes

Run on 2026-10-02.

Chrome Platform Status:

```
$ curl -s "https://chromestatus.com/api/v0/features?q=on-device%20web%20speech" | sed "1s/^)]}'//" | jq -r '.features[] | "\(.id) | \(.name) | desktop=\(.browsers.chrome.desktop) android=\(.browsers.chrome.android)"'
4785284026859520 | Web Speech API: Unspoken Punctuation | desktop=151 android=null
5136859632107520 | Web Speech API: On-Device Recognition Quality | desktop=150 android=null
5225615177023488 | Web Speech API contextual biasing | desktop=142 android=null
6090916291674112 | On-device Web Speech API | desktop=139 android=null
```

MDN compat data (`api/SpeechRecognition.json`):

```
available_static: chrome={"version_added":"139"} chrome_android={"version_added":false}
install_static:   chrome={"version_added":"139"} chrome_android={"version_added":false}
processLocally:   chrome={"version_added":"139"} chrome_android={"version_added":false}
phrases:          chrome={"version_added":"142"} chrome_android={"version_added":false}
```

Chromium `chrome/browser/speech/on_device_speech_recognition_impl.cc`:

```
void OnDeviceSpeechRecognitionImpl::Available(...) {
#if BUILDFLAG(IS_ANDROID)
  std::move(callback).Run(media::mojom::AvailabilityStatus::kUnavailable);
#else
...
void OnDeviceSpeechRecognitionImpl::Install(...) {
#if BUILDFLAG(IS_ANDROID)
  std::move(callback).Run(false);
#else
```

Chromium `content/browser/speech/speech_recognition_manager_impl.cc`:

```
bool SpeechRecognitionManagerImpl::UseOnDeviceSpeechRecognition(
    const SpeechRecognitionSessionConfig& config) {
#if !BUILDFLAG(IS_FUCHSIA) && !BUILDFLAG(IS_ANDROID)
  return config.on_device &&
         (config.on_device_available || !config.allow_cloud_fallback);
#else
  return false;
#endif
}
```

Chromium `SpeechRecognitionImpl.java`:

```
private static final String AGSA_PACKAGE_NAME = "com.google.android.googlequicksearchbox";
private static final String SSBG_PACKAGE_NAME = "com.google.android.tts";
...
mIntent.putExtra("android.speech.extra.DICTATION_MODE", continuous);
mIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
mIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, interimResults);
```

Chrome Android stable (`chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Android&num=1`):
`154.0.8037.94`, 2026-10-02.

Hugging Face ONNX file sizes
(`curl -s https://huggingface.co/api/models/<repo>/tree/main/onnx`), encoder +
merged decoder, MB:

```
whisper-tiny.en    fp32 31.4 + 113.1   fp16 15.8 + 56.8    q8  9.7 + 29.3    q4  8.6 + 82.7
whisper-base.en    fp32 78.6 + 198.9   fp16 39.4 + 99.9    q8 22.1 + 51.2    q4 17.9 + 117.9
whisper-small.en   fp32 336.5 + 586.8  fp16 168.4 + 294.3  q8 88.0 + 149.5   q4 63.1 + 222.3
moonshine-tiny     fp32 29.5 + 74.6    fp16 14.8 + 72.7    q8  7.6 + 19.3    q4 10.2 + 42.6
moonshine-base     fp32 77.1 + 158.5   fp16 38.6 + 153.2   q8 19.6 + 40.5    q4 23.6 + 69.4
```

Moonshine CDN (`curl -sIL <url>` for each English file listed in
`core/moonshine-model-file-metadata.generated.cpp`, `content-length` summed),
MB:

```
tiny-streaming-en    encoder 7.3   decoder_kv 31.1   decoder_kv_with_attention 31.0   other 4.7    all files 74.1
small-streaming-en   encoder 42.1  decoder_kv 78.1   decoder_kv_with_attention 78.0   other 15.4   all files 213.7
medium-streaming-en  encoder 90.3  decoder_kv 140.2  decoder_kv_with_attention 140.0  other 26.1   all files 396.7
tiny-en (quantized)  all files 70.6
base-en (quantized)  all files 238.4
response headers: accept-ranges: bytes; cache-control: public, max-age=2592000; server: cloudflare
```

npm registry: `@moonshine-ai/moonshine-wasm` 0.1.5 (MIT, 2026-08-24, 13.7 MB
unpacked); `@huggingface/transformers` 4.3.0 (Apache-2.0, depends on
`onnxruntime-web` 1.31.0-dev.20260914); `onnxruntime-web` 1.30.0 (MIT).

whisper.cpp browser binding has no prompt parameter:

```
$ curl -s https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/whisper.wasm/emscripten.cpp | grep -n -iE "prompt|greedy"
67:        struct whisper_full_params params = whisper_full_default_params(whisper_sampling_strategy::WHISPER_SAMPLING_GREEDY);
```
