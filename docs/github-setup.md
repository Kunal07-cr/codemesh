# GitHub App Setup

The current application exposes the authorization boundary and UI state for GitHub contributions, but the installation-token write flow is not completed.

Planned setup:

1. Create a GitHub App.
2. Grant narrowly scoped repository permissions: contents read/write, pull requests read/write, metadata read, webhooks.
3. Configure webhook URL: `/api/integrations/github/webhook`.
4. Store the webhook secret and private key through environment variables.
5. On repository import, pin the source to a commit SHA.
6. Before PR creation, snapshot the workspace draft, check upstream commit drift, create a branch, commit the reviewed patch, and open a pull request.

Environment placeholders are in `.env.example`.
