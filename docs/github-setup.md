# GitHub App Setup

CodeMesh accepts signed push and pull-request webhooks. With installation credentials it refreshes changed private-repository files, builds a graph-aware review, and publishes a GitHub Check with line annotations.

1. Create a GitHub App.
2. Grant repository permissions: **Checks: read and write**, **Contents: read**, **Metadata: read**, and **Pull requests: read**.
3. Subscribe to **Push** and **Pull request** events.
4. Set the webhook URL to `/api/integrations/github/webhook`.
5. Configure `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, and the base64-encoded `GITHUB_PRIVATE_KEY_BASE64`.
6. Install the App on each repository already connected to a CodeMesh project.

Push processing updates added and modified text files, removes deleted paths, and queues a graph consistency pass. Pull-request processing responds to opened, reopened, synchronized, and ready-for-review actions.

The GitHub App does not push branches or publish a pull request from a workspace draft. That write path remains intentionally separate from review checks.

