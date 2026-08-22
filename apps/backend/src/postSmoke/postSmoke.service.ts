import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';
import { PostSmoke, PostSmokeDocument } from './postSmoke.schema';
import { PostSmokeDto } from './postSmokeDto';

@Injectable()
export class PostSmokeService extends BaseService<PostSmokeDocument> {
  constructor(
    @InjectModel('PostSmoke') model: Model<PostSmokeDocument>,
    private readonly currentSmoke: CurrentSmokeService,
    private readonly stats: StatsService,
  ) {
    super(model, 'PostSmoke');
  }

  /**
   * How long a cook rested is one of the numbers the Stats screen averages, so
   * every write here leaves the stored statistics out of date — and none of
   * these writes changes how many completed cooks the archive holds, which is
   * the only change the stats read can notice by itself.
   */
  protected async afterWrite(): Promise<void> {
    await markStatsStale(this.stats, 'post-smoke');
  }

  getCurrentPostSmoke(): Promise<PostSmoke> {
    const fallback = { notes: '', restTime: '', steps: [''] } as PostSmoke;
    return this.currentSmoke.readCurrent<PostSmoke>(
      'postSmokeId',
      (id) => this.getById(id),
      fallback,
    );
  }

  saveCurrentPostSmoke(dto: PostSmokeDto): Promise<PostSmoke> {
    return this.currentSmoke.upsertCurrent<PostSmoke>('postSmokeId', {
      update: (id) => this.update(id, dto),
      create: async () => {
        const created = await this.create(dto);
        return { result: created, childId: created['_id'].toString() };
      },
    });
  }
}
