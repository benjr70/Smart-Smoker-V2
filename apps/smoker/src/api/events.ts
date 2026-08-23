/**
 * Event-emitter port — the seam for the client's one websocket side-effect.
 *
 * Letting go of a cook is not only a write: every screen watching the smoker
 * has to be told, or it keeps drawing the cook that no longer exists. The
 * backend says so only when a client asks it to — it rebroadcasts the `clear`
 * a client emits and announces nothing on its own — so the panel emits one
 * exactly as the web client does.
 *
 * Rather than let the transport-pure client reach for `socket.io-client`, it
 * calls this tiny injected port: production supplies the socket-backed adapter
 * (see socketEventAdapter), tests supply a stub, and the appliance keeps its
 * socket creation in the two places that own connections.
 */
export interface SmokeEventPort {
  /** Broadcast that the current smoke was cleared (websocket `clear` event). */
  emitClear(): void;
}

/**
 * Default no-op port. Used when a client is built without an injected emitter
 * (the in-memory fake backend in tests) so the REST behaviour can be exercised
 * without a socket. Production always injects the socket adapter.
 */
export const noopEventPort: SmokeEventPort = {
  emitClear: () => undefined,
};
