import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { PostSmokeSchema } from './postSmoke.schema';
import { PostSmokeController } from './postSmoke.controller';
import { PostSmokeService } from './postSmoke.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'PostSmoke', schema: PostSmokeSchema }]),
    CommonModule,
  ],
  controllers: [PostSmokeController],
  providers: [PostSmokeService],
  // Exported for the history list, which reads a finished cook's post-smoke
  // notes so they can be searched alongside the rest of what was written.
  exports: [PostSmokeService],
})
export class PostSmokeModule {}
