import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { StateService } from '../State/state.service';
import { AppSettingsService } from '../appSettings/app-settings.service';
import { CookStamp, defaultStamps } from '../appSettings/stamp-catalogue';
import { TempsService } from '../temps/temps.service';
import { EventsGateway } from '../websocket/events.gateway';
import { CookEventsService } from './cook-events.service';
import { FakeDoc, fakeCollection } from './testing/fake-collection';

describe('CookEventsService', () => {
  let service: CookEventsService;
  let stored: FakeDoc[];
  let state: { smokeId: string; smoking: boolean } | undefined;
  let latestReading: FakeDoc | undefined;
  let catalogue: CookStamp[];
  let broadcast: jest.Mock;

  const build = async (): Promise<CookEventsService> => {
    broadcast = jest.fn();
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
          useValue: { getLatestCurrentTemp: async () => latestReading },
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
});
