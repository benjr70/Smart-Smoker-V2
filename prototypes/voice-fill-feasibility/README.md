# Voice Fill real-phone feasibility page

Throwaway test page for the wayfinder ticket
[Real-phone feasibility run](https://github.com/benjr70/Smart-Smoker-V2/issues/691)
on the map
[Voice Fill: speak a Ramble to fill the smoke screens](https://github.com/benjr70/Smart-Smoker-V2/issues/687).
Not part of the product; never merged to `master`.

It loads each shortlisted on-device speech-to-text and LLM candidate in Chrome
on a phone and measures: did it load, how many MB it stored, how long the load
took, seconds from the end of a Ramble to the filled fields (the bar is 15),
and what the transcript and the extracted fields were.

## Run

```bash
npm install --legacy-peer-deps
node serve.mjs                     # http://127.0.0.1:8099
sudo tailscale serve --bg 8099     # HTTPS on the tailnet, for the Fold
```

The microphone, WebGPU and threaded WASM all need a secure context, so the
phone must reach the page over HTTPS. `serve.mjs` sends the COOP/COEP headers
that make the page cross-origin isolated.

## On the phone

One speech model and one LLM per page load; reload to switch (frees memory).

1. Check section 0 shows `crossOriginIsolated: true` and a WebGPU adapter.
2. Pick a speech model, **Load**. Pick an LLM, **Load**.
3. Pick a screen, **Record**, read the yellow text aloud, **Stop**.
4. Read the big line (`Ramble end → fields: N s`), compare "got" with
   "expected", set the two verdicts, **Save result**.
5. Repeat for the other two screens, then reload and try the next pairing.

**Re-run on saved recording** replays the last recording for that screen
through whatever is loaded, so candidates can be compared on identical audio
without speaking again. **Extract only** runs the LLM on the text in the box.

Every saved result is posted back to `results.jsonl` next to the server;
**Copy all** is the fallback.

## Checked on desktop Chrome before hand-off

- All five runtimes import; the page is cross-origin isolated.
- Moonshine streaming (load, live feed, batch) and Whisper base.en on WASM
  transcribe a sample clip.
- Transformers.js extraction with the JSON-Schema constraint returns valid
  JSON (Qwen3-0.6B on CPU).
- Not checked, because the box has no WebGPU adapter: every WebGPU candidate,
  WebLLM, and LiteRT-LM. The phone is their first run.

The per-screen schemas in `app.js` are provisional, there only to have
something to measure against. The real contract belongs to the
"Per-screen extraction contract" ticket.
