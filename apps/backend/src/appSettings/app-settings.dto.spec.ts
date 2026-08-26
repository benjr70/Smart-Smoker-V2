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

  /**
   * How long before a probe reaches its target the cook wants to hear about it.
   * Optional and null-clearable: most rows have no heads-up, and turning one
   * off is a save that says so rather than a field quietly left behind.
   */
  it('accepts a heads-up lead on a probe row, and null to clear it', async () => {
    const body = {
      probeTarget: {
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 203, leadMinutes: 15 },
          { slot: 'probe2', enabled: true, target: 195, leadMinutes: null },
          { slot: 'probe3', enabled: false, target: 165 },
        ],
      },
    };

    const result = await pipe.transform(body, metadata);

    expect(
      result.probeTarget?.probes.map((probe) => probe.leadMinutes),
    ).toEqual([15, null, undefined]);
  });

  it.each([0, -5, 121, 12.5])(
    'rejects a heads-up lead of %p, which is no warning at all or not a number of minutes',
    async (leadMinutes) => {
      const body = {
        probeTarget: {
          enabled: true,
          probes: [{ slot: 'probe1', enabled: true, target: 203, leadMinutes }],
        },
      };

      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('accepts the heads-up alert switch the settings page saves', async () => {
    const result = await pipe.transform(
      { headsUp: { enabled: true } },
      metadata,
    );

    expect(result.headsUp).toEqual({ enabled: true });
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

  /**
   * The settings page marks the row it typed a temperature into, so seeding
   * knows to leave it alone. That mark is part of what a save carries.
   */
  it('accepts the mark distinguishing a hand-set target from a default one', async () => {
    const body = {
      probeTarget: {
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 180, targetSource: 'user' },
          {
            slot: 'probe2',
            enabled: true,
            target: 203,
            targetSource: 'default',
          },
        ],
      },
    };

    const result = await pipe.transform(body, metadata);

    expect(result.probeTarget).toEqual(body.probeTarget);
  });

  it('rejects a provenance that is not one the app records', async () => {
    const body = {
      probeTarget: {
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 180, targetSource: 'guess' },
        ],
      },
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts the default target temps the settings page saves', async () => {
    const body = { targetPresets: { beef: 210, pork: 200, poultry: 165 } };

    const result = await pipe.transform(body, metadata);

    expect(result.targetPresets).toEqual({
      beef: 210,
      pork: 200,
      poultry: 165,
    });
  });

  it('rejects a preset temperature that is not a number', async () => {
    const body = { targetPresets: { beef: 'hot', pork: 200, poultry: 165 } };

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

  it('accepts an auto-stop idle threshold on its own, with no alert block', async () => {
    const body = { autoStop: { idleHours: 12 } };

    const result = await pipe.transform(body, metadata);

    expect(result.autoStop).toEqual({ idleHours: 12 });
    expect(result.chamber).toBeUndefined();
  });

  /**
   * Zero hours would auto-stop a cook the moment a reading was a little late —
   * every live cook, over and over. The rule is the setting's whole safety
   * margin, so it is refused at the edge rather than clamped somewhere inside.
   */
  it('rejects an idle threshold of zero hours', async () => {
    const body = { autoStop: { idleHours: 0 } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a negative idle threshold', async () => {
    const body = { autoStop: { idleHours: -3 } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // A number field left empty on the settings screen arrives as text or as NaN,
  // and either one stored would make every idle comparison false — the cook
  // would never be stopped and nothing would say why.
  it('rejects an idle threshold that is not a number', async () => {
    const body = { autoStop: { idleHours: 'six' } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an auto-stop block with no threshold at all', async () => {
    const body = { autoStop: {} };

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

  describe('the cook log stamp catalogue', () => {
    const catalogue = [
      {
        key: 'wood',
        label: 'Split',
        tone: 'amber',
        enabled: true,
        custom: false,
      },
      {
        key: 'custom-01ARZ3NDEKTSV4RRFFQ69G5FAV',
        label: 'Foil Boat',
        tone: 'p2',
        enabled: false,
        custom: true,
      },
    ];

    it('accepts the whole list the stamp editor saves', async () => {
      const result = await pipe.transform(
        { cookLog: { stamps: catalogue } },
        metadata,
      );

      expect(result.cookLog).toEqual({ stamps: catalogue });
    });

    it('refuses a stamp carrying a field the catalogue does not declare', async () => {
      await expect(
        pipe.transform(
          {
            cookLog: {
              stamps: [{ ...catalogue[0], lastTappedAt: '2026-08-26' }],
            },
          },
          metadata,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a stamp with no label, no key or an unpaintable tone', async () => {
      await expect(
        pipe.transform(
          { cookLog: { stamps: [{ ...catalogue[0], label: '' }] } },
          metadata,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform(
          { cookLog: { stamps: [{ ...catalogue[0], key: '' }] } },
          metadata,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform(
          { cookLog: { stamps: [{ ...catalogue[0], tone: 'purple' }] } },
          metadata,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
