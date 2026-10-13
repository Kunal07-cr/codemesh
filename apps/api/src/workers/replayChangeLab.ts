import fs from "node:fs/promises";
import { labBundleSchema, labCanonical, type JsonValue } from "@codemesh/shared";
import { loadConfig } from "../config.js";
import { ChangeLabClient } from "../services/changeLabClient.js";
import { labHash } from "../services/changeLabEngine.js";

const filename = process.argv[2];
if (!filename) throw new Error("Usage: npm run lab:replay -- <source-including-receipt.json>");
const text = await fs.readFile(filename, "utf8");
if (text.length > 3_000_000) throw new Error("Receipt too large");
const receipt = JSON.parse(text) as { sha256: string; payload: { schemaVersion: number; snapshot?: unknown; run?: { bundleHash?: string; mode?: string; result?: { environment?: { image?: string } } } } };
if (receipt.payload?.schemaVersion !== 1 || labHash(labCanonical(receipt.payload as unknown as JsonValue)) !== receipt.sha256) throw new Error("Receipt integrity check failed");
if (receipt.payload.run?.mode !== "repository") throw new Error("Built-in examples are replayed using the Change Lab sample action");
const bundle = labBundleSchema.parse(receipt.payload.snapshot);
if (labHash(labCanonical(bundle as unknown as JsonValue)) !== receipt.payload.run.bundleHash) throw new Error("Source snapshot hash mismatch");
const client = new ChangeLabClient(loadConfig());
const health = await client.health();
if (!health.ready || !("image" in health) || health.image !== receipt.payload.run.result?.environment?.image) throw new Error("Worker image differs from the recorded environment or is unavailable");
let job = await client.submit(bundle);
console.log(`Replay job ${job.id}. The current worker must use the image recorded in the receipt for an equivalent environment.`);
const started = Date.now();
while (["queued", "running"].includes(job.status)) {
  if (Date.now() - started > 300_000) { await client.cancel(job.id).catch(() => undefined); throw new Error("Replay deadline exceeded"); }
  await new Promise((resolve) => setTimeout(resolve, 2000)); job = await client.get(job.id);
}
console.log(JSON.stringify(job, null, 2));
if (job.status !== "completed") process.exitCode = 1;
