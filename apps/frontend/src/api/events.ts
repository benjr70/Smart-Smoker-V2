/**
 * Event-emitter port — the seam for the client's one websocket side-effect.
 *
 * Clearing a smoke must also broadcast a `clear` signal over the websocket so
 * connected devices reset. Rather than let the transport-pure REST client reach
 * for `socket.io-client`, the client calls this tiny injected port. Production
 * supplies a socket-backed adapter (see socketEventAdapter); tests supply a
 * stub. This keeps the third stray socket-creation site out of the client and
 * the legacy service.
 */
export interface SmokeEventPort {
  /** Broadcast that the current smoke was cleared (websocket `clear` event). */
  emitClear(): void;
}

/**
 * Default no-op port. Used when a client is built without an injected emitter
 * (e.g. the in-memory fake backend in tests) so the REST behavior can be
 * exercised without a socket. Production always injects the socket adapter.
 */
export const noopEventPort: SmokeEventPort = {
  emitClear: () => undefined,
};
