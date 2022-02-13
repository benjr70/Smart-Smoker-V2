import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PreSmoke } from './presmoke.schema';
import { PreSmokeService } from './presmoke.service';
import { PreSmokeDto } from './presmokeDto';

@ApiTags('PreSmoke')
@Controller('api/presmoke')
export class PreSmokeController {
    constructor(private readonly preSmokeService: PreSmokeService){}
    
    @Get()
    getPresmoke(): Promise<PreSmoke[]> {
        return this.preSmokeService.findAll();
    }

    @Post()
    SetPreSmoke(@Body() dto: PreSmokeDto): Promise<PreSmoke> {
        return this.preSmokeService.create(dto);
    }
}
