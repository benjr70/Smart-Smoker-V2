# Voice Fill — design prototype assets

Synced verbatim from Claude Design project `af1c6090-e069-4439-828a-4031ef84bb8e`
on 2026-10-03 (issue [#693](https://github.com/benjr70/Smart-Smoker-V2/issues/693),
wayfinder map [#687](https://github.com/benjr70/Smart-Smoker-V2/issues/687)).

| File | What it is |
| --- | --- |
| `voice-fill.jsx` | Prototype components for Voice Fill: the "Voice fill" button, the bottom sheet (listening, working, review, nothing-to-fill and error states), the Undo toast, the field flash hook and the settings card with the two model dropdowns. |
| `Smart Smoker.html` | Full host file for the mobile-web design mock, showing where the button, sheet and toast sit on the three smoke screens and where the settings card sits. Committed whole so the prototype stays runnable in context. |

These are a **strong reference, not a pixel spec**: the real app's MUI/theme
conventions win on primitives. The look and the flow are the decision: one
button in the same place on all three screens, tap to start, "Done talking" to
stop, live transcript in the sheet, review rows with a tick each, "Fix the
text", flash on filled fields, "Filled N fields by voice · Undo" toast.

## Where the map overrules the prototype

The prototype's logic is a fake and predates decisions on the map. Where they
differ, the map wins (details in the resolution of #693 and #692):

- The model lists (cloud models, the phone's built-in recogniser) are
  placeholders; the real entries are the on-device candidates from #691.
- "Quick parse", the offline fallback and the `enabled` / `review` /
  `offlineFallback` flags in `VOICE_DEFAULTS` are dead: review always happens,
  there is no keyword parser and no offline mode.
- The "`<speech model> → <LLM>`" line under the review list and the model name
  in "… is reading it…" are removed.
- The smoke screen's single "Target temp" becomes one target per probe, and the
  Serve Plan's serve time and rest duration are fillable.
- Step lists are appended to, not replaced: the review row shows only the added
  steps, with nothing struck through.
- The Notes row shows the whole rewritten Notes with the old text struck
  through; an invented name is an ordinary row.
