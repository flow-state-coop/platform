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
