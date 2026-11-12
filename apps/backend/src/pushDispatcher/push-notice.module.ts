import { Global, Module } from '@nestjs/common';
import { PUSH_NOTICE } from './push-notice';
import { PushDispatcherModule } from './push-dispatcher.module';
import { PushDispatcherService } from './push-dispatcher.service';

/**
 * Where the push port is bound, globally.
 *
 * Global rather than imported by its consumer, for the same reason
 * `StatsRecomputeModule` is: the Active Cook, which everything depends on,
 * imports no feature module of its own. The dispatcher is the real
 * implementation unchanged — the port's one method is the one it already has —
 * so this is an alias rather than an adapter.
 */
@Global()
@Module({
  imports: [PushDispatcherModule],
  providers: [
    {
      provide: PUSH_NOTICE,
      useExisting: PushDispatcherService,
    },
  ],
  exports: [PUSH_NOTICE],
})
export class PushNoticeModule {}
