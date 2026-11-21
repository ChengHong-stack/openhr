import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { config } from "@/lib/config";

const ERRORS: Record<string, string> = {
  NotInvited: "Your account hasn't been added yet. Ask your HR admin to invite you.",
  AccessDenied: "Access denied. Your account may be inactive or not invited.",
  CredentialsSignin: "No active user with that email.",
  Configuration: "Sign-in is misconfigured. Check AUTH_SECRET and Google OAuth settings.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
            {config.appName.slice(0, 1)}
          </div>
          <h1 className="h1">{config.appName}</h1>
          <p className="muted mt-1">Leave, claims and people — in one place.</p>
        </div>
        <div className="card space-y-4">
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{ERRORS[error] ?? "Sign-in failed."}</p>
          )}
          {config.googleEnabled ? (
            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
              <button className="btn-secondary w-full py-2.5">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
                </svg>
                Sign in with Google
              </button>
            </form>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Google sign-in isn't configured. Set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code>.
            </p>
          )}
          {config.demoLogin && (
            <form
              className="space-y-2 border-t border-slate-100 pt-4"
              action={async (fd: FormData) => {
                "use server";
                try {
                  await signIn("demo", { email: String(fd.get("email") ?? ""), redirectTo: "/" });
                } catch (e) {
                  if (e instanceof AuthError) redirect("/login?error=CredentialsSignin");
                  throw e;
                }
              }}
            >
              <label className="label">Demo login (no password — disable in production)</label>
              <input name="email" type="email" required className="input" placeholder="admin@example.com" />
              <button className="btn-primary w-full">Continue</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
