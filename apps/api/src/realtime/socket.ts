import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import * as Y from "yjs";
import { z } from "zod";
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
        if (payload.workspaceId !== "main" || !store.getFile(payload.projectId, payload.path)) {
          callback({ ok: false, error: "Workspace file not found." });
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
        if (payload.workspaceId !== "main" || !store.getFile(payload.projectId, payload.path) || !Array.isArray(payload.update) || payload.update.length > 2_000_000) {
          callback({ ok: false, error: "Invalid workspace update." });
          return;
        }
        const doc = ensureDoc(docs, store, payload.projectId, payload.workspaceId, payload.path);
        const update = Uint8Array.from(payload.update);
        try { Y.applyUpdate(doc, update, socket.id); } catch { callback({ ok: false, error: "Invalid document update." }); return; }
        const text = doc.getText("content").toString();
        await store.upsertWorkspaceDoc(payload.projectId, payload.workspaceId, payload.path, text);
        socket
          .to(roomName(payload.projectId, payload.workspaceId))
          .emit("doc:update", { path: payload.path, update: payload.update, userId: socket.data.user.id });
        callback({ ok: true });
      }
    );

    socket.on("doc:replace", async (payload: unknown, callback: (response: unknown) => void) => {
      const parsed = z.object({ projectId: z.string(), workspaceId: z.literal("main"), path: z.string(), expectedContent: z.string().max(500_000), content: z.string().max(500_000) }).strict().safeParse(payload);
      if (!parsed.success) { callback({ ok: false, error: "Invalid draft recovery request." }); return; }
      const input = parsed.data;
      const role = getRole(store, input.projectId, socket.data.user.id);
      if (!role || !hasPermission(role, "workspace.edit")) { callback({ ok: false, error: "Editing is not permitted for this role." }); return; }
      if (!store.getFile(input.projectId, input.path)) { callback({ ok: false, error: "Workspace file not found." }); return; }
      const doc = ensureDoc(docs, store, input.projectId, input.workspaceId, input.path);
      const text = doc.getText("content");
      if (text.toString() !== input.expectedContent) { callback({ ok: false, error: "The server file changed. Compare the latest version before restoring." }); return; }
      doc.transact(() => { text.delete(0, text.length); text.insert(0, input.content); }, "draft-recovery");
      await store.upsertWorkspaceDoc(input.projectId, input.workspaceId, input.path, input.content);
      const update = Array.from(Y.encodeStateAsUpdate(doc));
      io.to(roomName(input.projectId, input.workspaceId)).emit("doc:restored", { path: input.path, update });
      callback({ ok: true, update });
    });

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
        if (payload.workspaceId !== "main" || typeof payload.body !== "string" || payload.body.trim().length === 0 || payload.body.length > 4000) {
          callback({ ok: false, error: "Chat messages must contain 1 to 4000 characters." }); return;
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
        const parsed = z.object({ projectId: z.string(), workspaceId: z.literal("main"), filePath: z.string(), symbolId: z.string().optional(), range: z.object({ startLine: z.number().int().positive(), endLine: z.number().int().positive(), startColumn: z.number().int().positive(), endColumn: z.number().int().positive() }), body: z.string().trim().min(2).max(1000), sourceRevision: z.string().max(200), kind: z.enum(["comment", "question", "decision"]).optional() }).strict().safeParse(payload);
        if (!parsed.success) { callback({ ok: false, error: "Invalid annotation." }); return; }
        const input = parsed.data;
        const role = getRole(store, input.projectId, socket.data.user.id);
        if (!role || !hasPermission(role, "project.read")) { callback({ ok: false, error: "Not authorized to annotate this project." }); return; }
        const file = store.getWorkspaceDoc(input.projectId, "main", input.filePath) ?? store.getFile(input.projectId, input.filePath);
        const knownSymbol = !input.symbolId || store.getIndex(input.projectId).graph.nodes.some((node) => node.filePath === input.filePath && node.symbolId === input.symbolId);
        if (!file || !knownSymbol || input.range.endLine < input.range.startLine || input.range.endLine > file.content.split("\n").length) {
          callback({ ok: false, error: "Annotation source range or symbol does not exist." });
          return;
        }
        const annotation = await store.createAnnotation({
          projectId: payload.projectId,
          filePath: payload.filePath,
          symbolId: payload.symbolId,
          range: payload.range,
          body: input.body,
          kind: input.kind,
          authorId: socket.data.user.id,
          sourceRevision: payload.sourceRevision
        });
        io.to(roomName(payload.projectId, payload.workspaceId)).emit("annotation:created", annotation);
        callback({ ok: true, annotation });
      }
    );

    socket.on("annotation:resolve", async (payload: unknown, callback: (response: unknown) => void) => {
      const parsed = z.object({ projectId: z.string(), workspaceId: z.literal("main"), annotationId: z.string(), resolved: z.boolean() }).strict().safeParse(payload);
      if (!parsed.success) { callback({ ok: false, error: "Invalid annotation action." }); return; }
      const input = parsed.data, role = getRole(store, input.projectId, socket.data.user.id);
      if (!role || !hasPermission(role, "project.read")) { callback({ ok: false, error: "Not authorized." }); return; }
      const annotation = await store.resolveAnnotation(input.projectId, input.annotationId, socket.data.user.id, input.resolved, role === "owner" || role === "maintainer");
      if (!annotation) { callback({ ok: false, error: "Only the author or a maintainer can resolve this annotation." }); return; }
      io.to(roomName(input.projectId, input.workspaceId)).emit("annotation:created", annotation);
      callback({ ok: true });
    });

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
  if (existing) {
    const saved = store.getWorkspaceDoc(projectId, workspaceId, filePath)?.content ?? store.getFile(projectId, filePath)?.content ?? "";
    const text = existing.getText("content");
    if (text.toString() !== saved) existing.transact(() => { text.delete(0, text.length); text.insert(0, saved); }, "external-patch");
    return existing;
  }
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
