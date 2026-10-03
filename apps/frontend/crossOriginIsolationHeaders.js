/**
 * The two response headers that together make a page cross-origin isolated,
 * which Voice Fill's threaded speech model needs (isolation is what unlocks
 * SharedArrayBuffer).
 *
 * The one copy both webpack configs hand to the dev server, so `npm start` and
 * `npm run start:prod` cannot drift apart. nginx.conf cannot read this file and
 * states the same pair for the built image: change the policy here and there
 * together.
 */
module.exports = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
