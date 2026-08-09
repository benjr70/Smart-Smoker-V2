/**
 * Reading the touchscreen's colours back out of the document it renders into.
 *
 * A colour on this device arrives in two halves: the application root puts the
 * shared palette onto `:root` as custom properties, and the legacy stylesheets
 * name those properties. Neither half says anything on its own, and the test
 * environment joins neither of them — it stubs a CSS import out of the bundle,
 * and it does not resolve `var()`. So these helpers put the halves back
 * together, letting a test ask what colour something on the touchscreen
 * actually comes out.
 */
import fs from 'fs';
import path from 'path';

/** The device's own stylesheets, in the order its screens import them. */
const DEVICE_STYLESHEETS = [
  '../../components/home/home.style.css',
  '../../components/home/wifi/wifi.style.css',
];

/** The text of every stylesheet the touchscreen carries of its own. */
export const deviceStylesheets = (): string[] =>
  DEVICE_STYLESHEETS.map(sheet => fs.readFileSync(path.join(__dirname, sheet), 'utf8'));

let served: HTMLStyleElement[] = [];

/**
 * Puts the device's stylesheets into the document, which the bundle does for
 * itself but the test environment does not: a rendered screen otherwise carries
 * its class names with no rules behind them.
 */
export const serveDeviceStylesheets = (): void => {
  stopServingDeviceStylesheets();
  served = deviceStylesheets().map(css => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  });
};

/** Takes them back out again, so one test's stylesheets are not another's. */
export const stopServingDeviceStylesheets = (): void => {
  served.forEach(style => style.remove());
  served = [];
};

/** Every style rule in the document, in the order it was inserted. */
const styleRules = (): CSSStyleRule[] =>
  Array.from(document.styleSheets)
    .flatMap(sheet => Array.from(sheet.cssRules))
    .filter((rule): rule is CSSStyleRule => 'selectorText' in rule);

/** The colours the application provides, by the property name that names them. */
const providedColours = (): Map<string, string> =>
  new Map(
    styleRules().flatMap(rule =>
      Array.from(
        rule.cssText.matchAll(/(--[\w-]+):\s*([^;}]+)/g),
        match => [match[1], match[2].trim()] as [string, string]
      )
    )
  );

/** A declared value with the properties it names filled in. */
const resolve = (value: string): string => {
  const colours = providedColours();
  return value.replace(/var\((--[\w-]+)\)/g, (_, property: string) => colours.get(property) ?? '');
};

/**
 * Whether a rule reaches an element. The component library ships rules keyed on
 * vendor pseudo-elements the test environment cannot parse; those reach no
 * element here, and none of them carries a colour of the device's.
 */
const applies = (rule: CSSStyleRule, element: Element): boolean => {
  try {
    return element.matches(rule.selectorText);
  } catch (unparseableSelector) {
    return false;
  }
};

/**
 * The last value declared for one of `properties` by a rule the element
 * matches. Later rules win, which is how these stylesheets are written — they
 * override a component library at equal specificity by coming after it.
 */
const declaredValue = (element: Element, properties: string[]): string | undefined =>
  styleRules()
    .filter(rule => applies(rule, element))
    .flatMap(rule => properties.map(property => rule.style.getPropertyValue(property)))
    .filter(value => value !== '')
    .pop();

/** The colour an element paints itself; empty when it paints itself nothing. */
export const backgroundColourAt = (element: Element): string =>
  resolve(declaredValue(element, ['background-color', 'background']) ?? '');

const channelLuminance = (channel: number): number =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** How light a colour is, as the accessibility guidelines define it. */
export const relativeLuminance = (colour: string): number => {
  const [, red, green, blue] = /^#(\w{2})(\w{2})(\w{2})$/.exec(colour.trim()) ?? [];
  if (!red) throw new Error(`Not a colour this can measure: "${colour}"`);
  const [r, g, b] = [red, green, blue].map(hex => channelLuminance(parseInt(hex, 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** How far apart two colours are to read against each other, 1:1 to 21:1. */
export const contrastRatio = (one: string, other: string): number => {
  const [lighter, darker] = [relativeLuminance(one), relativeLuminance(other)].sort(
    (a, b) => b - a
  );
  return (lighter + 0.05) / (darker + 0.05);
};
