/**
 * Thrown when a wire payload cannot be decoded into its frozen shape. Signals a
 * deterministic, all-or-nothing rejection: a decode either yields a complete,
 * valid value or throws this — never a partial result.
 */
export class WireDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'WireDecodeError';
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, WireDecodeError.prototype);
  }
}
