import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { State } from './state.schema';
import { StateService } from './state.service';
import { StateDto } from './stateDto';

@ApiTags('State')
@Controller('api/state')
export class StateController {
  constructor(
    private readonly stateService: StateService,
    /**
     * Lighting the smoker and putting it out is a transition of the cook, not a
     * write to this collection — so the route goes to the one module that owns
     * the cook's transitions, and the flag is flipped in a single conditional
     * write there. See {@link ActiveCookService.toggle}.
     */
    private readonly activeCook: ActiveCookService,
  ) {}

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
   * Switch smoking on or off for the cook in progress.
   *
   * No body, and still none: the flip is computed from what is stored, so two
   * real presses are one on and one off however they overlap. Answered with the
   * state as the flip left it, which is what the apps read the flag from —
   * `null` where there was no cook to toggle.
   */
  @Put('/toggleSmoking')
  async toggleSmoking(): Promise<State | null> {
    return (await this.activeCook.toggle()).state;
  }

  @Put('/clearSmoke')
  clearSmoke(): Promise<State> {
    return this.stateService.clearSmoke();
  }
}
