import { expect, Locator, Page, Request } from '@playwright/test';
// Extensionless, like every other import Playwright resolves at runtime: the
// one `.ts`-suffixed import in this suite's runtime code is an `import type`,
// which is erased before a resolver ever sees it. The unit test beside this
// module is run by `node --test` instead, which wants the extension.
import { isTemperature, temperatureOf } from './readouts';

/** The weight units the pre-smoke wizard offers; LB is the form's default. */
export type WeightUnit = 'LB' | 'OZ' | 'KG';

/** Every value the pre-smoke wizard holds, as a journey enters (and re-reads) them. */
export type PreSmokeFields = {
  name: string;
  meatType: string;
  weight: number;
  weightUnit: WeightUnit;
  steps: string[];
  notes: string;
};

/** Every value the smoke step holds, as a journey enters (and re-reads) them. */
export type SmokeStepFields = {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
  woodType: string;
  notes: string;
};

/** Every value the post-smoke step holds, as a journey enters (and re-reads) them. */
export type PostSmokeFields = {
  /** `HH:MM`, as the step's masked input accepts it. */
  restTime: string;
  steps: string[];
  notes: string;
};

/**
 * What a review is expected to show.
 *
 * The five required fields are what every caller has always asserted. The rest
 * are optional so the secondary specs — which seed a smoke through the API and
 * therefore only set a handful of values — keep asserting exactly what they
 * seeded, while the full journey can hold the review to every value it entered.
 * A misspelled field is a compile error rather than a silently skipped
 * assertion, because the object literal is checked against this type.
 */
export type ReviewFields = {
  name: string;
  meatType: string;
  weight: string;
  woodType: string;
  restTime: string;
  preSmokeSteps?: string[];
  preSmokeNotes?: string;
  chamberName?: string;
  probe1Name?: string;
  probe2Name?: string;
  probe3Name?: string;
  smokeNotes?: string;
  postSmokeSteps?: string[];
  postSmokeNotes?: string;
};

/** Test-id prefix of the pre-smoke step's prep-steps list. */
const PRE_SMOKE_STEPS = 'presmoke-step';

/** Test-id prefix of the post-smoke step's wrap-up-steps list. */
const POST_SMOKE_STEPS = 'postsmoke-step';

/**
 * The smoke step's four temperature readouts, named as the test ids that
 * address them (`smoke-<readout>-temp`): the chamber and the three meat probes.
 */
const TEMP_READOUTS = ['chamber', 'probe1', 'probe2', 'probe3'] as const;

type TempReadout = (typeof TEMP_READOUTS)[number];

/**
 * What every readout displays right now, verbatim — unit and all, because it is
 * what a failure message quotes. Reading a number out of one is
 * {@link temperatureOf}'s job, not the caller's.
 */
type ReadoutTemps = Record<TempReadout, string>;

/**
 * How often the chart is sampled while watching it. The emulator relays a frame
 * every 500ms, so a chart that is still recording changes between samples.
 */
const CHART_SAMPLE_INTERVAL_MS = 500;

/**
 * How long a stopped chart must hold still to count as stopped: a dozen relayed
 * frames, and longer than the interval at which the backend persists them — so
 * a smoke that was still running could not slip through the window unrecorded.
 */
const CHART_STOPPED_OBSERVATION_MS = 6_000;

/**
 * How many readings a set of chart lines is drawing, totalled across them.
 *
 * A line's `d` opens at its first reading (`M`) and carries one command per
 * reading after it — `L` for the straight probe lines, `C` for the chamber's
 * cardinal curve — so the commands are the readings. A line drawing nothing
 * carries an empty `d` and counts as the zero readings it is showing, which is
 * what separates a chart that is drawing a cook from one that has merely put
 * its four paths on the page.
 */
const pointsDrawnBy = async (lines: Locator): Promise<number> => {
  const perLine = await lines.evaluateAll(paths =>
    paths.map(path => {
      const geometry = path.getAttribute('d') ?? '';
      return geometry === '' ? 0 : 1 + (geometry.match(/[LC]/g)?.length ?? 0);
    })
  );
  return perLine.reduce((sum, points) => sum + points, 0);
};

/**
 * The moments a chart has written under its plot, left to right.
 *
 * A cook runs forwards, so these must ascend. They did not: read back from a
 * collection that answers newest-first, the chart took the span of the plot from
 * the ends of the array and ruled its clock backwards — with the cook itself
 * drawn off the side of the plot, over the temperature labels, while still
 * showing four paths carrying every point the cook recorded.
 */
const timeAxisOf = async (chart: Locator): Promise<number[]> =>
  chart
    .locator('text[data-time-label]')
    .evaluateAll(labels =>
      labels.map(label => new Date(label.getAttribute('data-time-label') ?? '').getTime())
    );

/**
 * The pre-smoke step's load: `GET /api/presmoke/` (the trailing slash is what
 * separates the *current* pre-smoke from `GET /api/presmoke/:id`, which the
 * review screens use).
 */
const isPreSmokeLoad = (request: Request): boolean =>
  request.method() === 'GET' && /\/api\/presmoke\/$/.test(request.url());

/**
 * The smoke step's load: `GET /api/smokeProfile/current`. Distinct from
 * `GET /api/smokeProfile/:id`, which only the review screens issue.
 */
const isSmokeProfileLoad = (request: Request): boolean =>
  request.method() === 'GET' && request.url().endsWith('/api/smokeProfile/current');

/**
 * The smoke step's other load: `GET /api/state`, which is where the step learns
 * whether a smoke is running at all. The only other `state` routes are the
 * `toggleSmoking` and `clearSmoke` writes, both PUTs, so a GET is unambiguously
 * this read.
 */
const isSmokeStateLoad = (request: Request): boolean =>
  request.method() === 'GET' && request.url().endsWith('/api/state');

/**
 * The post-smoke step's load: `GET /api/postSmoke/current`. Distinct from
 * `GET /api/postSmoke/:id`, which only the review screens issue.
 */
const isPostSmokeLoad = (request: Request): boolean =>
  request.method() === 'GET' && request.url().endsWith('/api/postSmoke/current');

