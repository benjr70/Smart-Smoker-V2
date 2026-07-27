import { expect, Locator, Page, Request } from '@playwright/test';

/** The weight units the pre-smoke wizard offers; LB is the form's default. */
export type WeightUnit = 'LB' | 'OZ';

/** Every value the pre-smoke wizard holds, as a journey enters (and re-reads) them. */
export type PreSmokeFields = {
  name: string;
  meatType: string;
  weight: number;
  weightUnit: WeightUnit;
  steps: string[];
  notes: string;
};

/** Test-id prefix of the pre-smoke step's prep-steps list. */
const PRE_SMOKE_STEPS = 'presmoke-step';

/**
 * The pre-smoke step's load: `GET /api/presmoke/` (the trailing slash is what
 * separates the *current* pre-smoke from `GET /api/presmoke/:id`, which the
 * review screens use).
 */
const isPreSmokeLoad = (request: Request): boolean =>
  request.method() === 'GET' && /\/api\/presmoke\/$/.test(request.url());

/**
 * Page object for the React web frontend.
 *
 * Encapsulates the pre-smoke wizard, the live smoke step + chart, the
 * post-smoke step, and the history list. Specs express journey intent; every
 * selector lives here so Material-UI class churn never reaches a test.
 */
export class FrontendApp {
  /** Pre-smoke loads that have completed, and how many are still in flight. */
  private preSmokeLoadsLanded = 0;
  private preSmokeLoadsInFlight = 0;

  constructor(private readonly page: Page) {
    // --- The async-load race, closed once, here ---------------------------
    //
    // Every wizard step loads its resource *after* mounting
    // (`useCurrentResource` fires `load(...).then(result => setState(result))`),
    // so a load landing after a journey has typed replaces what was typed with
    // what was stored. Rendering the step is therefore not the same as the step
    // being ready to type into.
    //
    // Watching the pre-smoke load lets the entry points (`goto`, `reload`,
    // `openPreSmokeStep`) hand back a step whose load has already landed,
    // instead of one that is about to overwrite the next thing typed. Mutating
    // helpers still go through `throughAsyncLoad` as a second line of defence,
    // for the loads no entry point can foresee.
    page.on('request', request => {
      if (isPreSmokeLoad(request)) this.preSmokeLoadsInFlight++;
    });
    const settled = (request: Request) => {
      if (!isPreSmokeLoad(request)) return;
      this.preSmokeLoadsInFlight--;
      // A failed load counts as landed: it resolves the in-flight window and,
      // having no result, can no longer overwrite anything either.
      this.preSmokeLoadsLanded++;
    };
    page.on('requestfinished', settled);
    page.on('requestfailed', settled);
  }

  async goto(): Promise<void> {
    const landed = this.preSmokeLoadsLanded;
    await this.page.goto('/');
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
    await this.waitForPreSmokeLoad(landed);
  }

  /**
   * Wait for a pre-smoke load newer than `landed` to complete.
   *
   * Used after a page render, where the pre-smoke step always mounts (the
   * wizard starts on step 0), so a load is always issued and this is a
   * deterministic wait rather than a hopeful one.
   */
  private async waitForPreSmokeLoad(landed: number): Promise<void> {
    await expect
      .poll(() => this.preSmokeLoadsLanded, {
        timeout: 15_000,
        message: 'the pre-smoke step never issued its load',
      })
      .toBeGreaterThan(landed);
  }

  /**
   * Wait until no pre-smoke load is outstanding.
   *
   * Used where a load may or may not be issued: re-entering the pre-smoke step
   * remounts it (and so reloads) only when the wizard was showing another step.
   */
  private async waitForPreSmokeLoadsSettled(): Promise<void> {
    await expect
      .poll(() => this.preSmokeLoadsLanded > 0 && this.preSmokeLoadsInFlight === 0, {
        timeout: 15_000,
        message: 'a pre-smoke load never completed',
      })
      .toBe(true);
  }

  /**
   * Retry a wizard mutation until it sticks.
   *
   * The single defence every mutating helper shares: a step's load landing
   * mid-edit restores the stored value over the typed one, so an edit is
   * applied-and-verified as a unit and replayed if the verification fails.
   * Each `attempt` must therefore be safe to run twice — express it as
   * "converge on this state", never as "click once".
   */
  private async throughAsyncLoad(attempt: () => Promise<void>, timeout = 15_000): Promise<void> {
    await expect(attempt).toPass({ timeout });
  }

  private stepButton(label: 'Pre-Smoke' | 'Smoke' | 'Post-Smoke'): Locator {
    return this.page.getByTestId(`smoke-step-${label}`);
  }

  private get nextButton(): Locator {
    return this.page.getByTestId('smoke-next-button');
  }

  private get preSmokeName(): Locator {
    return this.page.getByTestId('presmoke-name-input');
  }

  private get preSmokeMeatType(): Locator {
    return this.page.getByTestId('presmoke-meat-type-input');
  }

