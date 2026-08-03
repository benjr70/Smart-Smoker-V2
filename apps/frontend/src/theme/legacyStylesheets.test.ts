/**
 * The hand-written stylesheets take their colours from the theme.
 *
 * Half of this application is painted by Material-UI, which follows the colour
 * scheme, and half by a handful of stylesheets that predate the theme. A colour
 * written into one of those files survives every scheme switch, so the app frame
 * would stay light grey behind a dark screen. The files themselves stay — they
 * carry the layout — but nothing in them may name a colour of its own.
 *
 * This reads the stylesheets as they ship rather than through the bundler: the
 * test runner replaces stylesheet imports with a proxy, so a rendered screen
 * cannot show what the file says.
 */
import fs from 'fs';
import path from 'path';

const STYLESHEET_ROOT = path.resolve(__dirname, '..');

/** Every stylesheet the application ships. */
const stylesheets = (directory: string): string[] =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry =>
      entry.isDirectory()
        ? stylesheets(path.join(directory, entry.name))
        : entry.name.endsWith('.css')
          ? [path.join(directory, entry.name)]
          : []
    );

/** A stylesheet's declarations, without the commented-out ones (they paint nothing). */
const declarationsOf = (file: string): string =>
  fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Colours as CSS lets them be written: hex, a colour function, or a name. */
const COLOUR_LITERAL = new RegExp(
  [
    '#[0-9a-fA-F]{3,8}\\b',
    '\\b(?:rgba?|hsla?)\\s*\\(',
    '\\b(?:white|black|silver|gr[ae]y|red|blue|green|yellow|orange|purple|pink|brown|navy|teal|lime|aqua|maroon|olive|fuchsia)\\b',
  ].join('|')
);

describe('the hand-written stylesheets', () => {
  const files = stylesheets(STYLESHEET_ROOT);

  it('are still there, carrying the layout they always carried', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map(file => [path.relative(STYLESHEET_ROOT, file), file]))(
    '%s names no colour of its own',
    (_name, file) => {
      expect(declarationsOf(file)).not.toMatch(COLOUR_LITERAL);
    }
  );
});
