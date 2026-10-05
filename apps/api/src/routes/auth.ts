import bcrypt from "bcryptjs";
import { Router } from "express";
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
