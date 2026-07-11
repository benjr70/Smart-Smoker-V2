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

  private get connectionStatus(): Locator {
    return this.page.getByTestId('smoker-connection-status');
  }

  /** Current numeric chamber readout (0 before any emulator temp arrives). */
  async chamberTempValue(): Promise<number> {
    return Number((await this.chamberTemp.innerText()).trim());
  }

  /**
   * Assert the smoker reports itself connected to the device relay. In the
   * hermetic stack the indicator stays connected (the production-only poll that
   * would flip it to disconnected is skipped), so this guards that the relay
   * surface is present and healthy rather than exercising a drop.
   */
  async expectConnected(): Promise<void> {
    await expect(this.connectionStatus).toHaveAttribute('data-connected', 'true');
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

  /** Resolve once the device-service emulator temps reach the readout. */
  async waitForLiveTemps(): Promise<void> {
    await expect.poll(async () => this.chamberTempValue(), { timeout: 30_000 }).toBeGreaterThan(0);
  }

  /**
   * Assert the readout keeps changing while the emulator ramps: capture the
   * current value, then poll until a later sample differs. This proves temps
   * are streaming through the relay live, not frozen on a first frame.
   */
  async expectReadoutChanging(): Promise<void> {
    const first = await this.chamberTempValue();
    await expect.poll(async () => this.chamberTempValue(), { timeout: 30_000 }).not.toBe(first);
  }
}
