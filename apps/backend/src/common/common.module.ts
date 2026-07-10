import { Module } from '@nestjs/common';
import { StateModule } from '../State/state.module';
import { SmokeModule } from '../smoke/smoke.module';
import { CurrentSmokeService } from './current-smoke.service';

/**
 * Shared data-integrity infrastructure.
 *
 * Imports `StateModule` + `SmokeModule` and provides `CurrentSmokeService`.
 * Feature modules import `CommonModule` (instead of Smoke/State directly) to
 * reach the current-smoke walk.
 *
 * DI rule: `SmokeModule` must NOT import `CommonModule` — that keeps the graph
 * acyclic (`SmokeService.getCurrentSmoke` stays its own degenerate walk).
 */
@Module({
  imports: [StateModule, SmokeModule],
  providers: [CurrentSmokeService],
  exports: [CurrentSmokeService],
})
export class CommonModule {}
