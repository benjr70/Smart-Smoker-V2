import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { State } from "./state.schema";
import { StateService } from "./state.service";
import { StateDto } from "./stateDto";


@ApiTags('State')
@Controller('api/state')
export class StateController {
    constructor(private readonly stateService: StateService){}

    @Get('/:id')
    getState(@Param('id') id: string): Promise<State> {
        return this.stateService.GetState(id)
    } 

    @Put('/:id')
    updateState(@Param('id') id: string, @Body() dto: StateDto): Promise<State> {
        return this.stateService.update(id, dto);
    }
    
    @Post()
    CreateState(@Body() dto: StateDto): Promise<State> {
        return this.stateService.create(dto);
    }
}