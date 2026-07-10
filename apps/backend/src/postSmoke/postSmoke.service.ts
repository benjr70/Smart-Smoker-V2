import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { PostSmoke, PostSmokeDocument } from './postSmoke.schema';
import { PostSmokeDto } from './postSmokeDto';

@Injectable()
export class PostSmokeService extends BaseService<PostSmokeDocument> {
  constructor(
    @InjectModel('PostSmoke') model: Model<PostSmokeDocument>,
    private readonly currentSmoke: CurrentSmokeService,
  ) {
    super(model, 'PostSmoke');
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
