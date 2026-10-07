const vscode = require("vscode");

let requestId = 0;

function activate(context) {
  const output = vscode.window.createOutputChannel("CodeMesh");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  status.name = "CodeMesh";
  status.text = "$(type-hierarchy) CodeMesh";
  status.tooltip = "Explain the current selection with repository evidence";
  status.command = "codemesh.explainSelection";
  status.show();

  context.subscriptions.push(
    output,
    status,
    vscode.commands.registerCommand("codemesh.openGraph", () => openGraph()),
    vscode.commands.registerCommand("codemesh.explainSelection", () => explainSelection(output)),
    vscode.commands.registerCommand("codemesh.showImpact", () => showImpact(output))
  );
}

async function openGraph() {
  const config = configuration();
  if (!config) return;
  const base = config.endpoint.replace(/\/api\/mcp\/?$/, "");
  await vscode.env.openExternal(vscode.Uri.parse(base + "/projects/" + encodeURIComponent(config.projectId) + "/universe"));
}

async function explainSelection(output) {
  const config = configuration();
  if (!config) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage("Open a source file before running CodeMesh.");
    return;
  }
  const selection = editor.document.getText(editor.selection).trim();
  const filePath = workspacePath(editor.document.uri);
  const line = editor.selection.active.line + 1;
  const query = selection
    ? "Explain this code and find its repository relationships: " + selection.slice(0, 1200)
    : "Explain " + filePath + " near line " + line + " and find related symbols.";
  await withProgress("Searching CodeMesh repository evidence", async () => {
    const value = await callTool(config, "repository_search", { query, mode: "graph", limit: 8 });
    showResult(output, "Explain Selection", { source: filePath + ":" + line, ...value });
  });
}

async function showImpact(output) {
  const config = configuration();
  if (!config) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage("Open a source file before running CodeMesh impact analysis.");
    return;
  }
  const filePath = workspacePath(editor.document.uri);
  await withProgress("Tracing graph impact for " + filePath, async () => {
    const value = await callTool(config, "impact_analysis", { filePath });
    showResult(output, "File Impact", value);
  });
}

function configuration() {
  const settings = vscode.workspace.getConfiguration("codemesh");
  const endpoint = String(settings.get("endpoint") || "").trim().replace(/\/$/, "");
  const token = String(settings.get("token") || "").trim();
  const projectId = String(settings.get("projectId") || "").trim();
  if (!endpoint || !token || !projectId) {
    void vscode.window.showErrorMessage("Configure codemesh.endpoint, codemesh.token, and codemesh.projectId first.", "Open Settings").then((choice) => {
      if (choice === "Open Settings") void vscode.commands.executeCommand("workbench.action.openSettings", "codemesh");
    });
    return null;
  }
  return { endpoint, token, projectId };
}

async function callTool(config, name, args) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      authorization: "Bearer " + config.token,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++requestId,
      method: "tools/call",
      params: { name, arguments: args }
    })
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || "CodeMesh request failed with status " + response.status + ".");
  }
  return payload.result?.structuredContent || payload.result;
}

async function withProgress(title, task) {
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task);
  } catch (error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : "CodeMesh request failed.");
  }
}

function showResult(output, title, value) {
  output.clear();
  output.appendLine("CodeMesh - " + title);
  output.appendLine("=".repeat(64));
  output.appendLine(JSON.stringify(value, null, 2));
  output.show(true);
}

function workspacePath(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return uri.fsPath.replace(/\\/g, "/");
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}

function deactivate() {}

module.exports = { activate, deactivate };

