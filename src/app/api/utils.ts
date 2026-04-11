export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === "string") {
    return err;
  }

  return "An unexpected error occurred";
}

export function errorResponse(error: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify({ success: false, error: getErrorMessage(error) }),
    { status },
  );
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Payload too large");
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Reads and JSON-parses a request body with a hard byte cap.
 * Unlike `request.json()`, this streams the body and aborts if the
 * total size exceeds `maxBytes`, so it is not defeated by a lying
 * or missing `Content-Length` header.
 *
 * Throws `PayloadTooLargeError` on size violation and `SyntaxError`
 * on invalid JSON.
 */
export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes: number,
): Promise<T> {
  // Fast path: trust an honest Content-Length header to reject early.
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    throw new PayloadTooLargeError();
  }

  if (!request.body) {
    throw new Error("Empty request body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader may already be released after cancel
    }
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(combined)) as T;
}
