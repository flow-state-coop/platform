/**
 * An error no retry can fix. A job that hits one fails immediately rather than
 * spending its remaining attempts re-deriving the same outcome.
 *
 * The message is written for the caller: both the write admission and the job
 * runner surface it verbatim, because the one actionable thing about the
 * refusal (a pool too large to enumerate, say) is otherwise only in our logs.
 */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

/**
 * The chain refusing a transaction we sent, as opposed to a condition we
 * refused ourselves. Permanent for the same reason, but it is the one case
 * whose repair is a corrected payload rather than the same one again, so the
 * two cannot share advice.
 */
export class RevertedError extends PermanentError {
  constructor(message: string) {
    super(message);
    this.name = "RevertedError";
  }
}
