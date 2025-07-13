import { headers, cookies as nextCookies } from "next/headers";
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { SiweMessage } from "siwe";

const providers = [
  CredentialsProvider({
    name: "Ethereum",
    credentials: {
      message: {
        label: "Message",
        type: "text",
        placeholder: "0x0",
      },
      signature: {
        label: "Signature",
        type: "text",
        placeholder: "0x0",
      },
    },
    async authorize(credentials) {
      try {
        const headersList = await headers();
        const siwe = new SiweMessage(JSON.parse(credentials?.message || "{}"));
        const nextAuthUrl = new URL(
          headersList.get("origin") ?? "https://flowstate.network",
        );

        const cookies = await nextCookies();
        const result = await siwe.verify({
          signature: credentials?.signature || "",
          domain: nextAuthUrl.host,
          nonce: cookies.get("next-auth.csrf-token")?.value.split("|")[0], // csfr
        });

        if (result.success) {
          return {
            id: siwe.address,
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    },
  }),
];

const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: { session: any; token: any }) {
      session.address = token.sub;
      session.user.name = token.sub;
      session.user.image = "";

      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST, authOptions };
