import { Module, forwardRef } from '@nestjs/common';
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
  // `StateModule` is forward-referenced: it reaches back here through the
  // gateway (session → gateway → temps → here), so the two files are in a
  // require loop and the eager reference resolves as `undefined`. See
  // `TempModule` for the whole loop.
  imports: [forwardRef(() => StateModule), SmokeModule],
  providers: [CurrentSmokeService],
  exports: [CurrentSmokeService],
})
export class CommonModule {}
