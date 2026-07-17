import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/lib/db"
import { users, sessions, accounts, verifications } from "@/lib/db/schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // signUpEmail is only ever called server-side (partner logins, seed); auto
    // sign-in there creates a session for the NEW user inside the caller's
    // request and can throw after the user row is inserted, leaving orphan
    // "viewer" accounts. Real sign-in goes through signInEmail at /login.
    autoSignIn: false,
    minPasswordLength: 10,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "viewer",
        required: true,
        input: false, // set server-side only
      },
      lang: {
        type: "string",
        defaultValue: "en",
        required: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // refresh every 24 h
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,            // cache for 5 min (reduces DB hits)
    },
  },
  // Brute-force protection: better-auth's built-in limiter, strictest on sign-in.
  // Note: in-memory storage — per-instance on serverless, still blocks rapid
  // single-source password guessing which is the realistic attack here.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
})

export type Session = typeof auth.$Infer.Session
export type AuthUser = typeof auth.$Infer.Session.user
