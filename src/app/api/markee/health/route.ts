const PROBE_TIMEOUT_MS = 5000;

async function probe(url: string, init?: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

export async function GET() {
  const [leaderboardsRes, moderationRes, viewsRes] = await Promise.all([
    probe("https://markee.xyz/api/ecosystem/leaderboards"),
    probe("https://markee.xyz/api/moderation"),
    probe("https://markee.xyz/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  ]);

  const checks = {
    leaderboards: { status: leaderboardsRes?.ok ? "ok" : "error" },
    // the empty probe body gets a 4xx, which still proves the endpoint is up
    views: {
      status: viewsRes && viewsRes.status < 500 ? "ok" : "error",
    },
    moderation: { status: moderationRes?.ok ? "ok" : "error" },
  };

  return Response.json({
    overall: Object.values(checks).every((check) => check.status === "ok")
      ? "ok"
      : "error",
    checks,
  });
}
