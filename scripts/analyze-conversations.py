"""Analyze exported synthetic transcript regressions with Python and SQLite."""
import argparse
import json
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("report", type=Path)
parser.add_argument("--database", type=Path)
args = parser.parse_args()
data = json.loads(args.report.read_text(encoding="utf-8-sig"))
if data.get("version") != "authored-conversations-v1" or len(data.get("rows", [])) > 200:
    raise ValueError("Expected a bounded Codaventra conversation evaluation export")
db = sqlite3.connect(str(args.database) if args.database else ":memory:")
db.execute("CREATE TABLE IF NOT EXISTS conversation_eval (id TEXT PRIMARY KEY, condition TEXT, prompt_mode TEXT, language TEXT, passed INTEGER, expected_state INTEGER, tool_selection INTEGER, concise INTEGER, guard_compliance INTEGER, latency_ms REAL, provider TEXT)")
with db:
    for row in data["rows"]:
        db.execute("INSERT OR REPLACE INTO conversation_eval VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                   (row["id"], row["condition"], row["promptMode"], row["language"], int(row["passed"]), int(row["completion"]), int(row["toolSelection"]), int(row["concise"]), int(row["guardCompliance"]), row["latencyMs"], row["provider"]))
queries = {
    "by_prompt_mode": "SELECT prompt_mode, COUNT(*) AS cases, ROUND(AVG(passed), 3) AS pass_rate, ROUND(AVG(latency_ms), 2) AS mean_latency_ms FROM conversation_eval GROUP BY prompt_mode ORDER BY prompt_mode",
    "by_condition": "SELECT condition, COUNT(*) AS cases, SUM(1 - passed) AS failures, ROUND(AVG(guard_compliance), 3) AS guard_compliance FROM conversation_eval GROUP BY condition ORDER BY condition",
    "by_language": "SELECT language, COUNT(*) AS cases, ROUND(AVG(expected_state), 3) AS expected_state_rate, ROUND(AVG(tool_selection), 3) AS tool_selection_rate FROM conversation_eval GROUP BY language ORDER BY language",
}
result = {"scope": data["scope"]}
for name, query in queries.items():
    cursor = db.execute(query)
    result[name] = [dict(zip([item[0] for item in cursor.description], row)) for row in cursor.fetchall()]
print(json.dumps(result, indent=2))
db.close()
