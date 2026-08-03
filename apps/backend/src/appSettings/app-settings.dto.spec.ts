import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ApplicationSettingsDto } from './app-settings.dto';

/**
 * The application settings endpoint runs under the app's global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform), so the DTO is the contract:
 * anything it does not declare is a 400, and the settings page's
 * save-on-unmount fails silently when the two disagree. These tests pin it to
 * the exact shapes its two writers send.
 */
describe('ApplicationSettingsDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: ApplicationSettingsDto };

  it('accepts the chamber Temperature Alert the settings page saves', async () => {
    const body = { chamber: { enabled: true, low: 225, high: 275 } };

    const result = await pipe.transform(body, metadata);

    expect(result.chamber).toEqual({ enabled: true, low: 225, high: 275 });
  });

  it('accepts the probe watch list and targets the settings page saves', async () => {
    const body = {
      chamber: { enabled: true, low: 225, high: 275 },
      probeTarget: {
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 203 },
          { slot: 'probe2', enabled: false, target: 195 },
        ],
      },
    };

    const result = await pipe.transform(body, metadata);

    expect(result.probeTarget).toEqual(body.probeTarget);
  });

  // The names shown against each row are resolved from the active cook and
  // served on the read, so a document read then saved carries them back. They
  // are not the user's to set, and forbidNonWhitelisted would 400 the save.
  it('rejects a resolved probe name sent back on a save', async () => {
    const body = {
      chamber: { enabled: true, low: 225, high: 275 },
      probeTarget: {
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 203, name: 'Brisket Flat' },
        ],
      },
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a probe target that is not a number', async () => {
    const body = {
      chamber: { enabled: true, low: 225, high: 275 },
      probeTarget: {
        enabled: true,
        probes: [{ slot: 'probe1', enabled: true, target: 'done' }],
      },
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /**
   * A browser that repaints itself sends nothing but the appearance — sending
   * the alert block back would make every repaint a save of settings the
   * operator may be editing in another tab.
   */
  // The settings page saves every alert block it owns in one body, so a block
  // the DTO does not declare is a 400 the save-on-unmount can only swallow —
  // which is exactly how a toggle silently fails to persist.
  it('accepts the Smoke Complete alert alongside the other alerts', async () => {
    const body = {
      chamber: { enabled: true, low: 225, high: 275 },
      probeTarget: {
        enabled: true,
        probes: [{ slot: 'probe1', enabled: true, target: 203 }],
      },
      smokeComplete: { enabled: true },
    };

    const result = await pipe.transform(body, metadata);

    expect(result.smokeComplete).toEqual({ enabled: true });
  });

  it('rejects a Smoke Complete alert that is switched on with something other than a boolean', async () => {
    const body = { smokeComplete: { enabled: 'yes' } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an appearance on its own, with no alert block', async () => {
    const body = { appearance: { mode: 'dark', resolvedMode: 'dark' } };

    const result = await pipe.transform(body, metadata);

    expect(result.appearance).toEqual({ mode: 'dark', resolvedMode: 'dark' });
    expect(result.chamber).toBeUndefined();
  });

  it('rejects a mode that is not one of the three choices', async () => {
    const body = { appearance: { mode: 'sepia', resolvedMode: 'light' } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /** "Follow the device" is a choice, never an answer. */
  it('rejects a resolved value of "system"', async () => {
    const body = { appearance: { mode: 'system', resolvedMode: 'system' } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects the deleted freeform rule list rather than storing it', async () => {
    const body = {
      settings: [
        { type: false, message: 'Chamber hot', probe1: 'Chamber', op: '>' },
      ],
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a range whose bounds are not numbers', async () => {
    const body = { chamber: { enabled: true, low: 'cold', high: 275 } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown top-level property', async () => {
    const body = {
      chamber: { enabled: false, low: 225, high: 275 },
      bogus: true,
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
