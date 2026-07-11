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

  /** The whole history card (View/delete actions + name) for a given smoke. */
  private historyCardFor(name: string): Locator {
    return this.page
      .getByTestId('smoke-card')
      .filter({ has: this.page.getByTestId('smoke-card-name').filter({ hasText: name }) });
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

  /** Assert a smoke is absent from the history list, refetching to be sure. */
  async expectHistoryMissing(name: string): Promise<void> {
    await expect(async () => {
      await this.page.getByTestId('nav-smoke').click();
      await this.page.getByTestId('nav-review').click();
      await expect(this.historyCard(name)).toHaveCount(0, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  }

  /** Open a completed smoke's review from its history card. */
  async openReview(name: string): Promise<void> {
    // The ratings card re-persists its value once it loads. Capture that
    // load-time write here (listener set before the click that triggers it) so
    // a later re-rating is the last write and isn't clobbered by this one
    // landing late.
    const ratingsPersisted = this.page
      .waitForResponse(
        res => res.url().includes('/api/ratings/') && res.request().method() === 'POST',
        { timeout: 15_000 }
      )
      .catch(() => undefined);
    await this.historyCardFor(name).getByTestId('smoke-card-view-button').click();
    await expect(this.page.getByTestId('review-presmoke-name')).toBeVisible();
    await ratingsPersisted;
  }

  /** Delete a completed smoke from its history card. */
  async deleteFromHistory(name: string): Promise<void> {
    await this.historyCardFor(name).getByTestId('smoke-card-delete-button').click();
  }

  /**
   * Assert the review cards render the values a smoke was finished with. Covers
   * the pre-smoke, smoke-profile and post-smoke cards in one intent-revealing
   * check; ratings have their own accessor because they are interactive.
   */
  async expectReviewShows(fields: {
    name: string;
    meatType: string;
    weight: string;
    woodType: string;
    restTime: string;
  }): Promise<void> {
    await expect(this.page.getByTestId('review-presmoke-name')).toHaveText(fields.name);
    await expect(this.page.getByTestId('review-presmoke-details')).toContainText(fields.meatType);
    await expect(this.page.getByTestId('review-presmoke-details')).toContainText(fields.weight);
    await expect(this.page.getByTestId('review-smoke-woodtype')).toContainText(fields.woodType);
    await expect(this.page.getByTestId('review-postsmoke-resttime')).toContainText(fields.restTime);
  }

  private get overallTasteRating(): Locator {
    return this.page.getByTestId('review-rating-overallTaste');
  }

  /**
   * Set the Overall Taste rating (1-10) on the currently-open review. The
   * ratings card persists on change (`POST /api/ratings/:id`); wait for that
   * write so a following reload reads the new value rather than racing it.
   */
  async setOverallTaste(value: number): Promise<void> {
    const accessibleName = `${value} Star${value === 1 ? '' : 's'}`;
    // MUI's radio inputs are 1px visually-hidden elements stacked at the start,
    // so clicking one lands on the first star. The clickable target is each
    // star's <label>, which overlays its own star and is tied to the input by
    // id — resolve that so the correct star is selected.
    const inputId = await this.overallTasteRating
      .getByRole('radio', { name: accessibleName, exact: true })
      .getAttribute('id');
    const star = inputId
      ? this.overallTasteRating.locator(`label[for="${inputId}"]`)
      : this.overallTasteRating.getByRole('radio', { name: accessibleName });
    await Promise.all([
      // Wait for the write that carries the new value so a following reload
      // reads it back rather than racing the persist.
      this.page.waitForResponse(
        res =>
          res.url().includes('/api/ratings/') &&
          res.request().method() === 'POST' &&
          res.request().postDataJSON()?.overallTaste === value
      ),
      star.click(),
    ]);
    await this.expectOverallTaste(value);
  }

  /** Assert the Overall Taste rating shown on the open review. */
  async expectOverallTaste(value: number): Promise<void> {
    await expect(this.page.getByTestId('review-rating-overallTaste-value')).toHaveText(
      `Overall Taste: ${value}`
    );
  }

  async openSettings(): Promise<void> {
    await this.page.getByTestId('nav-settings').click();
    await expect(this.notificationMessage).toBeVisible();
  }

  private get notificationMessage(): Locator {
    // The first notification rule's message field; the suite only exercises one.
    return this.page.getByTestId('settings-notification-message').first();
  }

  /** Type a notification message in Settings (persisted when the tab unmounts). */
  async setNotificationMessage(message: string): Promise<void> {
    await this.notificationMessage.fill(message);
  }

  async expectNotificationMessage(message: string): Promise<void> {
    await expect(this.notificationMessage).toHaveValue(message);
  }

  /**
   * Leave Settings via the Smoke tab. Settings persists on unmount, so this is
   * how a change is committed before a reload re-reads it from the backend.
   */
  async leaveSettings(): Promise<void> {
    await this.page.getByTestId('nav-smoke').click();
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
  }
}
