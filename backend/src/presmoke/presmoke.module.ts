import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PreSmoke, PreSmokeSchema } from './presmoke.schema';
import { PreSmokeController } from './presmoke.controller';
import { PreSmokeService } from './presmoke.service';


@Module({
  imports: [MongooseModule.forFeature([{name: PreSmoke.name, schema: PreSmokeSchema}])],
  controllers: [PreSmokeController],
  providers: [PreSmokeService],
})
export class PreSmokeModule {}
