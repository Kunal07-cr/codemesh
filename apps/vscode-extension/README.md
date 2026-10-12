# Codaventra for VS Code

This local companion connects VS Code to the Codaventra MCP endpoint.

## Setup

1. Open apps/vscode-extension in VS Code and press F5 to launch an Extension Development Host.
2. In Codaventra, open a project, choose **Delivery Hub > Agents**, and create a scoped token.
3. Configure codemesh.endpoint, codemesh.token, and codemesh.projectId in VS Code settings.

## Commands

- **Codaventra: Open Repository Graph**
- **Codaventra: Explain Selection**
- **Codaventra: Show File Impact**

The token is only sent as a bearer credential to the configured Codaventra MCP endpoint. Change plans remain proposals; this extension does not write repository files.

