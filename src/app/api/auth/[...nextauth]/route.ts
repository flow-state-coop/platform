import NextAuth from "next-auth";
import { nextAuthOptions } from "@/lib/utils";

const handler = NextAuth(nextAuthOptions);

export { handler as GET, handler as POST };
