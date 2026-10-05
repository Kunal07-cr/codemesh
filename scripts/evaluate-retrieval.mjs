import fs from "node:fs/promises";
import path from "node:path";
import {
  buildSampleRepoFiles,
  indexRepository,
  SAMPLE_COMMIT,
  searchRepository
} from "../packages/code-intelligence/dist/index.js";

const questions = [
  {
    id: "q-auth-route",
    question: "How does authentication protect task routes?",
    expectedFiles: ["src/server.ts", "src/auth/session.ts"]
  },
  {
    id: "q-login-failure",
    question: "Where are invalid login credentials handled?",
    expectedFiles: ["src/auth/routes.ts", "src/auth/users.ts"]
  },
  {
    id: "q-task-create",
    question: "Which function validates task titles before creation?",
    expectedFiles: ["src/tasks.ts"]
  }
];

const modes = ["vector", "hybrid", "graph"];
const projectId = "evaluation-sample";
const index = indexRepository(projectId, SAMPLE_COMMIT, buildSampleRepoFiles(projectId));
const rows = [];

for (const mode of modes) {
  for (const item of questions) {
    const startedAt = performance.now();
    const result = searchRepository(index, item.question, mode, 5);
    const retrievedFiles = [...new Set(result.hits.map((hit) => hit.chunk.filePath))];
    const relevant = item.expectedFiles.filter((file) => retrievedFiles.includes(file)).length;
    rows.push({
      id: item.id,
      mode,
      question: item.question,
      expectedFiles: item.expectedFiles,
      retrievedFiles,
      recallAt5: relevant / item.expectedFiles.length,
      latencyMs: Math.round(performance.now() - startedAt) || result.latencyMs,
      chunkIds: result.hits.map((hit) => hit.chunk.id),
      expandedFromChunkIds: result.expandedFromChunkIds
    });
  }
}

const outputDir = path.resolve("docs", "evaluation");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "retrieval-results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
console.log(`Wrote ${rows.length} retrieval evaluation rows to docs/evaluation/retrieval-results.json`);
