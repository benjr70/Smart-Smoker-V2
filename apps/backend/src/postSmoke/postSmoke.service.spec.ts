import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { PostSmokeService } from './postSmoke.service';
import { PostSmoke } from './postSmoke.schema';
import { PostSmokeDto } from './postSmokeDto';
import { CurrentSmokeService } from '../common/current-smoke.service';

const query = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('PostSmokeService', () => {
  let service: PostSmokeService;
  let model: any;
  let currentSmoke: {
    readCurrent: jest.Mock;
    upsertCurrent: jest.Mock;
  };

  const existing: PostSmoke = {
    restTime: '30 minutes',
    steps: ['Wrap in foil'],
    notes: 'notes',
  };

  const dto: PostSmokeDto = {
    restTime: '45 minutes',
    steps: ['Cool', 'Slice'],
    notes: 'Perfect results',
  };

  beforeEach(async () => {
    model = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({ ...doc, _id: 'new-postsmoke-id' }),
    }));
    model.findById = jest.fn().mockReturnValue(query(existing));
    model.findByIdAndUpdate = jest
      .fn()
      .mockReturnValue(query({ ...existing, ...dto, _id: 'post-1' }));
    model.deleteOne = jest.fn().mockReturnValue(query({ deletedCount: 1 }));

    currentSmoke = {
      readCurrent: jest.fn(),
      upsertCurrent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostSmokeService,
        { provide: getModelToken('PostSmoke'), useValue: model },
        { provide: CurrentSmokeService, useValue: currentSmoke },
      ],
    }).compile();

    service = module.get<PostSmokeService>(PostSmokeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentPostSmoke', () => {
    it('loads the linked post-smoke via the current-smoke walk', async () => {
      currentSmoke.readCurrent.mockImplementation((key, load) =>
        load('post-1'),
      );

      const result = await service.getCurrentPostSmoke();

      expect(currentSmoke.readCurrent).toHaveBeenCalledWith(
        'postSmokeId',
        expect.any(Function),
        expect.objectContaining({ notes: '', restTime: '', steps: [''] }),
      );
      expect(model.findById).toHaveBeenCalledWith('post-1');
      expect(result).toEqual(existing);
    });

    it('returns the default object when nothing is active (fallback)', async () => {
      currentSmoke.readCurrent.mockImplementation(
        (key, load, fallback) => fallback,
      );

      const result = await service.getCurrentPostSmoke();

      expect(result).toEqual({ notes: '', restTime: '', steps: [''] });
      expect(model.findById).not.toHaveBeenCalled();
    });
  });

  describe('saveCurrentPostSmoke', () => {
    it('updates the linked post-smoke when one already exists', async () => {
      currentSmoke.upsertCurrent.mockImplementation((key, handlers) =>
        handlers.update('post-1'),
      );

      const result = await service.saveCurrentPostSmoke(dto);

      expect(currentSmoke.upsertCurrent).toHaveBeenCalledWith(
        'postSmokeId',
        expect.any(Object),
      );
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'post-1',
        { $set: dto },
        { new: true },
      );
      expect(result).toMatchObject({ _id: 'post-1' });
    });

    it('creates a post-smoke and reports its new child id when none exists', async () => {
      let linkedChildId: string | undefined;
      currentSmoke.upsertCurrent.mockImplementation(async (key, handlers) => {
        const created = await handlers.create();
        linkedChildId = created.childId;
        return created.result;
      });

      const result = await service.saveCurrentPostSmoke(dto);

      expect(model).toHaveBeenCalledWith(dto);
      expect(linkedChildId).toBe('new-postsmoke-id');
      expect(result).toMatchObject({ _id: 'new-postsmoke-id' });
    });

    it('propagates the 404 when there is no active smoke', async () => {
      currentSmoke.upsertCurrent.mockRejectedValue(new NotFoundException());

      await expect(service.saveCurrentPostSmoke(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getByIdOrThrow (inherited)', () => {
    it('throws NotFoundException for a missing id', async () => {
      model.findById.mockReturnValue(query(null));

      await expect(service.getByIdOrThrow('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
