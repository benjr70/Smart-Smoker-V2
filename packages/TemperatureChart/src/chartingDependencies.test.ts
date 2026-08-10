/**
 * Which charting libraries this product is allowed to ship.
 *
 * The chart draws itself: React owns the DOM and d3 owns only the maths, so the
 * `d3-scale` and `d3-shape` micro-packages are the whole of the charting
 * dependency set. The full `d3` bundle — every axis, selection, drag, force and
 * geo module — used to come along for the ride in this package and in both
 * applications, and it landed in the kiosk's bundle where the hardware can
 * least afford it.
 *
 * Nothing about a bundle stops someone re-adding it, and an unused dependency
 * is invisible in review, so the rule is asserted here against the manifests
 * themselves: the package that owns the chart owns the policy for every
 * workspace that draws one.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/** The workspaces that draw the temperature chart, or supply it. */
const CHART_WORKSPACES = ['packages/TemperatureChart', 'apps/frontend', 'apps/smoker'] as const;

/** The only charting packages allowed anywhere: d3's maths, and nothing else. */
const ALLOWED_CHARTING_PACKAGES = ['d3-scale', 'd3-shape', '@types/d3-scale', '@types/d3-shape'];

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const manifestOf = (workspace: string): Manifest =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, workspace, 'package.json'), 'utf8'));

/** Every package name a workspace declares, whichever section it sits in. */
const declaredPackages = (manifest: Manifest): string[] => [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
];

const isChartingPackage = (name: string): boolean =>
  /^(@types\/)?d3(-|$)/.test(name) || name.startsWith('@observablehq/');

/** Every package the workspace actually installs, however deep it sits. */
const installedPackages = (): string[] =>
  Object.keys(
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8')).packages ?? {}
  );

describe('the charting dependencies the product ships', () => {
  it.each(CHART_WORKSPACES)(
    '%s declares no charting package beyond d3 scale and shape',
    workspace => {
      const charting = declaredPackages(manifestOf(workspace)).filter(isChartingPackage);

      expect(charting.filter(name => !ALLOWED_CHARTING_PACKAGES.includes(name))).toEqual([]);
    }
  );

  /**
   * Dropping the manifest entries is not enough on its own: any dependency that
   * itself depends on d3 puts the whole bundle back in the tree, from where a
   * stray import would put it back in a bundle. Nothing may pull it in.
   */
  it('installs no copy of the full d3 bundle, at any depth', () => {
    expect(installedPackages().filter(entry => /(^|\/)d3$/.test(entry))).toEqual([]);
  });
});
