import { expect, Locator, Page } from '@playwright/test';

/**
 * What a page's address carries to be given Voice Fill on the scripted models.
 *
 * `voiceFill=scripted` asks for them — and is only answered by a bundle built
 * to allow them, which the hermetic stack's is and a published image never is.
 * `voiceFillPhone=capable` has the phone taken as able to run Voice Fill: the
 * scripted models need no WebGPU, and the headless browser these journeys run
 * in has no adapter to offer.
 */
export const SCRIPTED_VOICE_FILL_QUERY = 'voiceFill=scripted&voiceFillPhone=capable';

/** The two models a phone picks: the one that hears, and the one that reads. */
export type ModelRole = 'speech' | 'extractor';

/**
 * How long the Voice fill button may take to show. It stands behind a grey
 * pill until the picked pair of models is on the phone, and a first opening of
 * the app starts that download by itself — scripted, so it takes seconds.
 */
const MODELS_READY_TIMEOUT_MS = 30_000;

/**
 * Page object for Voice Fill: the button a screen offers, the sheet a Ramble is
 * taken through, the toast a fill leaves, and the card in Settings the models
 * are picked on.
 *
 * It drives whichever screen is up — the button, the sheet and the toast are
 * the same on every screen that has them — so a journey pairs it with the
 * `FrontendApp` that gets it there.
 */
export class VoiceFill {
  constructor(private readonly page: Page) {}

  private get button(): Locator {
    return this.page.getByTestId('voice-fill-button');
  }

  private get sheet(): Locator {
    return this.page.getByTestId('voice-fill-sheet');
  }

  private get rows(): Locator {
    return this.sheet.locator('[data-testid^="voice-fill-row-"]');
  }

  private row(id: string): Locator {
    return this.page.getByTestId(`voice-fill-row-${id}`);
  }

  private get toast(): Locator {
    return this.page.getByTestId('voice-fill-toast');
  }

  /**
   * Speak a Ramble: tap Voice fill, let the sheet hear something, and tap Done
   * talking. Returns once the sheet has moved on from listening.
   *
   * The words arriving are waited for because they are what "listening" means
   * to a cook — a sheet that opened and heard nothing would otherwise be tapped
   * through just the same.
   */
  async ramble(): Promise<void> {
    await expect(this.button).toBeVisible({ timeout: MODELS_READY_TIMEOUT_MS });
    await this.button.click();
    await expect(this.sheet).toBeVisible();
    await expect(this.page.getByTestId('voice-fill-live-transcript')).not.toHaveText(
      'Start talking…'
    );
    await this.page.getByTestId('voice-fill-done-talking').click();
  }

  /**
   * Assert the review list proposes exactly these rows, in this order, every
   * one of them ticked — which is how a Ramble's rows arrive.
   */
  async expectReview(rowIds: readonly string[]): Promise<void> {
    await expect(this.page.getByTestId('voice-fill-title')).toHaveText(
      `Found ${fieldCount(rowIds.length)}`
    );
    await expect
      .poll(() =>
        this.rows.evaluateAll(rows =>
          rows.map(row => (row.getAttribute('data-testid') ?? '').replace('voice-fill-row-', ''))
        )
      )
      .toEqual(rowIds);
    for (const id of rowIds) {
      await expect(this.row(id)).toHaveAttribute('aria-checked', 'true');
    }
  }

  /** Assert a review row proposes `text` — the value it would write, as the cook reads it. */
  async expectRowProposes(id: string, text: string | RegExp): Promise<void> {
    await expect(this.row(id)).toContainText(text);
  }

  /** Untick a review row, so the fill leaves its field alone. */
  async untick(id: string): Promise<void> {
    await this.row(id).click();
    await expect(this.row(id)).toHaveAttribute('aria-checked', 'false');
  }

  /**
   * Fill from the ticked rows, and wait for the toast that says how many fields
   * were written. `count` is asserted on the button before the tap as well as on
   * the toast after it, so a row that was ticked but not written shows up as the
   * disagreement between the two.
   */
  async fill(count: number): Promise<void> {
    const fill = this.page.getByTestId('voice-fill-fill');
    await expect(fill).toHaveText(`Fill ${fieldCount(count)}`);
    await fill.click();
    await expect(this.sheet).toBeHidden();
    await expect(this.toast).toContainText(`Filled ${fieldCount(count)} by voice`);
  }

  /** Take the fill back from its toast. */
  async undo(): Promise<void> {
    await this.page.getByTestId('voice-fill-undo').click();
    await expect(this.toast).toBeHidden();
  }

  // --- The settings card ---------------------------------------------------

  private get settingsCard(): Locator {
    return this.page.getByTestId('settings-voice-fill-card');
  }

  private modelStatus(role: ModelRole): Locator {
    return this.page.getByTestId(`voice-fill-model-status-${role}`).getByRole('status');
  }

  /** Assert Settings shows the Voice Fill card, with a dropdown for each model. */
  async expectSettingsCard(): Promise<void> {
    await expect(this.settingsCard).toBeVisible();
    await expect(this.settingsCard.getByRole('combobox')).toHaveCount(2);
  }

  /** Assert which model a role's dropdown shows as picked. */
  async expectPickedModel(role: ModelRole, name: string): Promise<void> {
    await expect(
      this.page.getByTestId(`voice-fill-model-${role}`).getByRole('combobox')
    ).toHaveText(name);
  }

  /** Assert what a role's status line says of its picked model. */
  async expectModelStatus(role: ModelRole, status: RegExp): Promise<void> {
    await expect(this.modelStatus(role)).toHaveText(status, { timeout: MODELS_READY_TIMEOUT_MS });
  }

  /**
   * Start recording everything a role's status line says from here on, and
   * answer with a way to read it back.
   *
   * A download is over in well under a second on the scripted downloader, so
   * "it said Downloading before it said Ready" cannot be asked by looking at
   * the line now and then — the look would have to land inside that second.
   * Recorded in the page, every state the line passed through is there to be
   * asserted on afterwards, however briefly it was shown.
   */
  async recordModelStatus(role: ModelRole): Promise<() => Promise<string[]>> {
    const line = this.page.getByTestId(`voice-fill-model-status-${role}`);
    await line.evaluate((element, key) => {
      const said: string[] = [];
      (window as unknown as Record<string, string[]>)[key] = said;
      const note = (): void => {
        const text = element.querySelector('[role="status"]')?.textContent ?? '';
        if (text && said[said.length - 1] !== text) {
          said.push(text);
        }
      };
      new MutationObserver(note).observe(element, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }, recordingKey(role));
    return () =>
      this.page.evaluate(
        key => (window as unknown as Record<string, string[]>)[key] ?? [],
        recordingKey(role)
      );
  }

  /** Pick a model from a role's dropdown, which starts its download. */
  async pickModel(role: ModelRole, name: string): Promise<void> {
    await this.page.getByTestId(`voice-fill-model-${role}`).getByRole('combobox').click();
    await this.page.getByRole('option', { name }).click();
    await this.expectPickedModel(role, name);
  }

  /** Remove a downloaded model from the phone, by the button its status line carries. */
  async removeModel(name: string): Promise<void> {
    await this.settingsCard.getByRole('button', { name: `Remove ${name}` }).click();
  }
}

/** `N fields`, or `1 field` — as the sheet and the toast count them. */
const fieldCount = (count: number): string => `${count} ${count === 1 ? 'field' : 'fields'}`;

/** Where a role's recorded status line is kept on the page. */
const recordingKey = (role: ModelRole): string => `__voiceFillStatus_${role}`;