  private get preSmokeWeight(): Locator {
    return this.page.getByTestId('presmoke-weight-input');
  }

  private get preSmokeWeightUnit(): Locator {
    return this.page.getByTestId('presmoke-weight-unit-select');
  }

  private get preSmokeNotes(): Locator {
    return this.page.getByTestId('presmoke-notes-input');
  }

  /** Type into a wizard field and make sure the value stuck. */
  private async fillField(field: Locator, value: string): Promise<void> {
    await this.throughAsyncLoad(async () => {
      await field.fill(value);
      await expect(field).toHaveValue(value, { timeout: 1_000 });
    });
  }

  /**
   * Confirm the pre-smoke wizard has loaded the (API-seeded) pre-smoke, so that
   * leaving the step re-persists a valid payload rather than an empty form.
   */
  async expectPreSmokeLoaded(name: string): Promise<void> {
    await expect(this.preSmokeName).toHaveValue(name);
  }

  /**
   * Fill in the pre-smoke wizard, as a pitmaster starting a cook does.
   *
   * The weight is not optional even when a journey only cares about the name:
   * the backend rejects a pre-smoke without a numeric weight, so a name-only
   * form never persists at all.
   *
   * The meat type is a free-solo autocomplete, so any string a pitmaster types
   * is accepted — including cuts absent from the suggestion list.
   */
  async fillPreSmoke(fields: PreSmokeFields): Promise<void> {
    await this.fillField(this.preSmokeName, fields.name);
    await this.fillField(this.preSmokeMeatType, fields.meatType);
    await this.fillField(this.preSmokeWeight, String(fields.weight));
    await this.selectPreSmokeWeightUnit(fields.weightUnit);
    await this.fillDynamicList(PRE_SMOKE_STEPS, fields.steps);
    await this.fillField(this.preSmokeNotes, fields.notes);
  }

  /** Pick the weight's unit from its dropdown. */
  private async selectPreSmokeWeightUnit(unit: WeightUnit): Promise<void> {
    await this.throughAsyncLoad(async () => {
      await this.preSmokeWeightUnit.click();
      await this.page.getByTestId(`presmoke-weight-unit-option-${unit}`).click();
      await expect(this.preSmokeWeightUnit).toHaveText(unit, { timeout: 1_000 });
    });
  }

  /**
   * Drop one prep step by position, as a pitmaster revising the plan does.
   *
   * The last step of the list has no remove button (it carries the one that
   * adds a step), so it cannot be dropped this way; asking for it fails with
   * that explanation.
   */
  async removePreSmokeStep(index: number): Promise<void> {
    await this.removeDynamicListRow(PRE_SMOKE_STEPS, index);
  }

  /**
   * Assert the pre-smoke step shows the given values — the read half of the
   * fill/expect pair, used after a reload to prove the backend supplied them.
   */
  async expectPreSmokeShows(fields: PreSmokeFields): Promise<void> {
    await expect(this.preSmokeName).toHaveValue(fields.name);
    await expect(this.preSmokeMeatType).toHaveValue(fields.meatType);
    await expect(this.preSmokeWeight).toHaveValue(String(fields.weight));
    await expect(this.preSmokeWeightUnit).toHaveText(fields.weightUnit);
    await this.expectDynamicList(PRE_SMOKE_STEPS, fields.steps);
    await expect(this.preSmokeNotes).toHaveValue(fields.notes);
  }

  // --- Dynamic steps lists -------------------------------------------------
  //
  // The add/remove row list the pre-smoke and post-smoke steps share. Rows are
  // addressed by a caller-chosen test-id prefix: `<prefix>-row` per row, and
  // within it `<prefix>-input`, `<prefix>-add-button` (last row only) and
  // `<prefix>-remove-button` (every other row).

  private dynamicListRows(prefix: string): Locator {
    return this.page.getByTestId(`${prefix}-row`);
  }

  /** The values a dynamic steps list currently holds, in row order. */
  private async dynamicListValues(prefix: string): Promise<string[]> {
    return this.dynamicListRows(prefix)
      .getByTestId(`${prefix}-input`)
      .evaluateAll(inputs =>
        inputs.map(input => (input as HTMLInputElement | HTMLTextAreaElement).value)
      );
  }

