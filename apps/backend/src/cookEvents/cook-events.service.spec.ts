import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { StateService } from '../State/state.service';
import { AppSettingsService } from '../appSettings/app-settings.service';
import { CookStamp, defaultStamps } from '../appSettings/stamp-catalogue';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { TempsService } from '../temps/temps.service';
import { EventsGateway } from '../websocket/events.gateway';
import {
  COOK_EVENT_CLOCK_SKEW_MS,
  COOK_EVENT_MAX_BACKDATE_MS,
  CookEventsService,
} from './cook-events.service';
import { FakeDoc, fakeCollection } from './testing/fake-collection';

describe('CookEventsService', () => {
  let service: CookEventsService;
  let stored: FakeDoc[];
  let state: { smokeId: string; smoking: boolean } | undefined;
  let latestReading: FakeDoc | undefined;
  let catalogue: CookStamp[];
  let broadcast: jest.Mock;
  let readingAt: jest.Mock;
  let currentSmoke: jest.Mock;

  const build = async (): Promise<CookEventsService> => {
    broadcast = jest.fn();
    readingAt = jest.fn(async () => undefined);
    currentSmoke = jest.fn(async () => ({}));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookEventsService,
        {
          provide: getModelToken('CookEvent'),
          useValue: fakeCollection(stored),
        },
        { provide: StateService, useValue: { GetState: async () => state } },
        {
          provide: TempsService,
          useValue: {
            getLatestCurrentTemp: async () => latestReading,
            getCurrentTempAt: (at: Date) => readingAt(at),
          },
        },
        {
          provide: CurrentSmokeService,
          useValue: { currentSmoke: () => currentSmoke() },
        },
        {
          provide: AppSettingsService,
          useValue: {
            getSettings: async () => ({ cookLog: { stamps: catalogue } }),
          },
        },
        {
          provide: EventsGateway,
          useValue: { broadcastCookEvents: broadcast },
        },
      ],
    }).compile();
    return module.get<CookEventsService>(CookEventsService);
  };

  beforeEach(async () => {
    stored = [];
    state = { smokeId: 'smoke-1', smoking: true };
    catalogue = defaultStamps();
    latestReading = {
      ChamberTemp: '243',
      MeatTemp: '162',
      Meat2Temp: '158',
      Meat3Temp: '0',
      date: new Date('2026-08-25T12:00:00.000Z'),
    };
    service = await build();
  });

  it('records the cook, the stamp and the pit as it was at that instant', async () => {
    const before = Date.now();

    const recorded = await service.record('wrap');

    expect(recorded.smokeId).toBe('smoke-1');
    expect(recorded.stampKey).toBe('wrap');
    expect(recorded.label).toBe('Wrapped');
    expect(recorded.tone).toBe('p1');
    expect(recorded.chamberTemp).toBe(243);
    expect(recorded.probe1Temp).toBe(162);
    expect(recorded.probe2Temp).toBe(158);
    expect(recorded.probe3Temp).toBe(0);
    // The server's clock, not the caller's: a kiosk running fast must not
    // reorder the log.
    expect(recorded.at.getTime()).toBeGreaterThanOrEqual(before);
    expect(recorded.at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('records an event even when the cook has reported no readings yet', async () => {
    latestReading = undefined;

    const recorded = await service.record('wood');

    expect(recorded.chamberTemp).toBeNull();
    expect(recorded.probe1Temp).toBeNull();
    expect(await service.listCurrent()).toHaveLength(1);
  });

  it('refuses to record when no cook is in progress', async () => {
    state = { smokeId: '', smoking: false };

    await expect(service.record('wood')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(stored).toHaveLength(0);
  });

  it('refuses to record a stamp nobody has heard of', async () => {
    await expect(service.record('teleport')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(stored).toHaveLength(0);
  });

  it('lists the current cook only, oldest first', async () => {
    stored.push({
      _id: 'other-1',
      smokeId: 'smoke-0',
      stampKey: 'wood',
      at: new Date('2026-08-24T10:00:00.000Z'),
    });
    await service.record('wood');
    await service.record('spritz');

    const events = await service.listCurrent();

    expect(events.map((event) => event.stampKey)).toEqual(['wood', 'spritz']);
    expect(events.every((event) => event.smokeId === 'smoke-1')).toBe(true);
  });

  it('lists nothing for a session with no cook set up', async () => {
    await service.record('wood');
    state = { smokeId: '', smoking: false };

    expect(await service.listCurrent()).toEqual([]);
  });

  it('lists a stored cook by its id', async () => {
    await service.record('wood');

    expect(await service.listForSmoke('smoke-1')).toHaveLength(1);
    expect(await service.listForSmoke('smoke-0')).toEqual([]);
  });

  it('removes one mis-tapped event and leaves the rest', async () => {
    await service.record('wood');
    const spritz = await service.record('spritz');

    await service.remove(spritz['_id'].toString());

    expect(
      (await service.listCurrent()).map((event) => event.stampKey),
    ).toEqual(['wood']);
  });

  it('announces the whole current log on every write', async () => {
    await service.record('wood');

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(
      broadcast.mock.calls[0][0].map((event: any) => event.stampKey),
    ).toEqual(['wood']);

    const spritz = await service.record('spritz');
    expect(broadcast.mock.calls[1][0]).toHaveLength(2);

    await service.remove(spritz['_id'].toString());
    expect(broadcast).toHaveBeenCalledTimes(3);
    expect(
      broadcast.mock.calls[2][0].map((event: any) => event.stampKey),
    ).toEqual(['wood']);
  });

  it('keeps recording when the announcement cannot be made', async () => {
    broadcast.mockImplementation(() => {
      throw new Error('no socket server yet');
    });

    await expect(service.record('wood')).resolves.toBeDefined();
    expect(await service.listCurrent()).toHaveLength(1);
  });

  it('records the stamp as the catalogue now has it, not as it shipped', async () => {
    catalogue = defaultStamps().map((stamp) =>
      stamp.key === 'wood' ? { ...stamp, label: 'Split', tone: 'p2' } : stamp,
    );

    const recorded = await service.record('wood');

    expect(recorded.label).toBe('Split');
    expect(recorded.tone).toBe('p2');
  });

  it('records a stamp the user added', async () => {
    catalogue = [
      ...defaultStamps(),
      {
        key: 'custom-01ARZ3NDEKTSV4RRFFQ69G5FAV',
        label: 'Foil Boat',
        tone: 'amber',
        enabled: true,
        custom: true,
      },
    ];

    const recorded = await service.record('custom-01ARZ3NDEKTSV4RRFFQ69G5FAV');

    expect(recorded.label).toBe('Foil Boat');
  });

  it('refuses to record a stamp the user has switched off', async () => {
    catalogue = defaultStamps().map((stamp) =>
      stamp.key === 'lid' ? { ...stamp, enabled: false } : stamp,
    );

    await expect(service.record('lid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(stored).toHaveLength(0);
  });

  /**
   * A stamp logged by voice was done when it was spoken of, not when the review
   * list was finally filled: the caller may say when, within a narrow window.
   */
  describe('a stamp that says when it was done', () => {
    const minutesAgo = (minutes: number): Date =>
      new Date(Date.now() - minutes * 60 * 1000);

    it('reads no past moment for a tap that names none', async () => {
      await service.record('wrap');

      expect(readingAt).not.toHaveBeenCalled();
      expect(currentSmoke).not.toHaveBeenCalled();
    });

    it('stores the moment it was given and the pit as it was then', async () => {
      const spoken = minutesAgo(2);
      readingAt.mockResolvedValue({
        ChamberTemp: '236',
        MeatTemp: '160',
        Meat2Temp: '155',
        Meat3Temp: '',
        date: minutesAgo(2.1),
      });

      const recorded = await service.record('wrap', spoken);

      expect(recorded.at).toEqual(spoken);
      expect(readingAt).toHaveBeenCalledWith(spoken);
      // The pit two minutes ago, not the newest reading.
      expect(recorded.chamberTemp).toBe(236);
      expect(recorded.probe1Temp).toBe(160);
      expect(recorded.probe2Temp).toBe(155);
      expect(recorded.probe3Temp).toBeNull();
      expect((await service.listCurrent())[0].at).toEqual(spoken);
    });

    it('stores the moment with no readings when the pit cannot be read for it', async () => {
      readingAt.mockRejectedValue(new Error('mongo is away'));

      const recorded = await service.record('wrap', minutesAgo(1));

      expect(recorded.chamberTemp).toBeNull();
      expect(await service.listCurrent()).toHaveLength(1);
    });

    it('takes a moment a little ahead of its own clock as now', async () => {
      const before = Date.now();
      const ahead = new Date(before + COOK_EVENT_CLOCK_SKEW_MS / 2);

      const recorded = await service.record('wrap', ahead);

      expect(recorded.at.getTime()).toBeGreaterThanOrEqual(before);
      expect(recorded.at.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('refuses a moment that has not happened yet', async () => {
      const future = new Date(Date.now() + COOK_EVENT_CLOCK_SKEW_MS + 60_000);

      await expect(service.record('wrap', future)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stored).toHaveLength(0);
    });

    it('refuses a moment further back than a Ramble waits to be filled', async () => {
      const longAgo = new Date(
        Date.now() - COOK_EVENT_MAX_BACKDATE_MS - 60_000,
      );

      await expect(service.record('wrap', longAgo)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stored).toHaveLength(0);
    });

    it('accepts a moment just inside that window', async () => {
      const inside = new Date(Date.now() - COOK_EVENT_MAX_BACKDATE_MS + 60_000);

      expect((await service.record('wrap', inside)).at).toEqual(inside);
    });

    it('refuses a moment from before the cook was started', async () => {
      currentSmoke.mockResolvedValue({ startedAt: minutesAgo(5) });

      await expect(
        service.record('wrap', minutesAgo(10)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stored).toHaveLength(0);
    });

    it('takes a moment a little before the start as the start', async () => {
      const startedAt = minutesAgo(5);
      currentSmoke.mockResolvedValue({ startedAt });

      const recorded = await service.record(
        'wrap',
        new Date(startedAt.getTime() - COOK_EVENT_CLOCK_SKEW_MS / 2),
      );

      expect(recorded.at).toEqual(startedAt);
    });

    it('holds a cook whose start cannot be read to the window alone', async () => {
      currentSmoke.mockRejectedValue(new Error('mongo is away'));
      const spoken = minutesAgo(3);

      expect((await service.record('wrap', spoken)).at).toEqual(spoken);
    });

    it('still answers no cook before it answers a bad moment', async () => {
      state = { smokeId: '', smoking: false };

      await expect(
        service.record('wrap', new Date('2020-01-01T00:00:00.000Z')),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
