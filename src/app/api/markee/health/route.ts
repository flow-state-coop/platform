export async function GET() {
  return Response.json({
    overall: "ok",
    checks: {
      leaderboards: { status: "ok" },
      views: { status: "ok" },
      moderation: { status: "ok" },
    },
  });
}
