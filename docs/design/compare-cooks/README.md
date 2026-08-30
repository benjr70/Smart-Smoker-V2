# Compare Cooks — design prototype assets

Synced verbatim from Claude Design project `af1c6090-e069-4439-828a-4031ef84bb8e`
on 2026-08-30 (issue [#612](https://github.com/benjr70/Smart-Smoker-V2/issues/612),
wayfinder map [#610](https://github.com/benjr70/Smart-Smoker-V2/issues/610)).

| File | What it is |
| --- | --- |
| `cook-review.jsx` | Prototype components for the Compare Cooks feature — cook-again sheet plus the A/B compare screen: pre-smoke step diff, elapsed-time temperature overlay with stamp rails, smoke facts table, post-smoke diff, ratings deltas. This is the prototype the map #610 spec and slices reference. |
| `Smart Smoker.html` | Full host file for the mobile-web design mock — session data definitions and the host screens the compare feature plugs into. Committed whole so the prototype stays runnable in context. |

These are a **strong reference, not a pixel spec**: the real app's MUI/theme
conventions win on primitives, while the prototype's deliberate decisions are
preserved — elapsed-time x axis; colour = cook, dash = probe; stamp rails below
the plot; probe position as the pairing (no remapping UI); pre/post shown as
diffs, not parallel lists; identical values greyed.
