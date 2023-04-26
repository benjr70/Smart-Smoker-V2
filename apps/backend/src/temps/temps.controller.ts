import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TempDto } from './tempDto';
import { Temp } from './temps.schema';
import { TempsService } from './temps.service';

@ApiTags('Temps')
@Controller('api/temps')
export class TempsController {
    constructor(private readonly tempsService: TempsService){
    }

    @Post()
    saveNewTemp(@Body() dto: TempDto) {
        return this.tempsService.saveNewTemp(dto);
    }

    @Get()
    getAllTempsCurrent(): Promise<Temp[]>{
        return this.tempsService.getAllTempsCurrent();
    }

    @Get('/:id')
    getAllTempsById(@Param('id') id: string): Promise<Temp[]>{
        return this.tempsService.getAllTempsById(id);
    }


    @Post('/batch')
    saveTempBatch(@Body() dto: TempDto[]){
        return this.tempsService.saveTempBatch(dto);
    }

    @Delete('/:id')
    DeleteById(@Param('id') id: string){
        return this.tempsService.delete(id);
    }

}
