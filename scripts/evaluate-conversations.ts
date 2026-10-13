import { evaluateConversations } from "../packages/ai/src/conversations.js";
const report = evaluateConversations();
process.stdout.write(JSON.stringify(report, null, 2));
if (report.metrics.passed !== report.metrics.cases) process.exitCode = 1;
