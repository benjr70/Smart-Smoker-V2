import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { childIdOf } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';
import { PostSmoke, PostSmokeDocument } from './postSmoke.schema';
import { PostSmokeDto } from './postSmokeDto';

@Injectable()
export class PostSmokeService extends BaseService<PostSmokeDocument> {
  constructor(
    @InjectModel('PostSmoke') model: Model<PostSmokeDocument>,
    private readonly activeCook: ActiveCookService,
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

  /**
   * The post-smoke of the cook in progress, or the blank defaults where there
   * is none — a session that has not reached the step yet, and an idle smoker,
   * both render the empty form rather than an error.
   */
  async getCurrentPostSmoke(): Promise<PostSmoke> {
    const postSmokeId = childIdOf(
      await this.activeCook.resolve(),
      'postSmokeId',
    );
    return postSmokeId
      ? this.getById(postSmokeId)
      : ({ notes: '', restTime: '', steps: [''] } as PostSmoke);
  }

  saveCurrentPostSmoke(dto: PostSmokeDto): Promise<PostSmoke> {
    return this.activeCook.attach<PostSmoke>('postSmokeId', {
      update: (id) => this.update(id, dto),
      create: async () => {
        const created = await this.create(dto);
        return { result: created, childId: created['_id'].toString() };
      },
    });
  }
}
