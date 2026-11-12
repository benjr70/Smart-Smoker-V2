import { Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WithDocumentId } from '../common/document-id';
import { ActiveCookService } from './active-cook.service';
import { State } from './state.schema';

/**
 * What the apps ask about the cook in progress over HTTP.
 *
 * On the path the routes have always had, so neither app needs a release for
 * this: the three that survive — read the state, switch smoking, put the cook
 * away — are all about the one cook the smoker is attached to, and so belong to
 * the module that owns it.
 *
 * The two raw write routes that used to sit here are gone. `PUT`ting and
 * `POST`ing a whole state document let a client name any cook it liked and set
 * the smoking flag with no stamp, no announcement and no conditional write —
 * every rule the transitions hold, bypassed. Nothing called them (the audit is
 * in the pull request that removed them), and the named transitions are what a
 * caller has instead.
 */
@ApiTags('State')
@Controller('api/state')
export class ActiveCookController {
  constructor(private readonly activeCook: ActiveCookService) {}

  /**
   * The stored state: which cook the smoker is attached to, and whether it is
   * running.
   *
   * The document rather than the snapshot, because this is what both apps read
   * the smoking flag from on load and they have always read it in this shape.
   * Empty on a box whose state was never written — reading the Active Cook does
   * not write one into being.
   */
  @Get()
  getState(): Promise<(State & WithDocumentId) | null> {
    return this.activeCook.state();
  }

  /**
   * Switch smoking on or off for the Active Cook.
   *
   * No body, and still none: the flip is computed from what is stored, so two
   * real presses are one on and one off however they overlap. Answered with the
   * state as the flip left it, which is what the apps read the flag from —
   * `null` where there was no cook to toggle.
   */
  @Put('/toggleSmoking')
  async toggleSmoking(): Promise<(State & WithDocumentId) | null> {
    return (await this.activeCook.toggle()).state;
  }

  /**
   * Put the Active Cook away: the cook log of a cook never finished goes,
   * the cook is detached, and every open screen is told the cook log is empty.
   *
   * Answered with the state as the clear left it, which is what this route has
   * always answered — `null` on a smoker whose state document was never
   * written.
   */
  @Put('/clearSmoke')
  async clearSmoke(): Promise<(State & WithDocumentId) | null> {
    return (await this.activeCook.clear()).state;
  }
}
