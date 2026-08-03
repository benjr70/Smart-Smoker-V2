// The design typeface, bundled rather than fetched: the smoker is reachable
// over a tailnet and may have no route to a font CDN. Only the latin subset and
// the weights the interface actually uses are pulled in. The faces are imported
// here rather than in the shared theme package so that the package carries no
// bundler-specific stylesheet imports.
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';

// The tokens, the theme adapter and the appearance rule live in the shared
// workspace package so that the touchscreen application can consume exactly the
// same palette. This app reaches them through here.
export * from 'theme/src';

// The shared chart is not part of any application's theme — it is handed the
// colours it draws in. Which of this app's tokens those are is decided here.
export * from './chartColors';
