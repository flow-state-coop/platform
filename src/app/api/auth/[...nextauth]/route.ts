import { cookies as nextCookies } from "next/headers";
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createPublicClient, http, type Hex } from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { networks } from "@/lib/networks";
import { hasUsableExpiry } from "@/lib/siwe";
import { allowRequest, clientIdentifier } from "../../rateLimit";

// Null on a chain the platform is not configured for. The chain id comes from
// the unauthenticated message, so tolerating an unknown one meant a caller could
// aim the verification eth_call wherever it liked.
function getPublicClient(chainId: number) {
  const network = networks.find((n) => n.id === chainId);
  if (!network) return null;

  return createPublicClient({
    transport: http(network.rpcUrl),
  });
}

const PRODUCTION_HOST = "flowstate.network";

// A dev server takes whatever port is free, and is opened from a phone on the
// LAN as often as from the machine running it. Outside production these are
// matched by shape rather than listed, because a sign-in that silently fails on
// the host the developer is actually browsing is worse than no gate at all.
const LOCAL_HOST_PATTERN =
  /^(localhost|\[::1\]|(?<ip>\d{1,3}(?:\.\d{1,3}){3}))(?::(?<port>[1-9]\d{0,4}))?$/;

// The ranges are checked as numbers rather than spelled into the pattern above.
// A regex doing arithmetic is what let `192.168.999.999` and port `99999`
// through: both are the right shape and neither is an address.
function isLoopbackOrPrivate(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return false;

  const [first, second] = octets;

  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

function isLocalHost(domain: string): boolean {
  const match = LOCAL_HOST_PATTERN.exec(domain);
  if (!match) return false;

  const { ip, port } = match.groups ?? {};

  if (port !== undefined && Number(port) > 65_535) return false;

  return ip === undefined || isLoopbackOrPrivate(ip);
}

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

  return process.env.NODE_ENV !== "production" && isLocalHost(domain);
}

// NextAuth prefixes its cookies with __Host- whenever it issues secure ones,
// which is every deployment served over HTTPS. Reading only the bare name finds
// nothing in production, and viem skips the nonce comparison when the nonce is
// undefined, so the whole replay defence silently stopped applying anywhere it
// mattered. Both names are read, and a missing nonce fails the sign-in.
const CSRF_COOKIE_NAMES = [
  "__Host-next-auth.csrf-token",
  "next-auth.csrf-token",
];

type CookieReader = { get: (name: string) => { value: string } | undefined };

export function readCsrfNonce(cookies: CookieReader): string | null {
  for (const name of CSRF_COOKIE_NAMES) {
    const nonce = cookies.get(name)?.value.split("|")[0];
    if (nonce) return nonce;
  }

  return null;
}

// Signing in is a human action a handful of times a day, and a shared office or
// carrier NAT is one client here, so this is set to stop amplification rather
// than to pace anybody.
const SIGN_IN_LIMIT = 60;
const SIGN_IN_WINDOW_MS = 60_000;

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
    async authorize(credentials, req) {
      try {
        // Before anything else, because verification is the expensive part:
        // viem tries ERC-6492 deployless verification first, so every attempt
        // with a garbage signature costs an eth_call on a chain the caller
        // picks, against the same RPC quota the bot broadcasts through. Nothing
        // here is authenticated, so the client is all there is to key on.
        if (
          !allowRequest(
            "sign-in",
            clientIdentifier(req?.headers),
            SIGN_IN_LIMIT,
            SIGN_IN_WINDOW_MS,
          )
        ) {
          return null;
        }

        const message = credentials?.message || "";
        const siweFields = parseSiweMessage(message);

        if (!siweFields.chainId || !siweFields.address || !siweFields.domain) {
          return null;
        }

        // The only domain check there is. `verifySiweMessage` below is given no
        // domain on purpose: the only one available here is the message's own,
        // so passing it would compare the message against itself and read like
        // enforcement while accepting anything.
        if (!isAllowedSiweDomain(siweFields.domain)) {
          console.error(`Unrecognized sign-in domain: ${siweFields.domain}`);
          return null;
        }

        if (!hasUsableExpiry(siweFields.expirationTime)) {
          // Logged against our own clock, because that comparison is the whole
          // check: the expiry is stamped by the signer's browser, and a machine
          // far enough behind signs a message that is already expired on
          // arrival. Silently it is indistinguishable from a bad signature, and
          // the alert the caller sees says nothing about a clock.
          console.error(
            `Unusable sign-in expiry: ${
              siweFields.expirationTime?.toISOString() ?? "absent"
            }, ours is ${new Date().toISOString()}`,
          );
          return null;
        }

        const nonce = readCsrfNonce(await nextCookies());
        if (!nonce) {
          return null;
        }

        const publicClient = getPublicClient(siweFields.chainId);
        if (!publicClient) {
          return null;
        }

        const isValid = await verifySiweMessage(publicClient, {
          message,
          signature: credentials?.signature as Hex,
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
