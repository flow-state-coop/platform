import { errorResponse } from "../utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${process.env.MAILERLITE_API_TOKEN}`,
      },
      body: JSON.stringify({
        email,
        groups: ["132395805602481599"],
      }),
    });

    if (res.status === 200) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Already Subscribed",
        }),
      );
    }

    if (res.status === 201) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Success!",
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: "There was an error, try again later",
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
