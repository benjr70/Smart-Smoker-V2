import { Test, TestingModule } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { StatsDto } from './stats.dto';
import { StatsService } from './stats.service';

const EMPTY: StatsDto = {
  totalSessions: 0,
  totalCookMs: null,
  totalPounds: null,
  approximateServings: null,
  averageRating: null,
  averageCookMs: null,
  totalRestMs: null,
  woodTypeCount: 0,
  meatTypeCount: 0,
  records: {
    highestRated: null,
    longestCook: null,
    heaviestCut: null,
    hottestChamber: null,
  },
  byMeat: [],
  byWood: [],
  categoryAverages: {
    smokeFlavor: null,
    seasoning: null,
    tenderness: null,
    overallTaste: null,
  },
};

describe('StatsController', () => {
  it('serves the archive statistics', async () => {
    const stats: StatsDto = { ...EMPTY, totalSessions: 4, totalPounds: 41.5 };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        { provide: StatsService, useValue: { getStats: async () => stats } },
      ],
    }).compile();

    const controller = module.get<StatsController>(StatsController);

    await expect(controller.getStats()).resolves.toEqual(stats);
  });
});
