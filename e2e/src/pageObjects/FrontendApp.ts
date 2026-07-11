import { expect, Locator, Page } from '@playwright/test';

/**
 * Page object for the React web frontend.
 *
 * Encapsulates the pre-smoke wizard, the live smoke step + chart, the
 * post-smoke step, and the history list. Specs express journey intent; every
 * selector lives here so Material-UI class churn never reaches a test.
 */
export class FrontendApp {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
  }

  private stepButton(label: 'Pre-Smoke' | 'Smoke' | 'Post-Smoke'): Locator {
    return this.page.getByTestId(`smoke-step-${label}`);
  }

  private get nextButton(): Locator {
    return this.page.getByTestId('smoke-next-button');
  }

  /**
   * Confirm the pre-smoke wizard has loaded the (API-seeded) pre-smoke, so that
   * leaving the step re-persists a valid payload rather than an empty form.
   */
  async expectPreSmokeLoaded(name: string): Promise<void> {
    await expect(this.page.getByTestId('presmoke-name-input')).toHaveValue(name);
  }

  /** Move from the pre-smoke step to the live Smoke step. */
  async openSmokeStep(): Promise<void> {
    await this.stepButton('Smoke').click();
    await expect(this.chart).toBeVisible();
  }

  private get chart(): Locator {
    return this.page.getByTestId('smoke-chart');
  }

  private get chartLines(): Locator {
    return this.chart.locator('svg path.line');
  }

  /**
   * Total length of every drawn line's `d` geometry. The chart keeps a fixed
   * set of `path.line` elements; a live smoke shows up as their point data
   * growing, so this sum increases as temperatures accumulate.
   */
  async chartDataSize(): Promise<number> {
    const ds = await this.chartLines.evaluateAll(paths =>
      paths.map(p => (p.getAttribute('d') ?? '').length)
    );
    return ds.reduce((sum, len) => sum + len, 0);
  }

  /**
   * Resolve once the chart is accumulating temperature data: lines must appear
   * and then keep growing across a sampling window.
   */
  async waitForGrowingChart(): Promise<void> {
    await expect(this.chartLines.first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => this.chartDataSize(), { timeout: 30_000 }).toBeGreaterThan(0);
    const first = await this.chartDataSize();
    await expect.poll(async () => this.chartDataSize(), { timeout: 30_000 }).toBeGreaterThan(first);
  }

  /**
   * Reload the whole app and return to the live Smoke step. On mount the chart
   * re-fetches the current smoke's temps from the backend, so this exercises the
   * persistence path: a fresh page must rebuild the accumulated series from
   * stored records rather than from whatever it had in memory.
   */
  async reloadToSmokeStep(): Promise<void> {
    await this.page.reload();
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
    await this.openSmokeStep();
  }

  /**
   * After a reload, assert the chart still shows the accumulated series. The
   * reloaded page seeds the chart from persisted temps before any new live
   * points could plausibly regrow it, so reaching a comparable size quickly is
   * evidence the records survived, not that the chart is filling from zero.
   */
  async expectChartRetainsSeries(previousSize: number): Promise<void> {
    await expect(this.chartLines.first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => this.chartDataSize(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(Math.floor(previousSize / 2));
  }

  /** Advance to the Post-Smoke step, enter a rest time, and finish the smoke. */
  async completePostSmoke(restTime: string): Promise<void> {
    await this.stepButton('Post-Smoke').click();
    await this.page.getByTestId('postsmoke-rest-time-input').fill(restTime);
    await this.nextButton.click();
    // Finish triggers archive + clear; wait for the wizard to reset to step 0.
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
  }

  async openHistory(): Promise<void> {
    await this.page.getByTestId('nav-review').click();
  }

  historyCard(name: string): Locator {
    return this.page.getByTestId('smoke-card-name').filter({ hasText: name });
  }

  /**
   * The History list only fetches when it mounts, so a just-archived smoke can
   * be missing if the list rendered before the archive was queryable. Re-enter
   * the Review tab to refetch until the card appears.
   */
  async expectHistoryContains(name: string): Promise<void> {
    await expect(async () => {
      if (!(await this.historyCard(name).isVisible())) {
        await this.page.getByTestId('nav-smoke').click();
        await this.page.getByTestId('nav-review').click();
      }
      await expect(this.historyCard(name)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  }
}
