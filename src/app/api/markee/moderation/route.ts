export async function GET() {
  try {
    const res = await fetch("https://markee.xyz/api/moderation", {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return Response.json({ flagged: [] });
    }

    return Response.json(await res.json());
  } catch {
    return Response.json({ flagged: [] });
  }
}
