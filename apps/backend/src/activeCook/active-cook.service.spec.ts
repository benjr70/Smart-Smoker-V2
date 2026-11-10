import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { SmokeStatus } from '../smoke/smoke.schema';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { ActiveCookService } from './active-cook.service';

describe('ActiveCookService', () => {
  let service: ActiveCookService;
  let states: FakeDoc[];
  let smokes: FakeDoc[];

  /** The module over whatever the two collections currently hold. */
  const build = async (): Promise<void> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveCookService,
        { provide: getModelToken('state'), useValue: fakeModel(states) },
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
      ],
    }).compile();
    service = module.get<ActiveCookService>(ActiveCookService);
  };

  beforeEach(() => {
    states = [];
    smokes = [];
  });

  describe('resolving the Active Cook', () => {
    it('answers with the cook the smoker is attached to and whether it is smoking', async () => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        preSmokeId: 'pre-1',
        tempsId: 'temps-1',
        restMinutes: 45,
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      await build();

      const cook = await service.resolve();

      expect(cook).toEqual({
        idle: false,
        smokeId: 'cook-1',
        smoking: true,
        smoke: expect.objectContaining({
          _id: 'cook-1',
          preSmokeId: 'pre-1',
          tempsId: 'temps-1',
          restMinutes: 45,
          status: SmokeStatus.InProgress,
        }),
      });
    });
  });

  describe('the "no Active Cook" rule', () => {
    it('is idle on a fresh install, where no state has been written yet', async () => {
      await build();

      expect(await service.resolve()).toEqual({ idle: true, smoking: false });
    });

    it('is idle when the state names no cook', async () => {
      states.push({ _id: 'state-1', smokeId: '', smoking: false });
      await build();

      expect(await service.resolve()).toEqual({ idle: true, smoking: false });
    });

    it('is idle when the cook the state names no longer exists', async () => {
      states.push({ _id: 'state-1', smokeId: 'deleted-cook', smoking: true });
      await build();

      expect(await service.resolve()).toEqual({ idle: true, smoking: true });
    });

    it('logs the cook that no longer exists, since nothing else notices', async () => {
      const logged = jest.spyOn(Logger, 'warn').mockImplementation();
      states.push({ _id: 'state-1', smokeId: 'deleted-cook', smoking: true });
      await build();

      await service.resolve();

      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('deleted-cook'),
        'ActiveCook',
      );
    });
  });

  describe('reads never write', () => {
    it('leaves an empty store empty, rather than seeding a state document', async () => {
      await build();

      await service.resolve();

      expect(states).toEqual([]);
      expect(smokes).toEqual([]);
    });

    it('leaves a state naming a cook that no longer exists exactly as it was', async () => {
      jest.spyOn(Logger, 'warn').mockImplementation();
      states.push({ _id: 'state-1', smokeId: 'deleted-cook', smoking: true });
      await build();

      await service.resolve();

      expect(states).toEqual([
        { _id: 'state-1', smokeId: 'deleted-cook', smoking: true },
      ]);
    });
  });
});
