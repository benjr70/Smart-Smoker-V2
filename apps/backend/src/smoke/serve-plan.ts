/**
 * The Serve Plan as it is stored on a cook: the two fields every reader and
 * every writer of a plan names, declared once.
 *
 * One interface rather than the same pair restated on the schema, the write
 * payloads and the timeline's view of a stored cook — the plan grows a field
 * (the pull stamp is next) and a declaration missed would drop it silently on
 * whichever path missed it.
 *
 * Both halves are optional, and `null` is how a plan is cleared: a cook nobody
 * planned, and every cook recorded before the plan existed, has neither.
 */
export interface ServePlan {
  /** When the food is meant to hit the table. */
  serveAt?: Date | null;
  /**
   * How long the meat rests before it is carved, in minutes — the cook's one
   * canonical rest, shared with the Post-Smoke record.
   */
  restMinutes?: number | null;
}
