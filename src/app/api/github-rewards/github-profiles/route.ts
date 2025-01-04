import { request, gql } from "graphql-request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { usernames } = await req.json();

    const url = "https://api.github.com/graphql";
    const document = gql`
          query GithubProfile {
              ${generateQuery(usernames)}
            }
          `;
    const res = await request<{ [key: string]: { avatarUrl: string } }[]>({
      url,
      document,
      requestHeaders: [
        ["Authorization", `Bearer ${process.env.GITHUB_AUTH_TOKEN}`],
      ],
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: Object.values(res),
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}

const generateQuery = (arr: string[]) => {
  let query = "";

  for (const i in arr) {
    const users = `user${i}`;

    query += `
                ${users}: user(login: "${arr[i]}") {
                  avatarUrl
                }
              `;
  }

  return query;
};
