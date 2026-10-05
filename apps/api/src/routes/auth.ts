import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { loginSchema, registerSchema } from "@codemesh/shared";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, unauthorized } from "../errors.js";
import {
  clearAuthCookies,
  createAuthRateLimiter,
  issueRefreshToken,
  refreshCookieName,
  requireAuth,
  setAuthCookies,
  verifyRefreshToken
} from "../services/security.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";
import { deliverAccountEmail } from "../services/emailDelivery.js";

const emailSchema = z.object({ email: z.string().trim().email() });
const actionTokenSchema = z.object({ token: z.string().min(32), password: z.string().min(10).max(128).optional() });

export function authRoutes(config: AppConfig, store: JsonStore) {
  const router = Router();
  const authLimiter = createAuthRateLimiter();

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/me", (req, res) => {
    ok(res, { user: req.auth?.user ?? null });
  });

  router.post(
    "/register",
    authLimiter,
    asyncHandler(async (req, res) => {
      const input = parseBody(registerSchema, req);
      const existing = store.getUserRecordByEmail(input.email);
      if (existing) throw badRequest("A user with this email already exists.");
      const user = await store.createUser(input);
      await issueAccountAction(config, store, user.id, "email_verification").catch(() => undefined);
      const issued = await issueRefreshToken(config, store, user.id);
      setAuthCookies(config, res, issued.accessToken, issued.refreshToken);
      ok(res, { user });
    })
  );

  router.post(
    "/login",
    authLimiter,
    asyncHandler(async (req, res) => {
      const input = parseBody(loginSchema, req);
      const user = store.getUserRecordByEmail(input.email);
      if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw unauthorized("Invalid credentials");
      }
      const issued = await issueRefreshToken(config, store, user.id);
      setAuthCookies(config, res, issued.accessToken, issued.refreshToken);
      ok(res, { user: store.getUser(user.id) });
    })
  );

  router.get(
    "/sessions",
    requireAuth(),
    (req, res) => {
      ok(res, {
        currentSessionId: req.auth!.sessionId,
        sessions: store.listRefreshTokens(req.auth!.user.id).map((session) => ({
          ...session,
          current: session.id === req.auth!.sessionId,
          active: !session.revokedAt && Date.parse(session.expiresAt) > Date.now()
        }))
      });
    }
  );

  router.delete(
    "/sessions/:sessionId",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const sessionId = String(req.params.sessionId);
      const session = store.getRefreshToken(sessionId);
      if (!session || session.userId !== req.auth!.user.id) throw unauthorized("Session not found.");
      await store.revokeRefreshToken(sessionId);
      if (sessionId === req.auth!.sessionId) clearAuthCookies(config, res);
      ok(res, { revoked: true, current: sessionId === req.auth!.sessionId });
    })
  );

  router.post(
    "/password/forgot",
    authLimiter,
    asyncHandler(async (req, res) => {
      const { email } = parseBody(emailSchema, req);
      const user = store.getUserRecordByEmail(email);
      let developmentToken: string | undefined;
      if (user) {
        const issued = await issueAccountAction(config, store, user.id, "password_reset");
        if (!config.isProduction) developmentToken = issued.rawToken;
      }
      ok(res, {
        accepted: true,
        message: "If the account exists, password recovery instructions have been sent.",
        developmentToken
      });
    })
  );

  router.post(
    "/password/reset",
    authLimiter,
    asyncHandler(async (req, res) => {
      const input = parseBody(actionTokenSchema.extend({ password: z.string().min(10).max(128) }), req);
      const record = await store.consumeAuthActionToken("password_reset", hashToken(input.token));
      if (!record) throw unauthorized("Password recovery token is invalid or expired.");
      await store.updateUserPassword(record.userId, input.password);
      clearAuthCookies(config, res);
      ok(res, { reset: true });
    })
  );

  router.post(
    "/email/verification",
    requireAuth(),
    asyncHandler(async (req, res) => {
      if (store.isEmailVerified(req.auth!.user.id)) {
        ok(res, { verified: true, alreadyVerified: true });
        return;
      }
      const issued = await issueAccountAction(config, store, req.auth!.user.id, "email_verification");
      ok(res, { sent: issued.delivered, developmentToken: config.isProduction ? undefined : issued.rawToken });
    })
  );

  router.post(
    "/email/verify",
    authLimiter,
    asyncHandler(async (req, res) => {
      const input = parseBody(actionTokenSchema.pick({ token: true }), req);
      const record = await store.consumeAuthActionToken("email_verification", hashToken(input.token));
      if (!record) throw unauthorized("Verification token is invalid or expired.");
      await store.markEmailVerified(record.userId);
      ok(res, { verified: true });
    })
  );

  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const refreshToken = req.cookies?.[refreshCookieName()];
      if (!refreshToken) throw unauthorized("Refresh token required.");
      const record = await verifyRefreshToken(store, refreshToken);
      if (!record) throw unauthorized("Refresh token is invalid or expired.");
      await store.revokeRefreshToken(record.id);
      const issued = await issueRefreshToken(config, store, record.userId, record.id);
      setAuthCookies(config, res, issued.accessToken, issued.refreshToken);
      ok(res, { user: store.getUser(record.userId) });
    })
  );

  router.post(
    "/logout",
    requireAuth(),
    asyncHandler(async (req, res) => {
      if (req.auth?.sessionId) await store.revokeRefreshToken(req.auth.sessionId);
      clearAuthCookies(config, res);
      ok(res, { ok: true });
    })
  );

  return router;
}

async function issueAccountAction(
  config: AppConfig,
  store: JsonStore,
  userId: string,
  kind: "password_reset" | "email_verification"
) {
  const user = store.getUserRecord(userId);
  if (!user) throw unauthorized("Account not found.");
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (kind === "password_reset" ? 30 : 24 * 60) * 60_000).toISOString();
  await store.addAuthActionToken({ userId, kind, tokenHash: hashToken(rawToken), expiresAt });
  const route = kind === "password_reset" ? "/account/reset-password" : "/account/verify-email";
  const actionUrl = `${config.publicUrl.replace(/\/$/, "")}${route}?token=${encodeURIComponent(rawToken)}`;
  const delivery = await deliverAccountEmail(config, { kind, email: user.email, name: user.name, actionUrl, expiresAt });
  return { rawToken, expiresAt, delivered: delivery.delivered };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
