import fs from "node:fs/promises";
import path from "node:path";
import { createAiProvider } from "../packages/ai/dist/index.js";
import { evaluateRepositoryBenchmark } from "../packages/ai/dist/benchmark.js";

const live = process.argv.includes("--live");
const name = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ?? (live ? "live" : "post-change");
if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Use a simple output name.");
if (live && !((process.env.LLM_BASE_URL && process.env.LLM_MODEL) || (process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL))) throw new Error("Live evaluation requires a configured provider. This sends public benchmark fixtures, not your private repository.");
const provider = createAiProvider(live ? { llmBaseUrl: process.env.LLM_BASE_URL, llmModel: process.env.LLM_MODEL, llmApiKey: process.env.LLM_API_KEY, geminiApiKey: process.env.GEMINI_API_KEY, geminiModel: process.env.GEMINI_MODEL, maxPromptCharacters: Number(process.env.LLM_MAX_PROMPT_CHARS || 32000) } : {});
const report = await evaluateRepositoryBenchmark((request, index, retrieval) => provider.answer(request, { projectId: index.projectId, workspaceId: "main", commitSha: index.commitSha, index, retrieval, workspaceDocs: [] }), { provider: provider.name });
const directory = path.resolve("docs/evaluation/accuracy");
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(path.join(directory, `${name}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ provider: report.provider, metrics: report.metrics, failures: report.rows.filter((row) => row.failure).map(({ id, failure }) => ({ id, failure })), output: `docs/evaluation/accuracy/${name}.json` }, null, 2));
