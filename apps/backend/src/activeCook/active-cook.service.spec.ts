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
});
