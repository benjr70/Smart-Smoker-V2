import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SmokeService } from './smoke.service';
import { Smoke, SmokeDocument, SmokeStatus } from './smoke.schema';
import { SmokeDto } from './smokeDto';
import { idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { StatsService } from '../stats/stats.service';
import { createMockModel } from '../common/testing/create-mock-model';
import { Types } from 'mongoose';
import { tempSeriesFilter } from '../temps/temp-series.filter';

describe('SmokeService', () => {
  let service: SmokeService;
  let mockSmokeModel: any;
  let activeCook: FakeActiveCook;
  let mockStatsService: { recalculate: jest.Mock };
  let mockPreSmokeModel: any;
  let mockSmokeProfileModel: any;
  let mockTempModel: any;
  let mockPostSmokeModel: any;
  let mockRatingsModel: any;
  let mockCookEventModel: any;
  // Every delete the deep delete issues, in the order it issued them, so the
  // "children before parent" ordering can be asserted as a fact rather than
  // inferred from five independent mocks.
  let deleteLog: string[];

  const mockSmoke: Smoke = {
    preSmokeId: 'pre-smoke-id',
    tempsId: 'temps-id',
    postSmokeId: 'post-smoke-id',
    smokeProfileId: 'profile-id',
    ratingId: 'rating-id',
    date: new Date('2023-01-01'),
    status: SmokeStatus.InProgress,
  };

  const mockSmokeDocument = {
    _id: 'test-smoke-id',
    ...mockSmoke,
    save: jest.fn().mockResolvedValue(mockSmoke),
  };

  beforeEach(async () => {
    // Create a mock constructor function that returns an object with save method
    mockSmokeModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-id' }),
    }));

    // Add static methods to the mock constructor
    mockSmokeModel.find = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([mockSmokeDocument]),
    });
    mockSmokeModel.findById = jest.fn().mockResolvedValue(mockSmokeDocument);
    mockSmokeModel.findOneAndUpdate = jest
      .fn()
      .mockResolvedValue(mockSmokeDocument);
    deleteLog = [];
    mockSmokeModel.deleteOne = jest.fn().mockImplementation((filter) => ({
      exec: jest.fn().mockImplementation(async () => {
        deleteLog.push(`smoke:${filter._id}`);
        return { deletedCount: 1 };
      }),
    }));

    // A child collection whose removals announce themselves into the shared
    // log, so the order the cascade ran in survives the call.
    const childModel = (label: string) =>
      createMockModel({
        deleteOne: jest.fn().mockImplementation((filter: any) => ({
          exec: jest.fn().mockImplementation(async () => {
            deleteLog.push(`${label}:${filter._id}`);
            return { deletedCount: 1 };
          }),
        })),
        deleteMany: jest.fn().mockImplementation((filter: any) => ({
          exec: jest.fn().mockImplementation(async () => {
            deleteLog.push(`${label}:${JSON.stringify(filter)}`);
            return { deletedCount: 3 };
          }),
        })),
      });

    mockPreSmokeModel = childModel('preSmoke');
    mockSmokeProfileModel = childModel('smokeProfile');
    mockTempModel = childModel('temp');
    mockPostSmokeModel = childModel('postSmoke');
    mockRatingsModel = childModel('ratings');
    mockCookEventModel = childModel('cookEvents');

    activeCook = fakeActiveCook(attachedCook(mockSmokeDocument, true));

    // The statistics recompute announces itself into the same log as the
    // deletes, so "after everything was removed" is a fact the test can read
    // rather than an ordering it has to assume.
    mockStatsService = {
      recalculate: jest.fn().mockImplementation(async () => {
        deleteLog.push('stats:recalculate');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmokeService,
        {
          provide: getModelToken('Smoke'),
          useValue: mockSmokeModel,
        },
        {
          provide: ActiveCookService,
          useValue: activeCook,
        },
        {
          provide: StatsService,
          useValue: mockStatsService,
        },
        { provide: getModelToken('PreSmoke'), useValue: mockPreSmokeModel },
        {
          provide: getModelToken('SmokeProfile'),
          useValue: mockSmokeProfileModel,
        },
        { provide: getModelToken('Temp'), useValue: mockTempModel },
        { provide: getModelToken('PostSmoke'), useValue: mockPostSmokeModel },
        { provide: getModelToken('Ratings'), useValue: mockRatingsModel },
        { provide: getModelToken('CookEvent'), useValue: mockCookEventModel },
      ],
    }).compile();

    service = module.get<SmokeService>(SmokeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new smoke and set date', async () => {
      const smokeDto: SmokeDto = {
        preSmokeId: 'new-pre-smoke-id',
        status: SmokeStatus.InProgress,
      };

      // Mock Date to have consistent testing
      const mockDate = new Date('2023-01-01');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await service.create(smokeDto);

      expect(smokeDto.date).toEqual(mockDate);
      expect(mockSmokeModel).toHaveBeenCalledWith(smokeDto);
      expect(result).toBeDefined();

      // Restore Date
      jest.restoreAllMocks();
    });
  });

  describe('getCurrentSmoke', () => {
    it('answers with the Active Cook, asked of the module that owns it', async () => {
      const result = await service.getCurrentSmoke();

      expect(activeCook.resolve).toHaveBeenCalled();
      expect(result).toEqual(mockSmokeDocument);
    });

    /**
     * Idle is idle however it came about — no state written, no cook named, or
     * a cook that has since been deleted. The rule is the Active Cook's; this
     * only has to answer the same `null` the route has always answered.
     */
    it('answers nothing for an idle smoker', async () => {
      activeCook.pointAt(idleCook());

      expect(await service.getCurrentSmoke()).toBeNull();
    });

    it('does not read the cook archive a second time to answer', async () => {
      jest.spyOn(service, 'getById');

      await service.getCurrentSmoke();

      expect(service.getById).not.toHaveBeenCalled();
    });
  });

  /**
   * Finishing is the Active Cook's transition — the stamp, the completion and
   * the one recount of the archive all live there, which is where their tests
   * live too. What this route still owns is the payload: the cook as the finish
   * left it, or nothing at all.
   */
  describe('FinishSmoke', () => {
    it('finishes through the Active Cook and answers with the cook', async () => {
      const result = await service.FinishSmoke();

      expect(activeCook.finish).toHaveBeenCalledWith();
      expect(result).toEqual(
        expect.objectContaining({
          _id: 'test-smoke-id',
          status: SmokeStatus.Complete,
        }),
      );
    });

    it('answers with nothing when there is no cook to finish', async () => {
      activeCook.pointAt(idleCook());

      expect(await service.FinishSmoke()).toBeNull();
    });

    /** A finish that lost is not an error: the cook comes back as it stands. */
    it('answers with the cook when this caller did not finish it', async () => {
      await service.FinishSmoke();

      const again = await service.FinishSmoke();

      expect(again).toEqual(
        expect.objectContaining({ status: SmokeStatus.Complete }),
      );
    });
  });

  describe('deleteDeep', () => {
    /**
     * Deleting the cook the smoker is attached to used to leave the session
     * pointing at a smoke that no longer existed, which reads as idle
     * everywhere and is how a smoker gets stuck. The session is put away first
     * — by the module that owns that transition, not by a write from here — so
     * the app comes back idle and every open screen is told.
     */
    it('clears the session first when the cook being deleted is the Active Cook', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);
      activeCook.clear.mockImplementation(async () => {
        deleteLog.push('activeCook:clear');
        return { won: true, cook: idleCook(), state: null };
      });

      await service.deleteDeep('test-smoke-id');

      expect(activeCook.clear).toHaveBeenCalledTimes(1);
      expect(deleteLog[0]).toBe('activeCook:clear');
    });

    it('leaves the Active Cook alone when another stored cook is deleted', async () => {
      jest.spyOn(service, 'getById').mockResolvedValue({
        ...mockSmokeDocument,
        _id: 'older-smoke-id',
      } as unknown as SmokeDocument);

      await service.deleteDeep('older-smoke-id');

      expect(activeCook.clear).not.toHaveBeenCalled();
      expect(activeCook.cook()).toEqual(
        expect.objectContaining({ idle: false, smokeId: 'test-smoke-id' }),
      );
    });

    it('clears nothing when the smoker is attached to no cook at all', async () => {
      activeCook.pointAt(idleCook());
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(activeCook.clear).not.toHaveBeenCalled();
      expect(mockSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'test-smoke-id',
      });
    });

    it('removes the parent smoke and all five of its children', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(mockPreSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'pre-smoke-id',
      });
      expect(mockSmokeProfileModel.deleteOne).toHaveBeenCalledWith({
        _id: 'profile-id',
      });
      expect(mockPostSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'post-smoke-id',
      });
      expect(mockRatingsModel.deleteOne).toHaveBeenCalledWith({
        _id: 'rating-id',
      });
      expect(mockSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'test-smoke-id',
      });
    });

    /**
     * The cook log is part of the cook. A delete that left it behind would
     * leave events pointing at a smoke that no longer exists — invisible, and
     * counted by anything that ever aggregates them.
     */
    it('removes the cook log with everything else the cook recorded', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(mockCookEventModel.deleteMany).toHaveBeenCalledWith({
        smokeId: 'test-smoke-id',
      });
      // Before the smoke itself, like every other child: a failure part-way
      // leaves a cook that still points at what survived.
      expect(
        deleteLog.indexOf('cookEvents:{"smokeId":"test-smoke-id"}'),
      ).toBeLessThan(deleteLog.indexOf('smoke:test-smoke-id'));
    });

    it('recomputes the statistics once nothing of the cook is left', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      // Last of all: statistics recomputed while the smoke was still there
      // would count the cook that was just deleted.
      expect(deleteLog[deleteLog.length - 1]).toBe('stats:recalculate');
    });

    it('reports the delete as done when the statistics cannot be recomputed', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);
      mockStatsService.recalculate.mockRejectedValue(new Error('mongo hiccup'));

      // Nothing of the cook is left by now, so a retry of this request would
      // only 404. The count guard rebuilds the statistics on the next read.
      await expect(service.deleteDeep('test-smoke-id')).resolves.toEqual({
        deletedCount: 1,
      });
    });

    it('deletes every child before the parent, so a failure is retryable', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      const deletes = deleteLog.filter((entry) => !entry.startsWith('stats:'));

      expect(deletes).toHaveLength(7);
      expect(deletes[deletes.length - 1]).toBe('smoke:test-smoke-id');
      expect(deletes.slice(0, 6).sort()).toEqual(
        [
          'preSmoke:pre-smoke-id',
          'smokeProfile:profile-id',
          'temp:{"tempsId":"temps-id"}',
          'postSmoke:post-smoke-id',
          'ratings:rating-id',
          'cookEvents:{"smokeId":"test-smoke-id"}',
        ].sort(),
      );
    });

    it('removes the temperature series by its shared id, not a single reading', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(mockTempModel.deleteMany).toHaveBeenCalledWith(
        tempSeriesFilter('temps-id'),
      );
      expect(mockTempModel.deleteOne).not.toHaveBeenCalled();
    });

    /**
     * The reading the series is named after carries no `tempsId` of its own, so
     * a cascade that matched the id alone would leave one orphan per cook.
     */
    it('removes the first reading of the series along with the rest', async () => {
      const seriesId = new Types.ObjectId().toString();
      jest.spyOn(service, 'getById').mockResolvedValue({
        ...mockSmokeDocument,
        tempsId: seriesId,
      } as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(mockTempModel.deleteMany).toHaveBeenCalledWith({
        $or: [{ tempsId: seriesId }, { _id: seriesId }],
      });
    });

    it('deletes what a legacy smoke does have when child ids are missing', async () => {
      jest.spyOn(service, 'getById').mockResolvedValue({
        _id: 'legacy-smoke-id',
        preSmokeId: 'pre-smoke-id',
        tempsId: '',
        status: SmokeStatus.Complete,
      } as unknown as SmokeDocument);

      await expect(
        service.deleteDeep('legacy-smoke-id'),
      ).resolves.toBeDefined();

      expect(mockPreSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'pre-smoke-id',
      });
      expect(mockTempModel.deleteMany).not.toHaveBeenCalled();
      expect(mockSmokeProfileModel.deleteOne).not.toHaveBeenCalled();
      expect(mockPostSmokeModel.deleteOne).not.toHaveBeenCalled();
      expect(mockRatingsModel.deleteOne).not.toHaveBeenCalled();
      expect(mockSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'legacy-smoke-id',
      });
    });

    it('deletes nothing at all when the smoke itself is gone', async () => {
      jest.spyOn(service, 'getById').mockResolvedValue(null);

      await expect(service.deleteDeep('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(deleteLog).toEqual([]);
    });
  });

  /**
   * The plan the cook is run backwards from lives on the cook itself, so a
   * reload and a second device read back what was set — written through the
   * update path every other field of a cook is written through.
   */
  describe('the serve plan', () => {
    /** A store the update writes into and the read reads back out of. */
    let stored: Record<string, unknown>;

    beforeEach(() => {
      stored = { _id: 'test-smoke-id', ...mockSmoke };
      mockSmokeModel.findByIdAndUpdate = jest
        .fn()
        .mockImplementation((_id: string, update: { $set: object }) => {
          Object.assign(stored, update.$set);
          return { exec: jest.fn().mockResolvedValue(stored) };
        });
      mockSmokeModel.findById = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(stored) });
    });

    it('stores a serve time and a rest, and reads them back', async () => {
      const serveAt = new Date('2026-08-30T18:00:00.000Z');
      const smokeDto: SmokeDto = {
        preSmokeId: 'pre-smoke-id',
        status: SmokeStatus.InProgress,
        serveAt,
        restMinutes: 45,
      };

      const updated = await service.update('test-smoke-id', smokeDto);

      expect(updated.serveAt).toEqual(serveAt);
      expect(updated.restMinutes).toBe(45);
      const read = await service.getById('test-smoke-id');
      expect(read?.serveAt).toEqual(serveAt);
      expect(read?.restMinutes).toBe(45);
    });

    it('leaves a plan alone when something else about the cook is written', async () => {
      await service.update('test-smoke-id', {
        preSmokeId: 'pre-smoke-id',
        status: SmokeStatus.InProgress,
        serveAt: new Date('2026-08-30T18:00:00.000Z'),
        restMinutes: 45,
      } as SmokeDto);

      await service.update('test-smoke-id', {
        preSmokeId: 'pre-smoke-id',
        status: SmokeStatus.Complete,
      } as SmokeDto);

      const read = await service.getById('test-smoke-id');
      expect(read?.restMinutes).toBe(45);
    });

    /**
     * How a client writes one: against the cook in progress, without having to
     * know its id or to send back the five links between it and its children.
     */
    describe('written against the cook in progress', () => {
      it('writes the plan onto the cook that is running', async () => {
        const serveAt = new Date('2026-08-30T18:00:00.000Z');

        const updated = await service.updateServePlan({
          serveAt,
          restMinutes: 45,
        });

        expect(updated?.serveAt).toEqual(serveAt);
        expect(updated?.restMinutes).toBe(45);
      });

      it('leaves the half of the plan it was not given alone', async () => {
        await service.updateServePlan({
          serveAt: new Date('2026-08-30T18:00:00.000Z'),
          restMinutes: 45,
        });

        // Dinner moves; the rest the meat needs has not changed.
        const updated = await service.updateServePlan({
          serveAt: new Date('2026-08-30T19:00:00.000Z'),
        });

        expect(updated?.serveAt).toEqual(new Date('2026-08-30T19:00:00.000Z'));
        expect(updated?.restMinutes).toBe(45);
      });

      /**
       * The pitmaster abandons the plan mid-cook. Sending `null` is how they
       * say so — distinct from omitting the field, which leaves the stored
       * value alone — and the timeline stops answering a plan for the cook.
       */
      it('clears a plan sent as nothing', async () => {
        await service.updateServePlan({
          serveAt: new Date('2026-08-30T18:00:00.000Z'),
          restMinutes: 45,
        });

        const updated = await service.updateServePlan({ serveAt: null });

        expect(updated?.serveAt).toBeNull();
        expect(updated?.restMinutes).toBe(45);
      });

      it('has nothing to write when no cook is in progress', async () => {
        activeCook.pointAt(idleCook());

        expect(await service.updateServePlan({ restMinutes: 45 })).toBeNull();
        expect(mockSmokeModel.findByIdAndUpdate).not.toHaveBeenCalled();
      });
    });

    /**
     * The pull is what the rest is measured from, and it is stamped by the
     * step advance that takes the cook to Post-Smoke — against the cook in
     * progress, like the plan. That it is stamped no more than once is the
     * Active Cook's rule and is held there
     * ({@link ActiveCookService.pull}); what this route owes is the forward
     * and the cook it answers with.
     */
    describe('the pull stamp', () => {
      it('pulls through the Active Cook and answers the cook it stamped', async () => {
        const pulled = await service.stampPull();

        expect(activeCook.pull).toHaveBeenCalledWith();
        expect(pulled?.pullAt).toBeInstanceOf(Date);
      });

      it('has nothing to stamp when no cook is in progress', async () => {
        activeCook.pointAt(idleCook());

        expect(await service.stampPull()).toBeNull();
      });
    });
  });
});
