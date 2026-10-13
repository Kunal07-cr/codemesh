import { readFile } from "node:fs/promises";
import { benchmarkImportSchema } from "../packages/shared/src/engineering.js";
import { evaluateCorpusRetrieval, exampleBenchmark, importBenchmark } from "../apps/api/src/services/benchmarkDatasets.js";

const input = process.argv[2];
const corpus = input ? importBenchmark(benchmarkImportSchema.parse(JSON.parse(await readFile(input, "utf8"))), "cli-benchmark", "cli") : exampleBenchmark("cli-benchmark", "cli");
const report = evaluateCorpusRetrieval(corpus);
console.log(JSON.stringify(report, null, 2));
if (report.rows.some((row) => row.status === "FAIL")) process.exitCode = 1;
