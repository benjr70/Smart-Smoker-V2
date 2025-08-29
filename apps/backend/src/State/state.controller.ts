import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { State } from './state.schema';
import { StateService } from './state.service';
import { StateDto } from './stateDto';

@ApiTags('State')
@Controller('api/state')
export class StateController {
  constructor(private readonly stateService: StateService) {}

  @Get()
  getState(): Promise<State> {
    return this.stateService.GetState();
  }

  @Put()
  updateState(@Body() dto: StateDto): Promise<State> {
    return this.stateService.update(dto);
  }

  @Post()
  CreateState(@Body() dto: StateDto): Promise<State> {
    return this.stateService.create(dto);
  }

  @Put('/toggleSmoking')
  toggleSmoking(): Promise<State> {
    return this.stateService.toggleSmoking();
  }

  @Put('/clearSmoke')
  clearSmoke(): Promise<State> {
    return this.stateService.clearSmoke();
  }
}
