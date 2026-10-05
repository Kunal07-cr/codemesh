import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { AppConfig } from "../config.js";
import { forbidden, unauthorized } from "../errors.js";
import type { JsonStore } from "../db/store.js";
import { hasPermission, type Permission, type ProjectRole, type PublicUser } from "@codemesh/shared";

const ACCESS_COOKIE = "cm_access";
const REFRESH_COOKIE = "cm_refresh";
const CSRF_COOKIE = "cm_csrf";

export type AccessPayload = {
  sub: string;
  sid: string;
};

export type AuthContext = {
  user: PublicUser;
  sessionId: string;
};

export function createRequestId(): RequestHandler {
  return (req, _res, next) => {
    req.id = crypto.randomUUID();
    next();
  };
}

export function authenticate(config: AppConfig, store: JsonStore): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) {
      next();
      return;
    }
    try {
      const payload = jwt.verify(token, config.SESSION_SECRET) as AccessPayload;
      const user = store.getUser(payload.sub);
      if (user) {
        req.auth = { user, sessionId: payload.sid };
      }
    } catch {
      // Missing or expired access token is handled by requireAuth.
    }
    next();
  };
}

export function requireAuth(): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    next();
  };
}

export function requireProjectPermission(store: JsonStore, permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    const projectId = String(req.params.projectId ?? req.body.projectId);
    const project = store.getProject(projectId);
    if (!project) {
      next(unauthorized("Project authorization failed"));
      return;
    }
    const role = store.getRole(project.id, req.auth.user.id);
    if (!hasPermission(role, permission)) {
      next(forbidden(`Requires ${permission}`));
      return;
    }
    req.projectRole = role;
    next();
  };
}

export function requireVisibleProject(store: JsonStore): RequestHandler {
  return (req, _res, next) => {
    const projectId = String(req.params.projectId);
    const project = store.getProject(projectId);
    if (!project) {
      next(unauthorized("Project authorization failed"));
      return;
    }
    const role = req.auth ? store.getRole(project.id, req.auth.user.id) : null;
    if (project.visibility === "public" && project.published) {
      req.projectRole = role;
      next();
      return;
    }
    if (!role) {
      next(forbidden("This project is private."));
      return;
    }
    req.projectRole = role;
    next();
  };
}

export function csrfProtection(): RequestHandler {
  return (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    if (
      req.path.startsWith("/api/auth/login") ||
      req.path.startsWith("/api/auth/register") ||
      req.path.startsWith("/api/auth/password/forgot") ||
      req.path.startsWith("/api/auth/password/reset") ||
      req.path.startsWith("/api/auth/email/verify") ||
      req.path.startsWith("/api/integrations/github/webhook")
    ) {
      next();
      return;
    }
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.header("x-csrf-token");
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      next(forbidden("CSRF token mismatch."));
      return;
    }
    next();
  };
}

export function issueAccessToken(config: AppConfig, userId: string, sessionId: string) {
  return jwt.sign({ sub: userId, sid: sessionId }, config.SESSION_SECRET, { expiresIn: "15m" });
}

export async function issueRefreshToken(config: AppConfig, store: JsonStore, userId: string, rotatedFromId?: string) {
  const id = crypto.randomUUID();
  const raw = crypto.randomBytes(32).toString("base64url");
  const token = `${id}.${raw}`;
  await store.addRefreshToken({
    id,
    userId,
    tokenHash: await bcrypt.hash(raw, 12),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    rotatedFromId
  });
  const accessToken = issueAccessToken(config, userId, id);
  return { accessToken, refreshToken: token, refreshTokenId: id };
}

export async function verifyRefreshToken(store: JsonStore, token: string) {
  const [id, raw] = token.split(".");
  if (!id || !raw) return null;
  const record = store.getRefreshToken(id);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() < Date.now()) return null;
  const valid = await bcrypt.compare(raw, record.tokenHash);
  return valid ? record : null;
}

export function setAuthCookies(config: AppConfig, res: Response, accessToken: string, refreshToken: string) {
  const csrf = crypto.randomBytes(24).toString("base64url");
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    maxAge: 1000 * 60 * 15,
    path: "/"
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    maxAge: 1000 * 60 * 60 * 24 * 14,
    path: "/"
  });
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    maxAge: 1000 * 60 * 60 * 24 * 14,
    path: "/"
  });
}

export function clearAuthCookies(config: AppConfig, res: Response) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    res.clearCookie(name, { sameSite: config.cookie.sameSite, secure: config.cookie.secure, path: "/" });
  }
}

export function refreshCookieName() {
  return REFRESH_COOKIE;
}

export function accessCookieName() {
  return ACCESS_COOKIE;
}

export function createAuthRateLimiter(limit = 10, windowMs = 60_000): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many authentication attempts.", requestId: req.id } });
      return;
    }
    next();
  };
}

export function createUserRateLimiter(limit: number, windowMs = 60_000): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = `${req.auth?.user.id ?? req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("x-ratelimit-limit", String(limit));
      res.setHeader("x-ratelimit-remaining", String(Math.max(0, limit - 1)));
      next();
      return;
    }
    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader("x-ratelimit-limit", String(limit));
    res.setHeader("x-ratelimit-remaining", String(remaining));
    if (bucket.count > limit) {
      res.setHeader("retry-after", String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Assistant request limit reached. Try again shortly.", requestId: req.id } });
      return;
    }
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      projectRole?: ProjectRole | null;
    }
  }
}
