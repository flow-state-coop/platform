import { headers, cookies as nextCookies } from "next/headers";
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createPublicClient, http, type Hex } from "viem";
import { verifySiweMessage } from "viem/siwe";
import { SiweMessage } from "siwe";
import { networks } from "@/lib/networks";

function getPublicClient(chainId: number) {
  const network = networks.find((n) => n.id === chainId);

  return createPublicClient({
    transport: http(network?.rpcUrl),
  });
}

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
        const message = siwe.prepareMessage();

        const nextAuthUrl = new URL(
          headersList.get("origin") ?? "https://flowstate.network",
        );
        const cookies = await nextCookies();
        const nonce = cookies.get("next-auth.csrf-token")?.value.split("|")[0];

        const publicClient = getPublicClient(siwe.chainId);

        const isValid = await verifySiweMessage(publicClient, {
          message,
          signature: credentials?.signature as Hex,
          domain: nextAuthUrl.host,
          nonce,
        });

        if (isValid) {
          return { id: siwe.address };
        }
        return null;
      } catch (e) {
        console.error("SIWE verification error:", e);
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
