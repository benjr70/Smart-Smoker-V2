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
  let service: { getSettings: jest.Mock; saveSettings: jest.Mock };

  const settings: ApplicationSettings = {
    chamber: { enabled: true, low: 200, high: 250 },
    appearance: { mode: 'dark', resolvedMode: 'dark' },
  };

  beforeEach(async () => {
    service = {
      getSettings: jest.fn().mockResolvedValue(settings),
      saveSettings: jest.fn().mockResolvedValue(settings),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppSettingsController],
      providers: [{ provide: AppSettingsService, useValue: service }],
    }).compile();

    controller = module.get<AppSettingsController>(AppSettingsController);
  });

  it('serves the whole settings document, alerts and appearance alike', async () => {
    expect(await controller.getSettings()).toEqual(settings);
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
