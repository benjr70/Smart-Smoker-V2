/**
 * How a transition the pitmaster did not ask for reaches them wherever they
 * are, without knowing how a push is delivered.
 *
 * A port rather than `PushDispatcherService` because of what the Active Cook
 * is: everything depends on it, so a module edge out of it to the push
 * dispatcher — which registers a collection of its own and talks to third-party
 * endpoints — is an edge the whole application would carry. A token carries no
 * such reference, and it is what lets the Active Cook's spec hold a stop to
 * sending exactly one notice without a push transport anywhere near it.
 *
 * The one notice it exists for is the auto-stop: the socket only reaches an app
 * that is open, and a cook goes stale precisely because nobody is watching one.
 * See `PushNoticeModule` for the real implementation, and the recording fake in
 * the Active Cook's spec for the other one.
 */
export const PUSH_NOTICE = 'PUSH_NOTICE';

export interface PushNoticePort {
  /**
   * Deliver one notice to every registered browser, and answer how many were
   * reached.
   *
   * The count is the dispatcher's own answer, kept in the port so that the real
   * implementation is the dispatcher itself rather than a wrapper around it.
   * Nothing in a transition reads it: a notice is a courtesy on top of a write
   * that has already happened.
   */
  notify(title: string, body: string): Promise<number>;
}
