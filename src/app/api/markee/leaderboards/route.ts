export async function GET() {
  try {
    const res = await fetch("https://markee.xyz/api/ecosystem/leaderboards", {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return Response.json({ leaderboards: [] }, { status: res.status });
    }

    return Response.json(await res.json());
  } catch {
    return Response.json({ leaderboards: [] }, { status: 502 });
  }
}
