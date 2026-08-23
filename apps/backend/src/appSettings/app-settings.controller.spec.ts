import { Test, TestingModule } from '@nestjs/testing';
import { AppSettingsController } from './app-settings.controller';
import { ApplicationSettings } from './app-settings.schema';
import { AppSettingsService } from './app-settings.service';
import { ApplicationSettingsDto } from './app-settings.dto';

/**
 * The application settings route. It is application-scoped rather than
 * notification-scoped because the document it serves now carries the
 * installation's appearance as well as its alerts, and a browser asking what
 * colour to paint has no business posting to a notifications endpoint.
 */
describe('AppSettingsController', () => {
  let controller: AppSettingsController;
  let service: {
    getSettings: jest.Mock;
    getResolvedSettings: jest.Mock;
    saveSettings: jest.Mock;
  };

  const settings: ApplicationSettings = {
    chamber: { enabled: true, low: 200, high: 250 },
    probeTarget: {
      enabled: true,
      probes: [
        { slot: 'probe1', enabled: true, target: 203, targetSource: 'user' },
      ],
    },
    smokeComplete: { enabled: true },
    targetPresets: { beef: 203, pork: 195, poultry: 165 },
    appearance: { mode: 'dark', resolvedMode: 'dark' },
    autoStop: { idleHours: 12 },
  };

  /** The same document as the read serves it: every probe row named. */
  const resolved = {
    ...settings,
    probeTarget: {
      enabled: true,
      probes: [
        {
          slot: 'probe1',
          enabled: true,
          target: 203,
          targetSource: 'user',
          name: 'Brisket Flat',
        },
      ],
    },
  };

  beforeEach(async () => {
    service = {
      getSettings: jest.fn().mockResolvedValue(settings),
      getResolvedSettings: jest.fn().mockResolvedValue(resolved),
      saveSettings: jest.fn().mockResolvedValue(settings),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppSettingsController],
      providers: [{ provide: AppSettingsService, useValue: service }],
    }).compile();

    controller = module.get<AppSettingsController>(AppSettingsController);
  });

  // The settings page renders a name against every probe row, and those names
  // belong to the cook rather than to the stored settings — so the read has to
  // carry them, or the page would have nothing but slot identifiers to show.
  it('serves the whole settings document, with each probe row named for the current cook', async () => {
    expect(await controller.getSettings()).toEqual(resolved);
  });

  it('propagates a failed read rather than swallowing it', async () => {
    service.getResolvedSettings.mockRejectedValue(
      new Error('Database connection failed'),
    );

    await expect(controller.getSettings()).rejects.toThrow(
      'Database connection failed',
    );
  });

  it('saves the blocks it was given', async () => {
    const body = {
      appearance: { mode: 'dark', resolvedMode: 'dark' },
    } as ApplicationSettingsDto;

    expect(await controller.setSettings(body)).toEqual(settings);
    expect(service.saveSettings).toHaveBeenCalledWith(body);
  });

  it('propagates a refusal to store rather than swallowing it', async () => {
    service.saveSettings.mockRejectedValue(new Error('incoherent'));

    await expect(
      controller.setSettings({
        appearance: { mode: 'light', resolvedMode: 'dark' },
      } as ApplicationSettingsDto),
    ).rejects.toThrow('incoherent');
  });
});
