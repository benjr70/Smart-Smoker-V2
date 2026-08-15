# Wifi keyboard implementation decision (issue #483)

## Question

What renders the wifi screen's on-screen keyboard: a maintained React
virtual-keyboard library (including the incumbent `react-simple-keyboard` with a
fully custom layout and theme), or a from-scratch build?

Hard requirements from the PRD (#474):

1. Pixel parity with the mock's layout — row indents, shift, space and backspace
   where the design puts them.
2. A full symbols layer (`@#$%&*!?` and the rest of printable ASCII).
3. An always-visible digit row on **every** layer.
4. Touch targets sized for the 800×480 panel.

## Options evaluated

| Criterion                                         | react-simple-keyboard (custom layout/theme)                                                                                                                | From scratch (MUI grid)                                                   | Other libraries¹                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| Mock layout parity (rows, indents, key placement) | 2 — layouts are arbitrary row strings; indents and per-key widths are plain CSS on `.hg-row` / `.hg-button`, which the device theme already restyles today | 2 — full control                                                          | 0–1 — fixed or barely customizable layouts |
| Full symbols layer                                | 2 — any number of named layers                                                                                                                             | 2                                                                         | 0–1                                        |
| Digit row on every layer                          | 2 — each layer is an independent row list                                                                                                                  | 2                                                                         | 0–1                                        |
| 800×480 touch targets                             | 2 — key size is CSS; press feedback built in (pointer/touch/mouse)                                                                                         | 1 — press/touch handling is ours to write                                 | 1                                          |
| Maintenance                                       | 2 — actively released (v3.8.x installed), MIT, single well-known maintainer                                                                                | 1 — ours forever                                                          | 0 — the field is abandoned²                |
| Integration cost                                  | 2 — already a dependency of this app, already themed; the device colour-scheme suite (`deviceKeyboard.test.tsx`) already exercises its DOM                 | 0 — re-implement key repeat/press states and redo the theme repaint suite | 1 — new dependency, new theming            |

¹ Surveyed: `react-screen-keyboard`, `react-virtual-keyboard` (a jQuery
`virtual-keyboard` wrapper), `react-touch-screen-keyboard`, `KioskBoard`. ² None
has meaningful maintenance in years, and none supports free-form custom layers
the way requirements 2–3 demand; `KioskBoard` is framework-agnostic vanilla JS
with its own DOM-injection model that fights React ownership.

## Decision

**Keep `react-simple-keyboard`, drive it entirely from our own layout config,
and hide it behind the `VirtualKeyboard` wrapper.**

- The incumbent meets every hard requirement once the stock layout is replaced:
  `layouts.ts` defines the three layers (`lower`, `upper`, `symbols`), each
  topped by the digit row, with shift/backspace anchoring the bottom letter row
  and the layer switch + space bar underneath, per the mock.
- It is the only _maintained_ library option, it is already installed, and the
  existing device-theme repaint tests already prove we can restyle its DOM to
  the design tokens.
- The swappability the PRD asks for (user story 42) comes from the wrapper, not
  the library choice: `VirtualKeyboard` emits only `onCharacter` / `onBackspace`
  / `onLayerChange`, and the contract suite (`VirtualKeyboard.test.tsx`) never
  names the library — it taps visible key caps and asserts emitted events, so a
  replacement implementation must simply pass the same suite.

### Rejected: from-scratch build

Scores identically on the four hard requirements but pays for it twice: we
re-implement what the library already does well (pointer/touch handling,
pressed-key feedback, layer rendering) and we throw away the existing themed
integration and its tests. The only argument for scratch — never being hostage
to a library — is already delivered more cheaply by the wrapper interface.

### Rejected: other libraries

Unmaintained, and none supports the custom-layer model that the symbols layer
and the persistent digit row require. Adopting any of them is a worse version of
the incumbent.

## Shape of the module

- `layouts.ts` — the three layers and key-cap display map (the design's rows;
  the digit row on every layer; full printable-ASCII symbols layer).
- `VirtualKeyboard.tsx` — the wrapper: owns the layer state (shift is a sticky
  toggle between `lower`/`upper`; `?123`/`ABC` swap the symbols layer) and
  translates library key presses into the contract events.
- `KeyboardDemo.tsx` — harness wiring the wrapper to a text field; its test
  types a mixed-case/digit/symbol password and erases a typo.

Pixel styling to the mock (row indent measurements, key sizing, colours) is
slice 10's wifi-screen restyle, applied through the same CSS hooks the device
theme uses today.
