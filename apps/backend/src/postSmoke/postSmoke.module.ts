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
})
export class PostSmokeModule {}
