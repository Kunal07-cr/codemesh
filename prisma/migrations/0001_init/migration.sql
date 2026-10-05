CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "ProjectRole" AS ENUM ('owner', 'maintainer', 'contributor', 'viewer');
CREATE TYPE "ProjectVisibility" AS ENUM ('public', 'private');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "githubUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Project" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "visibility" "ProjectVisibility" NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "repositorySource" TEXT NOT NULL,
  "repoUrl" TEXT,
  "commitSha" TEXT NOT NULL,
  "guidelines" TEXT NOT NULL,
  "languages" TEXT[] NOT NULL DEFAULT '{}',
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CodeChunk" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "commitSha" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "symbolId" TEXT,
  "symbolName" TEXT,
  "content" TEXT NOT NULL,
  "startLine" INTEGER NOT NULL,
  "startColumn" INTEGER NOT NULL,
  "endLine" INTEGER NOT NULL,
  "endColumn" INTEGER NOT NULL,
  "tokenCount" INTEGER NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "embeddingDimensions" INTEGER NOT NULL,
  "embedding" vector,
  "sourceRevision" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CodeChunk_project_commit_idx" ON "CodeChunk"("projectId", "commitSha");
CREATE INDEX "CodeChunk_embedding_hnsw_idx" ON "CodeChunk" USING hnsw ("embedding" vector_cosine_ops);

-- The remaining tables are represented in schema.prisma and can be created by Prisma
-- migrations. This explicit SQL file documents the pgvector setup that Prisma cannot
-- express portably across all environments.