  /**
   * Drive a dynamic steps list to hold exactly `values`.
   *
   * Such a list starts as a single empty row, grows when the last row's "+" is
   * clicked and shrinks when any earlier row's "-" is. The row count is driven
   * to the target in *both* directions, so the fill converges from whatever the
   * list currently holds — including a stored list longer than `values`, which
   * a step's load can restore mid-fill (see `throughAsyncLoad`, which replays
   * this whole sequence when that happens).
   */
  private async fillDynamicList(prefix: string, values: string[]): Promise<void> {
    if (values.length < 1) {
      throw new Error('a dynamic steps list always renders at least one row; got none to fill');
    }
    const rows = this.dynamicListRows(prefix);
    await this.throughAsyncLoad(async () => {
      let count = await rows.count();
      // Surplus rows go first: with a target of at least one row, a list that
      // is too long has two or more rows, so its first row is never the last
      // one — the only row that carries "+" instead of "-".
      while (count > values.length) {
        await rows.first().getByTestId(`${prefix}-remove-button`).click();
        await expect(rows).toHaveCount(count - 1, { timeout: 2_000 });
        count--;
      }
      while (count < values.length) {
        await rows.last().getByTestId(`${prefix}-add-button`).click();
        await expect(rows).toHaveCount(count + 1, { timeout: 2_000 });
        count++;
      }
      for (const [index, value] of values.entries()) {
        await rows.nth(index).getByTestId(`${prefix}-input`).fill(value);
      }
      await this.expectDynamicList(prefix, values, 1_000);
    }, 20_000);
  }

  /** Assert a dynamic steps list shows exactly `values`, in order. */
  private async expectDynamicList(
    prefix: string,
    values: string[],
    timeout?: number
  ): Promise<void> {
    const rows = this.dynamicListRows(prefix);
    await expect(rows).toHaveCount(values.length, { timeout });
    for (const [index, value] of values.entries()) {
      await expect(rows.nth(index).getByTestId(`${prefix}-input`)).toHaveValue(value, { timeout });
    }
  }

  /**
   * Remove one row of a dynamic steps list via its "-" button.
   *
   * Only rows *before* the last carry a "-": the last row carries the "+" that
   * grows the list instead. Removing the final row is therefore not something
   * the UI offers, and asking for it is a spec bug — reported as one here
   * rather than surfacing later as an unexplained click timeout.
   *
   * Expressed as "converge on the rows that should survive" rather than "click
   * once", because the retry may replay it: a second unconditional click would
   * drop a second row.
   */
  private async removeDynamicListRow(prefix: string, index: number): Promise<void> {
    const before = await this.dynamicListValues(prefix);
    if (index < 0 || index >= before.length) {
      throw new Error(
        `cannot remove row ${index} of the "${prefix}" list: it holds ${before.length} row(s)`
      );
    }
    if (index === before.length - 1) {
      throw new Error(
        `cannot remove the last row (${index}) of the "${prefix}" list: it carries the add ` +
          `button, not a remove button`
      );
    }
    const survivors = before.filter((_, position) => position !== index);
    await this.throughAsyncLoad(async () => {
      // Only click while the list is still too long: once it holds as many rows
      // as should survive, the removal has happened and a replay must not
      // remove another. Any row addressable here is one a longer-than-target
      // list keeps before its last, so it always carries a "-".
      if ((await this.dynamicListRows(prefix).count()) > survivors.length) {
        await this.dynamicListRows(prefix)
          .nth(index)
          .getByTestId(`${prefix}-remove-button`)
          .click();
      }
      await this.expectDynamicList(prefix, survivors, 1_000);
    });
  }

  /**
   * Return to the pre-smoke step (e.g. after a reload) and wait for it to be
   * ready to work with: rendered *and* holding what the backend has, so a
   * journey's first keystroke cannot be undone by the step's own load.
   */
  async openPreSmokeStep(): Promise<void> {
    await this.stepButton('Pre-Smoke').click();
    await expect(this.preSmokeName).toBeVisible();
    await this.waitForPreSmokeLoadsSettled();
  }

  /**
   * Leave the pre-smoke step for the Smoke step, committing the typed values.
   *
   * The wizard saves on unmount, so stepping away is what persists the form —
   * and the save is fire-and-forget, so a reload issued straight after the click
   * can outrun it. Wait for the pre-smoke write to land before returning, so a
   * following reload reads the backend's record rather than racing it.
   *
   * "Landed" means accepted, not merely answered: the response is matched by URL
   * and method (so a rejected save is still awaited rather than timing out on a
   * silent predicate) and then asserted to be ok, so a payload the backend
   * refuses fails here — at the write — instead of surfacing later as a
   * misleading "the data didn't load" assertion.
   */
  async leavePreSmokeStep(): Promise<void> {
    const saved = this.page.waitForResponse(
      res => res.url().endsWith('/api/presmoke') && res.request().method() === 'POST'
    );
    await this.openSmokeStep();
    const response = await saved;
    expect(
      response.ok(),
      `pre-smoke save was rejected: POST /api/presmoke -> ${response.status()} ${await response
        .text()
        .catch(() => '')}`
    ).toBeTruthy();
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
    const landed = this.preSmokeLoadsLanded;
    await this.page.reload();
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
    // A reload restarts the wizard on the pre-smoke step, so its load is always
    // issued; waiting for it here means the values read back after a reload are
    // the backend's, not the blank form the step renders until the load lands.
    await this.waitForPreSmokeLoad(landed);
  }
}
