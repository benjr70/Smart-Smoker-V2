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
  getState(): Promise<State | undefined> {
    return this.stateService.GetState();
  }

  @Put()
  updateState(@Body() dto: StateDto): Promise<State> {
    return this.stateService.updateCurrent(dto);
  }

  @Post()
  CreateState(@Body() dto: StateDto): Promise<State> {
    return this.stateService.create(dto);
  }

  /**
   * Empty body when there is no smoke to toggle. Clients already treat that as
   * "nothing changed" — the previous `Promise<State>` simply hid it.
   */
  @Put('/toggleSmoking')
  toggleSmoking(): Promise<State | null> {
    return this.stateService.toggleSmoking();
  }

  @Put('/clearSmoke')
  clearSmoke(): Promise<State> {
    return this.stateService.clearSmoke();
  }
}
