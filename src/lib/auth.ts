import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import { config } from "./config";
import { audit } from "./audit";

/**
 * Decide whether an email may sign in, creating the user on first login when allowed.
 * Returns the user id or null.
 */
async function resolveUser(emailRaw: string, name?: string | null, image?: string | null) {
  const email = emailRaw.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status !== "ACTIVE") return null;
    await db.user.update({
      where: { id: existing.id },
      data: { lastLoginAt: new Date(), image: image ?? existing.image },
    });
    return existing.id;
  }
  const domain = email.split("@")[1] ?? "";
  const isAdmin = config.adminEmails.includes(email);
  if (!isAdmin && !config.allowedDomains.includes(domain)) return null;
  const user = await db.user.create({
    data: {
      email,
      name: name || email.split("@")[0],
      image,
      role: isAdmin ? "ADMIN" : "EMPLOYEE",
      lastLoginAt: new Date(),
    },
  });
  await audit(user.id, "user.self_provisioned", "User", user.id, { role: user.role });
  return user.id;
}

const providers: NextAuthConfig["providers"] = [];
if (config.googleEnabled) {
  providers.push(
    Google({
      // Show the account chooser every time so shared PCs don't silently reuse a session.
      authorization: { params: { prompt: "select_account" } },
    }),
  );
}
if (config.demoLogin) {
  // Evaluation only: sign in as any existing active user by email, no password.
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase();
        const u = await db.user.findUnique({ where: { email } });
        if (!u || u.status !== "ACTIVE") return null;
        return { id: u.id, email: u.email, name: u.name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        if (!profile?.email || profile.email_verified !== true) return false;
        const id = await resolveUser(profile.email, profile.name, (profile as { picture?: string }).picture);
        if (!id) return "/login?error=NotInvited";
        user.id = id;
        return true;
      }
      return account?.provider === "demo" && !!user?.id;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session as { uid?: string }).uid = token.uid as string;
      return session;
    },
  },
});
