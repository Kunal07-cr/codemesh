import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import * as Y from "yjs";
import { hasPermission, permissionsForRole, type ProjectRole } from "@codemesh/shared";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { accessCookieName, type AccessPayload } from "../services/security.js";

type SocketUser = {
  id: string;
  name: string;
  email: string;
};

type DocKey = `${string}:${string}:${string}`;

export type RealtimeRuntime = {
  io: Server;
  mode: "memory" | "redis";
  configured: boolean;
  detail: string;
  health(): Promise<{ ok: boolean; configured: boolean; mode: "memory" | "redis"; detail: string }>;
  close(): Promise<void>;
};

export async function attachRealtime(server: HttpServer, config: AppConfig, store: JsonStore): Promise<RealtimeRuntime> {
  const io = new Server(server, {
    cors: {
      origin: config.corsOrigins,
      credentials: true
    }
  });
  const docs = new Map<DocKey, Y.Doc>();
  let pubClient: Redis | undefined;
  let subClient: Redis | undefined;
  let mode: RealtimeRuntime["mode"] = "memory";
  let detail = "Single-instance realtime collaboration is active.";

  if (config.REDIS_URL) {
    try {
      pubClient = new Redis(config.REDIS_URL, { lazyConnect: true, connectTimeout: 2_500, maxRetriesPerRequest: null });
      subClient = pubClient.duplicate();
      pubClient.on("error", () => undefined);
      subClient.on("error", () => undefined);
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      mode = "redis";
      detail = "Redis-backed Socket.IO fan-out is active.";
    } catch (error) {
      detail = `Redis was configured but unavailable; using single-instance realtime. ${error instanceof Error ? error.message : ""}`.trim();
      pubClient?.disconnect();
      subClient?.disconnect();
      pubClient = undefined;
      subClient = undefined;
    }
  }

  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie ?? "");
    const token = cookies[accessCookieName()];
    if (!token) {
      next(new Error("Authentication required."));
      return;
    }
    try {
      const payload = jwt.verify(token, config.SESSION_SECRET) as AccessPayload;
      const user = store.getUser(payload.sub);
      if (!user) {
        next(new Error("User not found."));
        return;
      }
      socket.data.user = user satisfies SocketUser;
      next();
    } catch {
      next(new Error("Invalid or expired session."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("workspace:join", (payload: { projectId: string; workspaceId: string }, callback) => {
      const role = getRole(store, payload.projectId, socket.data.user.id);
      if (!role || !hasPermission(role, "project.read")) {
        callback?.({ ok: false, error: "Not authorized for this workspace." });
        return;
      }
      const room = roomName(payload.projectId, payload.workspaceId);
      socket.join(room);
      socket.data.projectId = payload.projectId;
      socket.data.workspaceId = payload.workspaceId;
      socket.to(room).emit("presence:joined", { user: socket.data.user, role });
      callback?.({
        ok: true,
        user: socket.data.user,
        role,
        permissions: permissionsForRole(role)
      });
    });

    socket.on(
      "doc:open",
      (payload: { projectId: string; workspaceId: string; path: string }, callback: (response: unknown) => void) => {
        const role = getRole(store, payload.projectId, socket.data.user.id);
        if (!role || !hasPermission(role, "project.read")) {
          callback({ ok: false, error: "Not authorized." });
          return;
        }
        const doc = ensureDoc(docs, store, payload.projectId, payload.workspaceId, payload.path);
        callback({
          ok: true,
          update: Array.from(Y.encodeStateAsUpdate(doc)),
          stateVector: Array.from(Y.encodeStateVector(doc))
        });
      }
    );

    socket.on(
      "doc:update",
      async (
        payload: { projectId: string; workspaceId: string; path: string; update: number[] },
        callback: (response: unknown) => void
      ) => {
        const role = getRole(store, payload.projectId, socket.data.user.id);
        if (!role || !hasPermission(role, "workspace.edit")) {
          callback({ ok: false, error: "Editing is not permitted for this role." });
          return;
        }
        const doc = ensureDoc(docs, store, payload.projectId, payload.workspaceId, payload.path);
        const update = Uint8Array.from(payload.update);
        Y.applyUpdate(doc, update, socket.id);
        const text = doc.getText("content").toString();
        await store.upsertWorkspaceDoc(payload.projectId, payload.workspaceId, payload.path, text);
        socket
          .to(roomName(payload.projectId, payload.workspaceId))
          .emit("doc:update", { path: payload.path, update: payload.update, userId: socket.data.user.id });
        callback({ ok: true });
      }
    );

    socket.on(
      "doc:restore",
      async (
        payload: { projectId: string; workspaceId: string; revisionId: string },
        callback: (response: unknown) => void
      ) => {
        const role = getRole(store, payload.projectId, socket.data.user.id);
        if (!role || !hasPermission(role, "workspace.review")) {
          callback({ ok: false, error: "Review permission is required to restore a file revision." });
          return;
        }
        const restored = await store.restoreWorkspaceRevision(payload.projectId, payload.workspaceId, payload.revisionId, socket.data.user.id);
        if (!restored) {
          callback({ ok: false, error: "Revision not found." });
          return;
        }
        const doc = ensureDoc(docs, store, payload.projectId, payload.workspaceId, restored.revision.path);
        const text = doc.getText("content");
        doc.transact(() => {
          text.delete(0, text.length);
          text.insert(0, restored.revision.content);
        }, "revision-restore");
        const update = Array.from(Y.encodeStateAsUpdate(doc));
        io.to(roomName(payload.projectId, payload.workspaceId)).emit("doc:restored", { path: restored.revision.path, update });
        callback({ ok: true, path: restored.revision.path });
      }
    );

    socket.on("presence:update", (payload: { projectId: string; workspaceId: string; path?: string; cursor?: unknown }) => {
      socket
        .to(roomName(payload.projectId, payload.workspaceId))
        .emit("presence:update", { user: socket.data.user, path: payload.path, cursor: payload.cursor });
    });

    socket.on(
      "workspace:chat:send",
      async (payload: { projectId: string; workspaceId: string; body: string }, callback: (response: unknown) => void) => {
        const role = getRole(store, payload.projectId, socket.data.user.id);
        if (!role || !hasPermission(role, "discussion.post")) {
          callback({ ok: false, error: "Chat is not permitted for this role." });
          return;
        }
        const message = await store.addWorkspaceChat(payload.projectId, payload.workspaceId, socket.data.user.id, payload.body);
        io.to(roomName(payload.projectId, payload.workspaceId)).emit("workspace:chat:message", message);
        callback({ ok: true, message });
      }
    );

    socket.on(
      "annotation:create",
      async (
        payload: {
          projectId: string;
          workspaceId: string;
          filePath: string;
          symbolId?: string;
          range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
          body: string;
          sourceRevision: string;
        },
        callback: (response: unknown) => void
      ) => {
        const role = getRole(store, payload.projectId, socket.data.user.id);
        if (!role || !hasPermission(role, "project.read")) {
          callback({ ok: false, error: "Not authorized to annotate this project." });
          return;
        }
        const body = payload.body.trim();
        if (body.length < 2 || body.length > 1000) {
          callback({ ok: false, error: "Annotation must contain between 2 and 1000 characters." });
          return;
        }
        const annotation = await store.createAnnotation({
          projectId: payload.projectId,
          filePath: payload.filePath,
          symbolId: payload.symbolId,
          range: payload.range,
          body,
          authorId: socket.data.user.id,
          sourceRevision: payload.sourceRevision
        });
        io.to(roomName(payload.projectId, payload.workspaceId)).emit("annotation:created", annotation);
        callback({ ok: true, annotation });
      }
    );

    socket.on(
      "annotation:delete",
      async (payload: { projectId: string; workspaceId: string; annotationId: string }, callback: (response: unknown) => void) => {
        const role = getRole(store, payload.projectId, socket.data.user.id);
        if (!role || !hasPermission(role, "project.read")) {
          callback({ ok: false, error: "Not authorized." });
          return;
        }
        const deleted = await store.deleteAnnotation(payload.projectId, payload.annotationId, socket.data.user.id, role === "owner" || role === "maintainer");
        if (!deleted) {
          callback({ ok: false, error: "Annotation not found or cannot be removed." });
          return;
        }
        io.to(roomName(payload.projectId, payload.workspaceId)).emit("annotation:deleted", { annotationId: payload.annotationId });
        callback({ ok: true });
      }
    );
  });

  return {
    io,
    mode,
    configured: Boolean(config.REDIS_URL),
    detail,
    async health() {
      if (!pubClient || mode !== "redis") return { ok: true, configured: Boolean(config.REDIS_URL), mode, detail };
      try {
        const pong = await pubClient.ping();
        return { ok: pong === "PONG", configured: true, mode, detail };
      } catch (error) {
        return { ok: false, configured: true, mode, detail: error instanceof Error ? error.message : "Redis is unavailable." };
      }
    },
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.allSettled([pubClient?.quit(), subClient?.quit()].filter(Boolean) as Array<Promise<unknown>>);
    }
  };
}

function ensureDoc(docs: Map<DocKey, Y.Doc>, store: JsonStore, projectId: string, workspaceId: string, filePath: string) {
  const key: DocKey = `${projectId}:${workspaceId}:${filePath}`;
  const existing = docs.get(key);
  if (existing) return existing;
  const doc = new Y.Doc();
  const text = doc.getText("content");
  const workspaceDoc = store.getWorkspaceDoc(projectId, workspaceId, filePath);
  const repoFile = store.getFile(projectId, filePath);
  text.insert(0, workspaceDoc?.content ?? repoFile?.content ?? "");
  docs.set(key, doc);
  return doc;
}

function getRole(store: JsonStore, projectId: string, userId: string): ProjectRole | null {
  return store.getRole(projectId, userId);
}

function roomName(projectId: string, workspaceId: string) {
  return `project:${projectId}:workspace:${workspaceId}`;
}

function parseCookies(header: string) {
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}
