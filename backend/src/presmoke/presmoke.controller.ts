import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PreSmoke } from './presmoke.schema';
import { PreSmokeService } from './presmoke.service';
import { PreSmokeDto } from './presmokeDto';

@ApiTags('PreSmoke')
@Controller('api/presmoke')
export class PreSmokeController {
    constructor(private readonly preSmokeService: PreSmokeService){}
    
    @Get()
    getPreSmoke(): Promise<PreSmoke[]> {
        return this.preSmokeService.findAll()
    }

    @Post()
    CreatNewPreSmoke(@Body() dto: PreSmokeDto): Promise<PreSmoke> {
        return this.preSmokeService.create(dto);
    }

    @Put('/update/:id')
    updatePreSmoke(@Param('id') id: string,@Body() dto: PreSmokeDto): Promise<PreSmoke> {
        return this.preSmokeService.Update(id, dto);
    }

    @Get("/:id")
    getById(@Param('id') id: string): Promise<PreSmoke>{
        return this.preSmokeService.GetByID(id);
    }

    @Delete('/:id')
    DeleteById(@Param('id') id: string){
        return this.preSmokeService.Delete(id);
    }
}
