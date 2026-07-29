/**
 * An error no retry can fix. A job that hits one fails immediately rather than
 * spending its remaining attempts re-deriving the same outcome.
 */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}
