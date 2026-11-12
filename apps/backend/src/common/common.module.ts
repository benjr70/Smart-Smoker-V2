import { Module } from '@nestjs/common';
import { ActiveCookModule } from '../activeCook/active-cook.module';
import { SmokeModule } from '../smoke/smoke.module';
import { CurrentSmokeService } from './current-smoke.service';

/**
 * Shared data-integrity infrastructure.
 *
 * Nothing imports this any more. The walk from the Active Cook to one of its
 * child records — both the read and the attach — belongs to the Active Cook
 * itself, and every module that used to reach it through here depends on
 * `ActiveCookModule` instead. The module and the service it provides are
 * deleted with the rest of the leftovers (issue #754), together so that one
 * change removes the helper, its spec, the State module and the `forwardRef`s
 * that only existed for the cycles they closed.
 */
@Module({
  // Which cook the smoker is attached to. Was `StateModule`, forward-referenced
  // because the session reached back here through the gateway; the Active Cook
  // imports no feature module, so that loop is gone and so is the thunk.
  imports: [ActiveCookModule, SmokeModule],
  providers: [CurrentSmokeService],
  exports: [CurrentSmokeService],
})
export class CommonModule {}