/** A step's own text, safe to embed in the regex that asserts its position. */
const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The rest a wizard records as `HH:MM`, the way the history detail reads it
 * back: `01:30` becomes `1h 30m`, and a rest under an hour drops the empty
 * hours. The journeys keep speaking in the wizard's shape — it is what they
 * typed — and translate here to what the review is expected to show.
 */
const humanizedRestOf = (restTime: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(restTime.trim());
  if (match === null) {
    throw new Error(
      `"${restTime}" is not the wizard's HH:MM rest-time shape, so what the review should ` +
        `show for it cannot be derived`
    );
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

/**
 * Tracks one wizard step's resource loads, so an entry point can hand back a
 * step that has *finished* loading.
 *
 * --- The async-load race, closed once, here -------------------------------
 *
 * Every wizard step loads its resource *after* mounting (a load fires on mount
 * and its result is written into state when it resolves), so a load landing
 * after a journey has typed replaces what was typed with what was stored.
 * Rendering the step is therefore not the same as the step being ready to type
 * into. Worse on the smoke step, which refuses to save a draft it never
 * hydrated — typing before the load lands is silently discarded.
 *
 * Counting a step's loads lets a journey wait for the specific load its own
 * click provoked ({@link waitForLoadSince}) or simply for quiet
 * ({@link waitUntilSettled}), instead of guessing with a sleep.
 *
 * Only a load that came back *ok* counts as having hydrated the step: a load
 * answered with an error status (or not answered at all) leaves the step
 * rendered but empty, which is precisely the state its save path refuses to
 * write from. Counting such a load as arrival would hand a journey a step that
 * silently drops everything typed into it, and the failure would surface far
 * downstream as a save that never happens.
 */
class LoadWatcher {
  /** Loads that came back ok — the only ones that can have hydrated the step. */
  private hydrated = 0;
  /** Loads that came back with an error status, or never came back at all. */
  private failed = 0;
  private inFlight = 0;

  constructor(
    page: Page,
    /** Named in timeout messages, e.g. "the pre-smoke step never hydrated". */
    private readonly stepName: string,
    matches: (request: Request) => boolean
  ) {
    page.on('request', request => {
      if (matches(request)) this.inFlight++;
    });
    page.on('requestfinished', request => {
      if (!matches(request)) return;
      // The response decides which counter moves, so the outcome is recorded
      // *before* the in-flight window closes: a waiter must never see a quiet
      // watcher whose last load has not been judged yet.
      void request
        .response()
        .then(response => {
          if (response?.ok()) this.hydrated++;
          else this.failed++;
        })
        .catch(() => {
          this.failed++;
        })
        .finally(() => {
          this.inFlight--;
        });
    });
    page.on('requestfailed', request => {
      if (!matches(request)) return;
      this.failed++;
      this.inFlight--;
    });
  }

  /**
   * How many loads have hydrated the step so far — taken *before* an action
   * that provokes a new one, and handed to {@link waitForLoadSince} afterwards.
   */
  mark(): number {
    return this.hydrated;
  }

  /**
   * Wait for a load newer than `mark` to hydrate the step.
   *
   * Used after an action that always mounts the step (a page render, a click
   * onto a step the wizard was not showing), so a load is always issued and
   * this is a deterministic wait rather than a hopeful one.
   */
  async waitForLoadSince(mark: number): Promise<void> {
    await expect
      .poll(() => this.hydrationSince(mark), {
        timeout: 15_000,
        message: `the ${this.stepName} step never hydrated`,
      })
      .toBe('hydrated');
  }

  /**
   * Wait until no load is outstanding and the step holds what the backend has.
   *
   * Used where a load may or may not be issued: re-entering a step remounts it
   * (and so reloads) only when the wizard was showing another step.
   */
  async waitUntilSettled(): Promise<void> {
    await expect
      .poll(() => this.hydrated > 0 && this.inFlight === 0, {
        timeout: 15_000,
        message: `a ${this.stepName} load never completed`,
      })
      .toBe(true);
  }

  /**
   * Whether the step has hydrated since `mark`, phrased as the polled value so
   * a timeout reports *why* — a failed load reads as "the step never hydrated",
   * not as an unexplained wait.
   */
  private hydrationSince(mark: number): string {
    if (this.hydrated > mark) return 'hydrated';
    return this.failed > 0
      ? `not hydrated: ${this.failed} load(s) came back failed`
      : 'not hydrated: no load has come back';
  }
}

/** The options the Settings page's Appearance card offers. */
export type AppearanceOption = 'Light' | 'Dark' | 'Auto';

/** A design token as the browser reports it back from a computed style. */
const toRgb = (hex: string): string => {
  const [, r, g, b] = /^#(\w{2})(\w{2})(\w{2})$/.exec(hex) ?? [];
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
};

/**
 * The screens the bottom navigation bar moves between, addressed by the
 * outermost box each of them lays itself out in.
 */
const SCREEN_ROOTS = {
  smoke: '[data-testid="smoke-screen"]',
  review: '[data-testid="history-screen"]',
  settings: '[data-testid="settings-page"]',
} as const;

/** A screen, as the bottom navigation bar names it. */
export type ScreenName = keyof typeof SCREEN_ROOTS;

/**
 * The height of the fixed bottom navigation bar, and so of the space the app
 * holds open for it in flow (`BOTTOM_BAR_HEIGHT` in the frontend's
 * `bottombar.tsx`).
 */
const BOTTOM_BAR_HEIGHT = 56;

/**
 * Rounding room, in CSS pixels: a viewport height that is not a multiple of the
 * percentages a screen is laid out from lands these measurements on fractions.
 */
const SUB_PIXEL = 1;

/**
 * Page object for the React web frontend.
 *
 * Encapsulates the pre-smoke wizard, the live smoke step + chart, the
 * post-smoke step, and the history list. Specs express journey intent; every
 * selector lives here so Material-UI class churn never reaches a test.
 */
export class FrontendApp {
  /**
   * The step loads a journey has to wait out. The smoke step has two of them —
   * the stored profile it renders and the smoking state it reports — and both
   * are tracked, because either one arriving late hands back a step that
   * misrepresents the backend. Mutating helpers still go through
   * `throughAsyncLoad` as a second line of defence, for the loads no entry point
   * can foresee.
   */
  private readonly preSmokeLoads: LoadWatcher;
  private readonly smokeProfileLoads: LoadWatcher;
  private readonly smokeStateLoads: LoadWatcher;
  private readonly postSmokeLoads: LoadWatcher;

  /**
   * Every pre-smoke save the page has issued. Counted so a journey can assert a
   * write did *not* happen — an untouched wizard step must persist nothing when
   * it unmounts, which no on-screen state can evidence.
   */
  private preSmokeSaves = 0;

  constructor(private readonly page: Page) {
    this.preSmokeLoads = new LoadWatcher(page, 'pre-smoke', isPreSmokeLoad);
    this.smokeProfileLoads = new LoadWatcher(page, 'smoke profile', isSmokeProfileLoad);
    this.smokeStateLoads = new LoadWatcher(page, 'smoking state', isSmokeStateLoad);
    this.postSmokeLoads = new LoadWatcher(page, 'post-smoke', isPostSmokeLoad);
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/api/presmoke')) {
        this.preSmokeSaves++;
      }
    });
  }

  /** How many pre-smoke saves the page has issued so far. */
  countPreSmokeSaves(): number {
    return this.preSmokeSaves;
  }

  /**
   * Assert the app is not showing an error snackbar.
   *
   * Given a settling window first: the snackbar a failed save raises appears
   * only once that save has been answered, so asserting immediately would pass
   * before the failure it is meant to catch has arrived.
   */
  async expectNoErrorSnackbar(settleMs = 2_000): Promise<void> {
    await this.page.waitForTimeout(settleMs);
    await expect(this.page.getByRole('alert')).toHaveCount(0);
  }

  async goto(): Promise<void> {
    const landed = this.preSmokeLoads.mark();
    await this.page.goto('/');
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
    await this.preSmokeLoads.waitForLoadSince(landed);
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
   * Any step can be dropped, the last one included: every row carries its own
   * "×" and the control that adds a step sits under the list rather than in the
   * final row. Asking for a position the list does not hold fails with that
   * explanation.
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
  // addressed by a caller-chosen test-id prefix: `<prefix>-row` per row, with
  // `<prefix>-input` and `<prefix>-remove-button` within every one of them, and
  // one `<prefix>-add-button` under the list as a whole.

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

  /** The one control under a dynamic steps list that grows it. */
  private dynamicListAddButton(prefix: string): Locator {
    return this.page.getByTestId(`${prefix}-add-button`);
  }

  /**
   * Drive a dynamic steps list to hold exactly `values`.
   *
   * Such a list grows when the "+ Add Step" control under it is clicked and
   * shrinks when a row's "×" is. The row count is driven to the target in
   * *both* directions, so the fill converges from whatever the list currently
   * holds — including a stored list longer than `values`, which a step's load
   * can restore mid-fill (see `throughAsyncLoad`, which replays this whole
   * sequence when that happens).
   */
  private async fillDynamicList(prefix: string, values: string[]): Promise<void> {
    if (values.length < 1) {
      throw new Error('filling a dynamic steps list needs at least one value; got none');
    }
    const rows = this.dynamicListRows(prefix);
    await this.throughAsyncLoad(async () => {
      let count = await rows.count();
      while (count > values.length) {
        await rows.first().getByTestId(`${prefix}-remove-button`).click();
        await expect(rows).toHaveCount(count - 1, { timeout: 2_000 });
        count--;
      }
      while (count < values.length) {
        await this.dynamicListAddButton(prefix).click();
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
   * Remove one row of a dynamic steps list via its "×" button.
   *
   * Every row carries one, the last included — which it did not before this
   * list was brought to the design: the final row used to carry the control
   * that *added* a step, so the last step of a plan could not be dropped at all.
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
    const survivors = before.filter((_, position) => position !== index);
    await this.throughAsyncLoad(async () => {
      // Only click while the list is still too long: once it holds as many rows
      // as should survive, the removal has happened and a replay must not
      // remove another.
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
    await this.clickPreSmokeStep();
    await this.preSmokeLoads.waitUntilSettled();
  }

  /**
   * Return to the pre-smoke step from a step the wizard is currently showing.
   *
   * Distinct from {@link openPreSmokeStep} because the click is *known* to
   * unmount that step and remount pre-smoke, so a load is always issued —
   * exactly the case "wait until nothing is in flight" cannot serve, since it
   * is satisfied by the earlier loads in the instant before this one hits the
   * wire. Waiting for a load newer than the mark instead means the step handed
   * back is hydrated, not merely rendered.
   */
  private async returnToPreSmokeStep(): Promise<void> {
    const landed = this.preSmokeLoads.mark();
    await this.clickPreSmokeStep();
    await this.preSmokeLoads.waitForLoadSince(landed);
  }

  private async clickPreSmokeStep(): Promise<void> {
    await this.stepButton('Pre-Smoke').click();
    await expect(this.preSmokeName).toBeVisible();
  }

  /** Leave the pre-smoke step for the Smoke step, committing the typed values. */
  async leavePreSmokeStep(): Promise<void> {
    await this.leaveStepCommitting('/api/presmoke', () => this.openSmokeStep());
  }

  /**
   * Navigate away from a step and wait for the save that unmounting it triggers
   * to be accepted. `resourcePath` is the POST the leaving step issues.
   *
   * A wizard step saves on unmount, so stepping away is what persists the form —
   * and the save is fire-and-forget, so a reload issued straight after the click
   * can outrun it. Waiting for the write here means "leave, then reload" proves
   * persistence rather than racing it.
   *
   * "Landed" means accepted, not merely answered: the response is matched by URL
   * and method (so a rejected save is still awaited rather than timing out on a
   * silent predicate) and then asserted to be ok, so a payload the backend
   * refuses fails here — at the write — instead of surfacing later as a
   * misleading "the data didn't load" assertion.
   */
  private async leaveStepCommitting(
    resourcePath: string,
    leave: () => Promise<void>
  ): Promise<void> {
    const saved = this.page.waitForResponse(
      res => res.url().endsWith(resourcePath) && res.request().method() === 'POST'
    );
    await leave();
    const response = await saved;
    expect(
      response.ok(),
      `save was rejected: POST ${resourcePath} -> ${response.status()} ${await response
        .text()
        .catch(() => '')}`
    ).toBeTruthy();
  }

  /**
   * Move to the live Smoke step and wait for it to be ready to work with.
   *
   * The step's profile load must land before a journey types: not only would a
   * late load overwrite what was typed, the step also refuses to save a draft it
   * never hydrated — so typing too early is discarded without a trace.
   *
   * The smoking-state load is waited out for the journey's *reader* rather than
   * its typist. Until `GET /api/state` answers, the session simply assumes no
   * smoke is running, and the step dutifully renders that assumption — so a step
   * handed back any earlier says nothing about the backend, and reading it would
   * pass on the guess. That is exactly the regression the stopped-state checks
   * exist to catch: a backend that never actually stopped the smoke would still
   * be read as stopped, and the assertion would prove nothing while going green.
   *
   * The one mount issues both loads, so both marks are taken before the click
   * and both waits are deterministic rather than hopeful.
   */
  async openSmokeStep(): Promise<void> {
    const profileLanded = this.smokeProfileLoads.mark();
    const stateLanded = this.smokeStateLoads.mark();
    await this.stepButton('Smoke').click();
    await expect(this.chart).toBeVisible();
    await this.smokeProfileLoads.waitForLoadSince(profileLanded);
    await this.smokeStateLoads.waitForLoadSince(stateLanded);
  }

  private get smokeChamberName(): Locator {
    return this.page.getByTestId('smoke-chamber-name-input');
  }

  private smokeProbeName(probe: 1 | 2 | 3): Locator {
    return this.page.getByTestId(`smoke-probe${probe}-name-input`);
  }

  private get smokeWoodType(): Locator {
    return this.page.getByTestId('smoke-wood-type-input');
  }

  private get smokeNotes(): Locator {
    return this.page.getByTestId('smoke-notes-input');
  }

  /**
   * Fill in the smoke step's editable fields, as a pitmaster settling in for a
   * cook does: label each probe by what it is actually measuring, record the
   * wood, and start a running log.
   *
   * The chamber and probe names are inline inputs sitting in the readout rows,
   * carrying no visible label and named for assistive technology instead, and
   * the wood type is a free-solo autocomplete that accepts any wood a pitmaster
   * names, list or no list — the chevron beside it offers the common ones
   * without ever being the only way to answer.
   */
  async fillSmokeStep(fields: SmokeStepFields): Promise<void> {
    await this.fillField(this.smokeChamberName, fields.chamberName);
    await this.fillField(this.smokeProbeName(1), fields.probe1Name);
    await this.fillField(this.smokeProbeName(2), fields.probe2Name);
    await this.fillField(this.smokeProbeName(3), fields.probe3Name);
    await this.fillWoodType(fields.woodType);
    await this.fillField(this.smokeNotes, fields.notes);
  }

  /**
   * Enter the wood type, dismissing the suggestion popup it may open.
   *
   * The popup floats over the notes field directly below, so leaving it open
   * would make the next field unclickable. Escape only closes it (the
   * autocomplete does not clear on escape), and the re-assertion proves the
   * typed wood survived the dismissal.
   */
  private async fillWoodType(value: string): Promise<void> {
    await this.throughAsyncLoad(async () => {
      await this.smokeWoodType.fill(value);
      await this.smokeWoodType.press('Escape');
      await expect(this.smokeWoodType).toHaveValue(value, { timeout: 1_000 });
    });
  }

  /**
   * Assert the smoke step shows the given values — the read half of the
   * fill/expect pair, used after a reload to prove the backend supplied them.
   */
  async expectSmokeStepShows(fields: SmokeStepFields): Promise<void> {
    await expect(this.smokeChamberName).toHaveValue(fields.chamberName);
    await expect(this.smokeProbeName(1)).toHaveValue(fields.probe1Name);
    await expect(this.smokeProbeName(2)).toHaveValue(fields.probe2Name);
    await expect(this.smokeProbeName(3)).toHaveValue(fields.probe3Name);
    await expect(this.smokeWoodType).toHaveValue(fields.woodType);
    await expect(this.smokeNotes).toHaveValue(fields.notes);
  }

  /**
   * Leave the Smoke step for the pre-smoke step, committing the typed values.
   *
   * Like the pre-smoke step, the smoke step saves its profile (names, wood type
   * and notes) when it unmounts, so stepping away is what persists them.
   */
  async leaveSmokeStep(): Promise<void> {
    await this.leaveStepCommitting('/api/smokeProfile/current', () => this.returnToPreSmokeStep());
  }

  // --- Live temperatures ---------------------------------------------------

  private tempReadout(readout: TempReadout): Locator {
    return this.page.getByTestId(`smoke-${readout}-temp`);
  }

  /** Read all four readouts as displayed, so one sample is one point in time. */
  private async readoutTemps(): Promise<ReadoutTemps> {
    const entries = await Promise.all(
      TEMP_READOUTS.map(
        async readout => [readout, (await this.tempReadout(readout).innerText()).trim()] as const
      )
    );
    return Object.fromEntries(entries) as ReadoutTemps;
  }

  /**
   * Which readouts are not showing a temperature — reported as `name=value` so a
   * timeout says *which* probe is dark and what it holds, rather than stalling
   * on an anonymous boolean.
   */
  private async darkReadouts(): Promise<string[]> {
    const temps = await this.readoutTemps();
    return TEMP_READOUTS.filter(readout => !isTemperature(temps[readout])).map(
      readout => `${readout}=${JSON.stringify(temps[readout])}`
    );
  }

  /**
   * Which readouts have not landed a *new* temperature since `previous` — either
   * still showing exactly what was sampled, or no longer showing a temperature
   * at all. Going dark after one good frame is a regression, not progress, so it
   * has to keep failing this check rather than count as a change.
   */
  private async unrefreshedReadouts(previous: ReadoutTemps): Promise<string[]> {
    const temps = await this.readoutTemps();
    return TEMP_READOUTS.filter(
      readout =>
        !isTemperature(temps[readout]) ||
        // The readings are compared, not the strings that display them: what
        // makes a frame new is a different temperature, and a readout that
        // restyled its unit between two samples has still not moved.
        temperatureOf(temps[readout]) === temperatureOf(previous[readout])
    ).map(readout => `${readout}=${JSON.stringify(temps[readout])}`);
  }

  /**
   * Resolve once all four readouts are showing *live* temperatures.
   *
   * Live is proven in two stages, because either alone is passable by a display
   * that is not connected to anything: a readout holding a number greater than
   * zero could be a value the session loaded once and froze on, and a readout
   * that changes could be doing so from — or to — a non-temperature. So every
   * readout must first carry a temperature, and then every one of them must move
   * off the value it was sampled at *and still be a temperature* — which only
   * the emulator -> device-service -> smoker -> backend -> frontend pipeline
   * delivering fresh frames can do.
   *
   * All four are checked as a set rather than one at a time: a probe wired to
   * the wrong field of the frame is exactly the bug this guards, and it hides
   * whenever a single readout is taken as proof for the rest.
   *
   * This proves frames are *arriving*, not that a smoke is running: an open
   * smoker relays temperatures whether or not it has been started. Only the
   * chart plots exclusively while smoking, so {@link waitForGrowingChart} is
   * what a journey pairs this with to prove the cook itself started.
   */
  async waitForLiveReadouts(): Promise<void> {
    await expect
      .poll(async () => this.darkReadouts(), {
        timeout: 30_000,
        message: 'these readouts never showed a temperature',
      })
      .toEqual([]);
    const sampled = await this.readoutTemps();
    await expect
      .poll(async () => this.unrefreshedReadouts(sampled), {
        timeout: 30_000,
        message: 'these readouts never showed a new temperature, so nothing live reached them',
      })
      .toEqual([]);
  }

  /** The smoke step's start/stop control, whose label is the smoke's state. */
  private get startButton(): Locator {
    return this.page.getByTestId('smoke-start-button');
  }

  /**
   * Assert the web app is showing a stopped smoke: the step's one smoking
   * control offers to *start* one.
   *
   * Read after a reload, this is a statement about the backend rather than
   * about the page: a freshly loaded step holds no memory of any click, so the
   * only thing that can label this control is the state it loaded.
   *
   * "Loaded" is the load-bearing word, and it is {@link openSmokeStep} that
   * earns it by waiting for the step's smoking-state load. A step read before
   * that lands is still showing the session's not-smoking default, which wears
   * the same label — so this would agree with itself no matter what the backend
   * said.
   */
  async expectSmokeStopped(): Promise<void> {
    await expect(this.startButton).toHaveText(/start smoking/i);
  }

  private get chart(): Locator {
    return this.page.getByTestId('smoke-chart');
  }

  private get chartLines(): Locator {
    return this.chart.locator('svg path[data-series]');
  }

  /**
   * Assert the live chart is on screen and drawing a line per reading.
   *
   * The chart is one SVG carrying one path per series — the chamber and its
   * three probes — so this is the check that the smoke screen is showing a
   * chart at all, ahead of any assertion about what that chart has plotted.
   */
  async expectChartRendered(): Promise<void> {
    await expect(this.chart.getByRole('img', { name: 'Temperature chart' })).toBeVisible();
    await expect(this.chartLines).toHaveCount(4);
    // The live chart is handed the cook the backend has already stored as its
    // baseline, so a reload mid-cook can hand it that cook in the store's own
    // order. It is still a cook, and a cook runs forwards.
    const axis = await timeAxisOf(this.chart);
    expect(axis.length, 'the live chart drew no clock under its plot').toBeGreaterThan(1);
    expect(axis, 'the live chart ruled its clock backwards').toEqual(
      [...axis].sort((one, other) => one - other)
    );
  }

  /**
   * Assert the review card of an opened smoke draws that smoke's chart: the
   * same SVG, with the same four lines, over what the backend stored — and that
   * those lines have the stored cook in them.
   *
   * The geometry is the assertion. The chart keeps one path per series whether
   * or not that probe ever reported, so counting paths alone passes on a card
   * showing an empty frame — which is precisely what a chart handed readings it
   * cannot plot draws. A smoke that was recorded has at least the chamber to
   * show for it.
   *
   * The direction is asserted too. The stored series comes back in whatever
   * order the collection holds it, and a card handed it backwards draws every
   * one of those points against a clock running the wrong way — passing every
   * assertion above while showing the operator a cook drawn off the plot.
   */
  async expectReviewChartRendered(): Promise<void> {
    const card = this.page.getByTestId('review-smoke-section');
    await expect(card.getByRole('img', { name: 'Temperature chart' })).toBeVisible();
    const lines = card.locator('svg path[data-series]');
    await expect(lines).toHaveCount(4);
    await expect
      .poll(async () => pointsDrawnBy(lines), {
        message: 'the review card drew its chart, but with none of the stored cook in it',
      })
      .toBeGreaterThan(0);
    const axis = await timeAxisOf(card);
    expect(axis.length, 'the review card drew no clock under its chart').toBeGreaterThan(1);
    expect(axis, 'the review card ruled its clock backwards').toEqual(
      [...axis].sort((one, other) => one - other)
    );
  }

  /**
   * How many temperature readings the chart is plotting, totalled across its
   * lines (the chart keeps a fixed set of `path.line` elements).
   *
   * Counted off each line's own geometry: a `d` path opens at its first reading
   * (`M`) and carries one command per reading after it — `L` for the straight
   * probe lines, `C` for the chamber's cardinal curve — so the commands are the
   * readings. A line the chart is thinning draws fewer commands than the cook
   * has readings, which is exactly the point of thinning; the count still only
   * grows while a cook is being recorded. This is what makes the measure comparable *across a reload*,
   * unlike the raw length of `d`, which changes with the axis scaling even when
   * the very same readings are drawn.
   */
  async chartPointCount(): Promise<number> {
    return pointsDrawnBy(this.chartLines);
  }

  /**
   * Resolve once the chart is accumulating temperature data: lines must appear
   * and then keep growing across a sampling window.
   */
  async waitForGrowingChart(): Promise<void> {
    await expect(this.chartLines.first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => this.chartPointCount(), { timeout: 30_000 }).toBeGreaterThan(0);
    const first = await this.chartPointCount();
    await expect
      .poll(async () => this.chartPointCount(), { timeout: 30_000 })
      .toBeGreaterThan(first);
  }

  /**
   * Assert the chart has stopped recording: its plotted readings must hold
   * still for an observation window many frames long.
   *
   * Stopping is only meaningful if it stops the *recording*: an open smoker
   * page keeps relaying temperatures whether or not a smoke is running, so
   * frames go on arriving throughout this window and a chart that is still
   * plotting them grows visibly within a second. The window is therefore the
   * assertion — a single sample after the stop would pass on a chart that
   * simply had not been sent its next frame yet.
   *
   * A frame already in flight when the stop landed can still add one last
   * reading, so the window is measured from a settled count rather than from
   * the instant of the click.
   */
  async expectChartStopsGrowing(): Promise<void> {
    const settled = await this.settledChartPointCount();
    const deadline = Date.now() + CHART_STOPPED_OBSERVATION_MS;
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(CHART_SAMPLE_INTERVAL_MS);
      expect(
        await this.chartPointCount(),
        'the chart kept plotting after the smoke was stopped, so temperatures are still being recorded'
      ).toBe(settled);
    }
  }

  /**
   * Resolve once the chart is drawing the cook the backend has stored, and
   * answer with how many readings that is.
   *
   * Meant for a freshly loaded page, where the chart can only be drawing what
   * the backend handed it: the count is therefore the stored cook, and a
   * journey holds it as the baseline a later restart must build on rather than
   * replace. An empty chart never settles into a baseline here — it fails,
   * because a reload that lost the cook is the very regression this guards.
   */
  async waitForStoredCookOnChart(): Promise<number> {
    await expect
      .poll(async () => this.chartPointCount(), {
        timeout: 30_000,
        message: 'the chart never drew the cook the backend had already stored',
      })
      .toBeGreaterThan(0);
    return this.chartPointCount();
  }

  /**
   * Assert the chart takes up where it left off: it must grow past `retained`
   * without ever having dropped below it.
   *
   * The low-water mark is the point of this. Growth alone cannot tell a resumed
   * cook from a restarted one, because a chart that was reset to empty climbs
   * back past a modest baseline within seconds — so every sample taken while
   * waiting for growth is also kept, and a chart that ever held fewer readings
   * than it started with fails, whatever it does afterwards.
   */
  async expectChartResumesGrowing(retained: number): Promise<void> {
    let lowest = Number.POSITIVE_INFINITY;
    await expect
      .poll(
        async () => {
          const points = await this.chartPointCount();
          lowest = Math.min(lowest, points);
          return points;
        },
        {
          intervals: [CHART_SAMPLE_INTERVAL_MS],
          timeout: 30_000,
          message: 'the chart never resumed recording after the smoke was restarted',
        }
      )
      .toBeGreaterThan(retained);
    expect(
      lowest,
      'the chart dropped readings it was already holding, so the stop reset the cook instead of pausing it'
    ).toBeGreaterThanOrEqual(retained);
  }

  /**
   * The chart's plotted-reading count, once two consecutive samples agree —
   * i.e. once the last frame the running smoke had already sent has landed.
   */
  private async settledChartPointCount(): Promise<number> {
    let previous = -1;
    await expect
      .poll(
        async () => {
          const points = await this.chartPointCount();
          const unchanged = points === previous;
          previous = points;
          return unchanged;
        },
        {
          intervals: [CHART_SAMPLE_INTERVAL_MS],
          timeout: 15_000,
          message: 'the chart never stopped plotting new temperatures after the smoke was stopped',
        }
      )
      .toBe(true);
    return previous;
  }

  // --- Post-smoke step -----------------------------------------------------

  private get postSmokeRestTime(): Locator {
    return this.page.getByTestId('postsmoke-rest-time-input');
  }

  private get postSmokeNotes(): Locator {
    return this.page.getByTestId('postsmoke-notes-input');
  }

  /**
   * Move to the Post-Smoke step and wait for it to be ready to work with.
   *
   * Like every other step it loads its resource after mounting, so a load
   * landing late would replace what a journey typed with what was stored — and,
   * worse at the end of the wizard, the step saves whatever it is holding when
   * it unmounts, so *finishing* from a step that never hydrated would overwrite
   * the stored post-smoke with an empty form.
   *
   * Meant to be entered from another step (which is what the wizard is showing
   * whenever a journey comes here), so the click always remounts the step and
   * the wait is for a load newer than the mark rather than for mere quiet.
   */
  async openPostSmokeStep(): Promise<void> {
    const landed = this.postSmokeLoads.mark();
    await this.stepButton('Post-Smoke').click();
    await expect(this.postSmokeRestTime).toBeVisible();
    await this.postSmokeLoads.waitForLoadSince(landed);
  }

  /**
   * Fill in the post-smoke step, as a pitmaster wrapping up a cook does: how
   * long the meat rested, what was done to it afterwards, and how it went.
   *
   * The rest time rides a masked `HH:MM` input, which rewrites what is typed
   * into it — so it goes through the same fill-and-verify as every other field
   * rather than a bare fill that would not notice the mask rejecting a value.
   */
  async fillPostSmoke(fields: PostSmokeFields): Promise<void> {
    await this.fillField(this.postSmokeRestTime, fields.restTime);
    await this.fillDynamicList(POST_SMOKE_STEPS, fields.steps);
    await this.fillField(this.postSmokeNotes, fields.notes);
  }

  /**
   * Drop one wrap-up step by position. As on the pre-smoke step, the last row
   * carries the add button rather than a remove one, so it cannot be dropped
   * this way.
   */
  async removePostSmokeStep(index: number): Promise<void> {
    await this.removeDynamicListRow(POST_SMOKE_STEPS, index);
  }

  /**
   * Assert the post-smoke step shows the given values — the read half of the
   * fill/expect pair, used after a reload to prove the backend supplied them.
   */
  async expectPostSmokeShows(fields: PostSmokeFields): Promise<void> {
    await expect(this.postSmokeRestTime).toHaveValue(fields.restTime);
    await this.expectDynamicList(POST_SMOKE_STEPS, fields.steps);
    await expect(this.postSmokeNotes).toHaveValue(fields.notes);
  }

  /**
   * Leave the Post-Smoke step for the pre-smoke step, committing the typed
   * values.
   *
   * Worth doing before finishing rather than leaning on the unmount save that
   * Finish itself triggers: finishing archives the smoke and clears the session
   * a beat later, so a save still in flight can land after the clear and be
   * lost. Committing here proves the values are stored *before* the archive.
   */
  async leavePostSmokeStep(): Promise<void> {
    await this.leaveStepCommitting('/api/postSmoke/current', () => this.returnToPreSmokeStep());
  }

  /**
   * Finish the smoke from the Post-Smoke step: archive it and land on the
   * completion screen.
   *
   * The archive is awaited and asserted accepted, so a rejected finish fails
   * here — at the archive — instead of surfacing later as a smoke mysteriously
   * absent from history. The completion screen is what says the whole sequence
   * (archive, then clear) ran: it takes the place of the post-smoke step only
   * once both have — a failure of either leaves the step, and its Finish, where
   * they were.
   */
  async finishSmoke(): Promise<void> {
    const archived = this.page.waitForResponse(
      res => res.url().endsWith('/api/smoke/finish') && res.request().method() === 'POST'
    );
    await this.nextButton.click();
    const response = await archived;
    expect(
      response.ok(),
      `archiving the smoke was rejected: POST /api/smoke/finish -> ${response.status()} ${await response
        .text()
        .catch(() => '')}`
    ).toBeTruthy();
    await expect(this.page.getByTestId('smoke-complete')).toBeVisible();
  }

  /**
   * Take the completion screen's own way to the history of finished cooks.
   *
   * Arriving means the history is on screen *and* the bottom bar says so: being
   * taken somewhere without tapping the bar is exactly the case that used to
   * leave HISTORY on screen with SMOKE lit in accent, so the tab is asserted
   * here rather than assumed to follow the screen.
   */
  async viewHistoryFromCompletion(): Promise<void> {
    await this.page.getByTestId('smoke-complete-view-history').click();
    await expect(this.page.getByTestId('history-screen')).toBeVisible();
    await expect(this.page.getByTestId('nav-history')).toHaveClass(/Mui-selected/);
    await expect(this.page.getByTestId('nav-smoke')).not.toHaveClass(/Mui-selected/);
  }

  /** Advance to the Post-Smoke step, enter a rest time, and finish the smoke. */
  async completePostSmoke(restTime: string): Promise<void> {
    await this.openPostSmokeStep();
    await this.fillField(this.postSmokeRestTime, restTime);
    await this.finishSmoke();
  }

  async openHistory(): Promise<void> {
    await this.page.getByTestId('nav-history').click();
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
   * the History tab to refetch until the card appears.
   */
  async expectHistoryContains(name: string): Promise<void> {
    await expect(async () => {
      if (!(await this.historyCard(name).isVisible())) {
        await this.page.getByTestId('nav-smoke').click();
        await this.page.getByTestId('nav-history').click();
      }
      await expect(this.historyCard(name)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  }

  /** Assert a smoke is absent from the history list, refetching to be sure. */
  async expectHistoryMissing(name: string): Promise<void> {
    await expect(async () => {
      await this.page.getByTestId('nav-smoke').click();
      await this.page.getByTestId('nav-history').click();
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

  /**
   * Delete a completed smoke from its history card.
   *
   * The trash icon only asks: the delete itself is behind the confirmation
   * sheet, so the journey answers it the way a user would.
   */
  async deleteFromHistory(name: string): Promise<void> {
    await this.historyCardFor(name).getByTestId('smoke-card-delete-button').click();
    const sheet = this.page.getByTestId('delete-smoke-sheet');
    await expect(sheet).toContainText(name);
    await sheet.getByTestId('delete-smoke-sheet-confirm').click();
    await expect(sheet).toBeHidden();
  }

  /**
   * Assert the review cards render the values a smoke was finished with. Covers
   * the pre-smoke, smoke-profile and post-smoke cards in one intent-revealing
   * check; ratings have their own accessor because they are interactive.
   *
   * Every assertion is scoped to a card's own test id rather than to the page's
   * text. The profile card hands the chamber and probe names straight on to the
   * chart it draws, so the same strings appear twice on screen — a page-wide
   * text check would pass on the chart alone and prove nothing about the card.
   */
  async expectReviewShows(fields: ReviewFields): Promise<void> {
    await expect(this.page.getByTestId('review-presmoke-name')).toHaveText(fields.name);
    await expect(this.page.getByTestId('review-presmoke-meattype')).toHaveText(fields.meatType);
    await expect(this.page.getByTestId('review-presmoke-weight')).toContainText(fields.weight);
    if (fields.preSmokeSteps !== undefined) {
      await this.expectReviewSteps('review-presmoke-section', fields.preSmokeSteps);
    }
    if (fields.preSmokeNotes !== undefined) {
      await this.expectReviewNotes('review-presmoke-section', fields.preSmokeNotes);
    }
    if (fields.chamberName !== undefined) {
      await expect(this.page.getByTestId('review-smoke-chambername')).toHaveText(
        fields.chamberName
      );
    }
    for (const probe of [1, 2, 3] as const) {
      const name = fields[`probe${probe}Name`];
      if (name !== undefined) {
        await expect(this.page.getByTestId(`review-smoke-probe${probe}name`)).toHaveText(name);
      }
    }
    // The wood the cook ran on reads under "what went in" on the redesigned
    // detail, so it is asserted where the design put it — the pre-smoke grid.
    await expect(this.page.getByTestId('review-presmoke-wood')).toHaveText(fields.woodType);
    if (fields.smokeNotes !== undefined) {
      await this.expectReviewNotes('review-smoke-section', fields.smokeNotes);
    }
    await expect(this.page.getByTestId('review-postsmoke-resttime')).toHaveText(
      humanizedRestOf(fields.restTime)
    );
    if (fields.postSmokeSteps !== undefined) {
      await this.expectReviewSteps('review-postsmoke-section', fields.postSmokeSteps);
    }
    if (fields.postSmokeNotes !== undefined) {
      await this.expectReviewNotes('review-postsmoke-section', fields.postSmokeNotes);
    }
  }

  /**
   * Assert a review section lists exactly `steps`, in order.
   *
   * A section numbers each step as it renders it (a badge, then the step), so
   * the expected text carries the position too — which is what makes this an
   * assertion about *order* rather than about a set of strings that happen to
   * be present. The steps live in the section's own step list, so the lookup is
   * scoped to the section rather than to the page.
   */
  private async expectReviewSteps(sectionTestId: string, steps: string[]): Promise<void> {
    const rendered = this.page.getByTestId(sectionTestId).getByTestId('step-list-step');
    await expect(rendered).toHaveCount(steps.length);
    for (const [index, step] of steps.entries()) {
      // The number badge and the step are adjacent nodes, so the rendered text
      // is the position, optional whitespace, then the step itself.
      await expect(rendered.nth(index)).toHaveText(
        new RegExp(`^${index + 1}\\s*${escapeForRegExp(step)}$`)
      );
    }
  }

  /**
   * Assert a review card's notes carry the whole note that was entered.
   *
   * A card renders notes as flowing text, so the line breaks a journey typed are
   * not in the rendering — but the note can still be matched whole, because a
   * text assertion normalises whitespace on *both* sides: the typed `\n` and the
   * rendered line wrap both collapse to a single space before they are compared.
   * Asserting it in one call is what makes this a check that the lines are
   * present, contiguous and in order, which checking them one at a time would
   * not be.
   *
   * (The wizard-side reads are the opposite case: `toHaveValue` does not
   * normalise, so those keep asserting the exact text including its newlines.)
   */
  private async expectReviewNotes(sectionTestId: string, notes: string): Promise<void> {
    if (notes === '') {
      throw new Error(
        `cannot assert the "${sectionTestId}" notes against an empty string: a section with no ` +
          `note renders no note block, so the check must be handed the words that should be there`
      );
    }
    await expect(this.page.getByTestId(sectionTestId).getByTestId('note-block')).toContainText(
      notes
    );
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

  /**
   * Open Settings, waiting on a card the page renders from nothing but itself.
   *
   * Deliberately not a field inside the notifications card: those controls come
   * and go with what the backend has stored — the chamber range, for one, is on
   * screen only while the Temperature Alert is switched on — so a journey that
   * merely wants to reach Settings would hang on them. The Appearance card is
   * always there, and it needs no backend read to render.
   */
  async openSettings(): Promise<void> {
    await this.page.getByTestId('nav-settings').click();
    await expect(this.page.getByTestId('settings-appearance-card')).toBeVisible();
  }

  private get chamberLow(): Locator {
    return this.page.getByTestId('settings-chamber-low');
  }

  private get chamberHigh(): Locator {
    return this.page.getByTestId('settings-chamber-high');
  }

  /**
   * Type a chamber range in Settings (persisted when the tab unmounts). The
   * range control exists only while the Temperature Alert is switched on, which
   * is what the fixture seeds.
   */
  async setChamberRange(range: { low: number; high: number }): Promise<void> {
    await this.chamberLow.fill(String(range.low));
    await this.chamberHigh.fill(String(range.high));
  }

  async expectChamberRange(range: { low: number; high: number }): Promise<void> {
    await expect(this.chamberLow).toHaveValue(String(range.low));
    await expect(this.chamberHigh).toHaveValue(String(range.high));
  }

  /** Choose how the app looks, from the Appearance card in Settings. */
  async chooseAppearance(option: AppearanceOption): Promise<void> {
    await this.page.getByRole('button', { name: option, exact: true }).click();
    await this.expectAppearanceChosen(option);
  }

  /** Assert which Appearance option the card shows as active. */
  async expectAppearanceChosen(option: AppearanceOption): Promise<void> {
    await expect(this.page.getByRole('button', { name: option, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  }

  /**
   * Assert the colour the settings page is actually painted, as the browser
   * computes it — the one thing about a theme worth pinning to a value, because
   * it is what the operator is looking at.
   */
  async expectSettingsBackground(hex: string): Promise<void> {
    await expect
      .poll(() =>
        this.page
          .getByTestId('settings-page')
          .evaluate(element => getComputedStyle(element).backgroundColor)
      )
      .toBe(toRgb(hex));
  }

  /**
   * Leave Settings via the Smoke tab. Settings persists on unmount, so this is
   * how a change is committed before a reload re-reads it from the backend.
   */
  async leaveSettings(): Promise<void> {
    await this.page.getByTestId('nav-smoke').click();
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
  }

  /**
   * Assert the bottom navigation bar covers nothing of the screen behind it:
   * with the page scrolled as far down as it goes — where a fixed bar and the
   * end of a screen meet — the screen ends at or above the top of the bar.
   *
   * `fitsTheViewport` holds the screen to the room the bar leaves it as well:
   * the whole screen, everything it stacks, inside `100vh` less the bar. That
   * is what a screen fails when a box *inside* it claims a slice of the
   * viewport for itself — the claim reads as though that box were alone on the
   * page, and whatever the screen stacks around it is added on top, scrolling a
   * screen whose content fits perfectly well.
   */
  async expectClearsBottomBar(
    screen: ScreenName,
    { fitsTheViewport = false }: { fitsTheViewport?: boolean } = {}
  ): Promise<void> {
    await expect(this.page.locator(SCREEN_ROOTS[screen])).toBeVisible();
    await this.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const measured = await this.page.evaluate(selector => {
      const box = (element: Element | null) => element?.getBoundingClientRect();

      return {
        screen: box(document.querySelector(selector)),
        bar: box(document.querySelector('[data-testid="bottom-navigation"]')),
        viewport: window.innerHeight,
      };
    }, SCREEN_ROOTS[screen]);

    expect(measured.screen?.bottom ?? Infinity).toBeLessThanOrEqual(
      (measured.bar?.top ?? 0) + SUB_PIXEL
    );
    if (fitsTheViewport) {
      expect(measured.screen?.height ?? Infinity).toBeLessThanOrEqual(
        measured.viewport - BOTTOM_BAR_HEIGHT + SUB_PIXEL
      );
    }
  }

  async reload(): Promise<void> {
    const landed = this.preSmokeLoads.mark();
    await this.page.reload();
    await expect(this.stepButton('Pre-Smoke')).toBeVisible();
    // A reload restarts the wizard on the pre-smoke step, so its load is always
    // issued; waiting for it here means the values read back after a reload are
    // the backend's, not the blank form the step renders until the load lands.
    await this.preSmokeLoads.waitForLoadSince(landed);
  }
}
