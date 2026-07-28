import { expect, Locator, Page } from '@playwright/test';
import { resolveUrls } from '../config/urls';

/**
 * Page object for the smoker touchscreen app, driven as a web page.
 *
 * The smoker relays temperatures only while its home screen is loaded and
 * connected, so the lifecycle spec keeps this page open in its own browser
 * context while asserting the frontend chart in another.
 */
export class SmokerApp {
  private readonly baseUrl: string;

  constructor(private readonly page: Page) {
    this.baseUrl = resolveUrls().smoker;
  }

  async goto(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/`);
    await expect(this.startButton).toBeVisible();
  }

  private get startButton(): Locator {
    return this.page.getByTestId('smoker-start-button');
  }

  get chamberTemp(): Locator {
    return this.page.getByTestId('smoker-chamber-temp');
  }

  async isSmoking(): Promise<boolean> {
    return (await this.startButton.innerText()).trim().toLowerCase() === 'stop smoking';
  }

  /** Toggle smoking on from the smoker home screen. */
  async startSmoke(): Promise<void> {
    if (!(await this.isSmoking())) {
      await this.startButton.click();
    }
    await expect(this.startButton).toHaveText(/stop smoking/i);
  }

  /**
   * Toggle smoking off from the smoker home screen — where a pitmaster ends a
   * cook, the same control they started it with.
   *
   * Expressed as "converge on stopped" rather than "click once", so it is a
   * no-op against a smoke that is already stopped and can never toggle a cook
   * back on by clicking a second time.
   */
  async stopSmoke(): Promise<void> {
    if (await this.isSmoking()) {
      await this.startButton.click();
    }
    await this.expectStopped();
  }

  /**
   * Assert the touchscreen is showing a stopped smoke: its one control offers
   * to *start* one. The control's label is the state, so this reads the state
   * off the element rather than off the absence of another one — a control that
   * still says "Stop Smoking" fails saying exactly that.
   */
  async expectStopped(): Promise<void> {
    await expect(this.startButton).toHaveText(/start smoking/i);
  }

  /** Resolve once the device-service emulator temps reach the readout. */
  async waitForLiveTemps(): Promise<void> {
    await expect
      .poll(async () => Number(await this.chamberTemp.innerText()), { timeout: 30_000 })
      .toBeGreaterThan(0);
  }
}
