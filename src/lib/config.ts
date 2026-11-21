const list = (v?: string) =>
  (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const config = {
  appName: process.env.APP_NAME || "OpenHR",
  appUrl: (process.env.APP_URL || process.env.AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** Emails that become ADMIN on first Google sign-in (bootstrap). */
  adminEmails: list(process.env.ADMIN_EMAILS),
  /** Email domains allowed to self-provision as EMPLOYEE on first sign-in. Empty = invite-only. */
  allowedDomains: list(process.env.ALLOWED_EMAIL_DOMAINS),
  /** ISO weekdays counted as working days (1=Mon … 7=Sun). */
  workingDays: (process.env.WORKING_DAYS || "1,2,3,4,5").split(",").map(Number),
  demoLogin: process.env.DEMO_LOGIN === "true",
  googleEnabled: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  currency: process.env.CURRENCY || "MYR",
  timezone: process.env.TZ_DISPLAY || "Asia/Kuala_Lumpur",
};
