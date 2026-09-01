/**
 * The pull, as it is stored on a cook: the moment the meat came off the smoker
 * and how hot it was when it did.
 *
 * Stamped by the server on the Smoke → Post-Smoke advance rather than typed in,
 * because it is the one gesture the pitmaster is already making — and the rest
 * timer, the carryover and the safe-to-hold window are all read from it.
 *
 * Declared beside {@link ServePlan} rather than inside it: a plan is what the
 * user asked for and may write, while a pull is what happened and is only ever
 * recorded. Every reader of the two names the same fields from one declaration.
 *
 * Both halves are optional. A cook that has not been pulled yet has neither,
 * every cook recorded before the stamp existed has neither, and a cook pulled
 * with no probe being watched has a moment but no temperature — nothing was
 * measuring the meat, and a stamped zero would be a claim that it was.
 */
export interface PullStamp {
  /** When the meat came off the smoker. */
  pullAt?: Date | null;
  /** What the watched probe read at that moment, °F. */
  pullTemp?: number | null;
}
