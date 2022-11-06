import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateModule } from 'src/State/state.module';
import { SmokeModule } from 'src/smoke/smoke.module';
import { PostSmokeSchema } from './postSmoke.schema';
import { PostSmokeController } from './postSmoke.controller';
import { PostSmokeService } from './postSmoke.service';


@Module({
  imports: [MongooseModule.forFeature([{name: 'PostSmoke', schema: PostSmokeSchema}]), StateModule, SmokeModule],
  controllers: [PostSmokeController],
  providers: [PostSmokeService],
})
export class PostSmokeModule {}
