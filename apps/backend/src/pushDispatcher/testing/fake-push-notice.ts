import { PUSH_NOTICE, PushNoticePort } from '../push-notice';

/**
 * The push port as a test gives it: recording, so a spec can hold an auto-stop
 * to one notice — and so a spec about a transition nobody is told about never
 * sends one at all.
 *
 * The second implementation behind {@link PushNoticePort}, which is why the
 * port exists. Without it a spec of the Active Cook would have to stand the
 * web-push library and a subscription collection up behind the stop it is
 * testing.
 *
 * Test-only — excluded from coverage collection.
 */
export interface FakePushNotice extends PushNoticePort {
  notify: jest.Mock<Promise<number>, [string, string]>;
}

/** A recording port, answering as a notice that reached one browser. */
export const fakePushNotice = (): FakePushNotice => ({
  notify: jest.fn<Promise<number>, [string, string]>(async () => 1),
});

/** The port as the provider a spec registers it under. */
export const pushNoticeProvider = (
  port: PushNoticePort = fakePushNotice(),
) => ({
  provide: PUSH_NOTICE,
  useValue: port,
});
