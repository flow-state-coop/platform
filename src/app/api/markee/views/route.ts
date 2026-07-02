export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body?.address || !body?.message) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const res = await fetch("https://markee.xyz/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: body.address, message: body.message }),
    });

    return Response.json(await res.json().catch(() => ({})), {
      status: res.status,
    });
  } catch {
    return Response.json({ error: "Upstream error" }, { status: 502 });
  }
}
