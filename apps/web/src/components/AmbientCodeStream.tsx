type CodeTone = "keyword" | "function" | "string" | "number" | "comment" | "property" | "operator";

type CodeToken = {
  text: string;
  tone?: CodeTone;
};

const codeColumns: CodeToken[][][] = [
  [
    [token("import", "keyword"), plain(" { graph } "), token("from", "keyword"), plain(" "), token('"@codemesh/core"', "string")],
    [token("const", "keyword"), plain(" context = "), token("await", "keyword"), plain(" graph."), token("trace", "function"), plain("(symbol)")],
    [token("const", "keyword"), plain(" spans = context."), token("sourceRanges", "property")],
    [token("return", "keyword"), plain(" spans."), token("filter", "function"), plain("(isRelevant)")],
    [token("// exact evidence, smaller context", "comment")],
    [plain("retrieval."), token("mode", "property"), plain(" = "), token('"graph"', "string")],
    [plain("retrieval."), token("limit", "property"), plain(" = "), token("6", "number")],
    [token("await", "keyword"), plain(" assistant."), token("answer", "function"), plain("({ context })")]
  ],
  [
    [token("type", "keyword"), plain(" ChangePlan = {")],
    [plain("  impact: "), token("GraphPath[]", "property"), plain(";")],
    [plain("  tests: "), token("TargetedTest[]", "property"), plain(";")],
    [plain("  confidence: "), token("number", "keyword"), plain(";")],
    [plain("}")],
    [token("const", "keyword"), plain(" plan = "), token("await", "keyword"), plain(" copilot."), token("propose", "function"), plain("(goal)")],
    [token("if", "keyword"), plain(" (plan.confidence > "), token("0.82", "number"), plain(") {")],
    [plain("  "), token("await", "keyword"), plain(" review."), token("request", "function"), plain("(plan)")],
    [plain("}")]
  ],
  [
    [token("mcp", "property"), plain("."), token("call", "function"), plain("("), token('"code_context"', "string"), plain(")")],
    [plain("source."), token("range", "function"), plain("("), token("42", "number"), plain(", "), token("68", "number"), plain(")")],
    [plain("patch."), token("verify", "function"), plain("({ sandbox: "), token("true", "keyword"), plain(" })")],
    [plain("tests."), token("run", "function"), plain("(affectedFiles)")],
    [token("// manifest b6859c09", "comment")],
    [plain("index."), token("sync", "function"), plain("({ incremental: "), token("true", "keyword"), plain(" })")],
    [plain("audit."), token("record", "function"), plain("("), token('"agent.tool_called"', "string"), plain(")")],
    [token("return", "keyword"), plain(" { status: "), token('"ready"', "string"), plain(" }")]
  ]
];

const packets = ["AST", "SOURCE", "GRAPH", "RAG", "PATCH", "TEST"];

export function AmbientCodeStream() {
  return (
    <div className="cm-code-stream" aria-hidden="true">
      {codeColumns.map((lines, columnIndex) => (
        <div className={`cm-code-column cm-code-column-${columnIndex + 1}`} key={columnIndex}>
          <div className="cm-code-column-track">
            {[...lines, ...lines].map((line, lineIndex) => (
              <div className="cm-code-line" key={`${columnIndex}-${lineIndex}`}>
                <span className="cm-code-line-number">{String((lineIndex % lines.length) + 1).padStart(2, "0")}</span>
                <code>
                  {line.map((part, tokenIndex) => (
                    <span className={part.tone ? `cm-code-token-${part.tone}` : undefined} key={tokenIndex}>
                      {part.text}
                    </span>
                  ))}
                </code>
                {lineIndex % 5 === 1 && <i className="cm-code-caret" />}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="cm-code-packet-lane">
        {packets.map((packet) => (
          <span key={packet}>{packet}</span>
        ))}
      </div>
      <div className="cm-code-readout">
        <span>source://workspace/live</span>
        <i />
        <strong>INDEX STREAM</strong>
      </div>
    </div>
  );
}

function token(text: string, tone: CodeTone): CodeToken {
  return { text, tone };
}

function plain(text: string): CodeToken {
  return { text };
}

