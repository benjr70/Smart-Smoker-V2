import { Module } from '@nestjs/common';
import { ActiveCookModule } from '../activeCook/active-cook.module';
import { SmokeModule } from '../smoke/smoke.module';
import { CurrentSmokeService } from './current-smoke.service';

/**
 * Shared data-integrity infrastructure.
 *
 * Imports `ActiveCookModule` + `SmokeModule` and provides
 * `CurrentSmokeService`. Feature modules import `CommonModule` to reach the
 * walk from the Active Cook to one of its child records.
 *
 * DI rule: `SmokeModule` must NOT import `CommonModule` — that keeps the graph
 * acyclic (`SmokeService.getCurrentSmoke` delegates to the Active Cook, which
 * imports nothing).
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
