/**
 * No flash of white on the panel bolted to the smoker.
 *
 * Everything the application paints arrives with its bundle, and on this device
 * there is a stretch before that on every boot — and again on every reload after
 * the wifi came back, which is the ordinary way this screen reloads. In that
 * stretch the panel is whatever the shell opened its window in and whatever the
 * served page paints itself, so both have to be dark already: an 800x480 sheet
 * of white in a dark garage is exactly what the recolour is for.
 *
 * A page has no bundle to read the palette from, so it carries its colours as
 * literals; these tests paint each served page in isolation and compare what
 * comes out against the shared tokens, so the literals cannot drift away from
 * the palette the application goes on to paint with. The window the shell opens
 * behind them is guarded the same way, in src/electron/main.test.ts.
 */
import fs from 'fs';
import path from 'path';
import { carbonDark } from 'theme/src';

const SERVED_PAGE = path.resolve(__dirname, '../../public/index.html');
const FALLBACK_PAGE = path.resolve(__dirname, '../../public/thin.html');

/** Every stylesheet a page carries in itself, ahead of any bundle. */
const inlineStyles = (page: string): string[] =>
  Array.from(fs.readFileSync(page, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(
    match => match[1]
  );

let served: HTMLStyleElement[] = [];

/**
 * Hand the document over the way the browser hands it over: carrying the page's
 * own stylesheets and nothing else, because a test that reimplemented them would
 * pass while the served page painted nothing.
 */
const serve = (page: string): void => {
  served = inlineStyles(page).map(css => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  });
};

afterEach(() => {
  served.forEach(style => style.remove());
  served = [];
});

/** A design token as a browser reports it back from a computed style. */
const asRendered = (hex: string): string => {
  const [, r, g, b] = /^#(\w{2})(\w{2})(\w{2})$/.exec(hex) ?? [];
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
};

const pageIsPainted = (): string => getComputedStyle(document.documentElement).backgroundColor;
const pageWritesIn = (): string => getComputedStyle(document.documentElement).color;
const pageDeclaresItself = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue('color-scheme');

describe('the page the touchscreen is served in', () => {
  it('is painted in the dark background before a line of the application has run', () => {
    serve(SERVED_PAGE);

    expect(pageIsPainted()).toBe(asRendered(carbonDark.background));
  });

  /**
   * The parts of the interface the page draws rather than the application —
   * scrollbars, the caret in the wifi password field, a selection — are the
   * platform's, and it draws them light unless the page says otherwise.
   */
  it('tells the platform the interface around it is dark', () => {
    serve(SERVED_PAGE);

    expect(pageDeclaresItself()).toBe('dark');
  });
});

/**
 * The shell has one page of its own: the message it shows when it was given no
 * address to load. It is now shown against a dark window, so it has to be
 * painted for one.
 */
describe('the page the shell falls back to', () => {
  it('is painted in the same dark, and its message in a colour that reads on it', () => {
    serve(FALLBACK_PAGE);

    expect(pageIsPainted()).toBe(asRendered(carbonDark.background));
    expect(pageWritesIn()).toBe(asRendered(carbonDark.text));
  });
});
