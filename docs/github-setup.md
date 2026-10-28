# GitHub Integration

Codaventra has separate public import, webhook/check, and guarded draft-publication paths. Enabling one does not automatically enable the others.

## Public Repository Import

Project Settings accepts a public `https://github.com/owner/repository` URL and an optional branch. The API discovers a default branch when needed, downloads the archive, applies import safety/resource limits, and indexes eligible text files.

This path does not require a GitHub App. It does not make private repositories public or guarantee that every repository file is indexable. The current project import endpoint is for public archive import; private access uses the configured installation/integration paths.

## GitHub App for Sync and Checks

Configure an installed GitHub App for signed push and pull-request events:

- Repository permissions: **Metadata: read**, **Contents: read**, **Pull requests: read**, and **Checks: read and write**.
- Events: **Push** and **Pull request**.
- Webhook URL: `https://your-app.example/api/integrations/github/webhook`.
- Environment: `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, and `GITHUB_PRIVATE_KEY_BASE64`.

Store actual values only in server-side environment/secret settings. Install the App on the repositories you authorize and connect them to the relevant project.

The server verifies `x-hub-signature-256`. Configured push processing refreshes changed eligible files and queues graph consistency work. Pull-request handling supports opened, reopened, synchronized, and ready-for-review actions and can produce graph-aware Check annotations.

## Optional Review-to-PR

This separate Engineering Systems path can publish a reviewed proposal to a dedicated branch and **draft pull request**. It is disabled by default.

Requirements:

1. Grant the authorized GitHub App **Contents: read and write** and **Pull requests: read and write**, keeping the other required integration permissions.
2. Set `GITHUB_PUBLISH_ENABLED=true`.
3. Set `GITHUB_PUBLISH_REPOSITORIES=owner/repository:installation_id` for the exact allowed repository/installation pairs. There is no default allowlist.
4. Use a creator-owned, fresh, unapplied Engineering Studio proposal captured from indexed commit source.
5. Obtain matching passing worker verification including the test stage.
6. Explicitly approve the exact proposal and then confirm publication with a role that has `github.publish` permission.

The action rechecks source, patch digest, upstream branch/base, original content, and permissions. It rejects workflow-file edits, symlinks, and submodules. Retries reuse the publication identity and do not force-push. An upstream change requires capture, verification, and approval again.

Publication creates a draft only. It does not merge, bypass protected branches, or imply that upstream CI passed. The older Contributions create-PR endpoint is not this verified publication workflow.

See [Engineering Systems](engineering-systems.md#draft-pull-requests) for worker and publication details.

## Verify Configuration

Inspect `/api/integrations/github/status` and the project's integration view. Use a permitted test repository to validate signed delivery and observed Check/publication behavior. Mocked tests validate request/authorization logic, not a real installation or live PR.

Never paste access tokens, private keys, or webhook secrets into issues, screenshots, prompts, or committed files.
