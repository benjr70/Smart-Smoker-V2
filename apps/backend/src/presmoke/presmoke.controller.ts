import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PreSmoke } from './presmoke.schema';
import { PreSmokeService } from './presmoke.service';
import { PreSmokeDto } from './presmokeDto';

@ApiTags('PreSmoke')
@Controller('api/presmoke')
export class PreSmokeController {
  constructor(private readonly preSmokeService: PreSmokeService) {}

  @Get('/all')
  getPreSmoke(): Promise<PreSmoke[]> {
    return this.preSmokeService.getAll();
  }

  @Get('/:id')
  getPreSmokeById(@Param('id') id: string): Promise<PreSmoke> {
    return this.preSmokeService.getById(id);
  }

  @Post('')
  SavePreSmoke(@Body() dto: PreSmokeDto): Promise<PreSmoke> {
    return this.preSmokeService.save(dto);
  }

  @Put('/update/:id')
  updatePreSmoke(
    @Param('id') id: string,
    @Body() dto: PreSmokeDto,
  ): Promise<PreSmoke> {
    return this.preSmokeService.update(id, dto);
  }

  @Get('')
  getById(): Promise<PreSmoke> {
    return this.preSmokeService.GetByCurrent();
  }

  @Delete('/:id')
  DeleteById(@Param('id') id: string) {
    return this.preSmokeService.delete(id);
  }
}
