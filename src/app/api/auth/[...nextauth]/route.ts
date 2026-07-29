import { cookies as nextCookies } from "next/headers";
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createPublicClient, http, type Hex } from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { networks } from "@/lib/networks";

function getPublicClient(chainId: number) {
  const network = networks.find((n) => n.id === chainId);

  return createPublicClient({
    transport: http(network?.rpcUrl),
  });
}

const PRODUCTION_HOST = "flowstate.network";

// A dev server takes whatever port is free, and is opened from a phone on the
// LAN as often as from the machine running it. Outside production these are
// matched by shape rather than listed, because a sign-in that silently fails on
// the host the developer is actually browsing is worse than no gate at all.
const LOCAL_HOST_PATTERN =
  /^(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d{1,5})?$/;

/**
 * Hosts a sign-in message may be signed for. Sourced from configuration only,
 * never from the request. SIWE_ALLOWED_DOMAINS names the deployments reached on
 * an alias of their own, which no VERCEL_* variable carries.
 */
export function allowedSiweDomains(): string[] {
  const hosts = new Set<string>([PRODUCTION_HOST]);

  for (const configured of (process.env.SIWE_ALLOWED_DOMAINS ?? "").split(
    ",",
  )) {
    const host = configured.trim();
    if (host) hosts.add(host);
  }

  if (process.env.NEXTAUTH_URL) {
    try {
      hosts.add(new URL(process.env.NEXTAUTH_URL).host);
    } catch {
      console.error("NEXTAUTH_URL is set but is not a valid URL");
    }
  }

  // A preview is reached on its branch alias as often as its deployment URL,
  // and the message carries whichever the browser was on.
  for (const platformHost of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (platformHost) hosts.add(platformHost);
  }

  if (process.env.NODE_ENV !== "production") {
    hosts.add("localhost:3000");
  }

  return [...hosts];
}

export function isAllowedSiweDomain(domain: string): boolean {
  if (allowedSiweDomains().includes(domain)) {
    return true;
  }

  return (
    process.env.NODE_ENV !== "production" && LOCAL_HOST_PATTERN.test(domain)
  );
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
        const message = credentials?.message || "";
        const siweFields = parseSiweMessage(message);

        if (!siweFields.chainId || !siweFields.address || !siweFields.domain) {
          return null;
        }

        // This is the domain check; the one in verifySiweMessage below only
        // compares the message against itself.
        if (!isAllowedSiweDomain(siweFields.domain)) {
          console.error(`Unrecognized sign-in domain: ${siweFields.domain}`);
          return null;
        }

        const cookies = await nextCookies();
        const nonce = cookies.get("next-auth.csrf-token")?.value.split("|")[0];

        const publicClient = getPublicClient(siweFields.chainId);

        const isValid = await verifySiweMessage(publicClient, {
          message,
          signature: credentials?.signature as Hex,
          domain: siweFields.domain,
          nonce,
        });

        if (isValid) {
          return { id: siweFields.address };
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
