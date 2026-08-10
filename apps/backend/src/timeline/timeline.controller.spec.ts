import { Test, TestingModule } from '@nestjs/testing';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';
import { SmokeTimeline } from './timeline.dto';

describe('TimelineController', () => {
  let controller: TimelineController;
  let mockTimelineService: { getTimeline: jest.Mock };

  const timeline: SmokeTimeline = {
    startedAt: new Date('2026-08-01T10:00:00.000Z'),
    finishedAt: new Date('2026-08-01T16:00:00.000Z'),
    durationMs: 6 * 60 * 60 * 1000,
    peakChamber: 268,
    peakMeat: 203,
    targetTemp: 203,
  };

  beforeEach(async () => {
    mockTimelineService = {
      getTimeline: jest.fn().mockResolvedValue(timeline),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimelineController],
      providers: [{ provide: TimelineService, useValue: mockTimelineService }],
    }).compile();

    controller = module.get<TimelineController>(TimelineController);
  });

  it("serves a stored cook's timeline by id", async () => {
    expect(await controller.getTimeline('507f1f77bcf86cd799439011')).toEqual(
      timeline,
    );
    expect(mockTimelineService.getTimeline).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
    );
  });
});
