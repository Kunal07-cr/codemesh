# Connected workspace tools

The original landing design, graph view, workflow routes and Proof Lab are preserved.

## Editor

- The file rail is a folder tree with filtering. Breadcrumbs filter a folder.
- Up to 12 pinned tabs are stored per user and project; deleted/import-replaced paths are ignored.
- Explicit cursor moves select the narrowest containing indexed symbol. Graph/citation selections reveal source ranges. The graph remains a static index, not a live runtime trace.
- Inline Copilot submits an explicit instruction to the existing repository-grounded provider. It does not send keystrokes or manufacture autocomplete. A response without a patch is displayed honestly.
- Suggested files can be inspected in a read-only Monaco diff. Accept/reject requires workspace review permission. Apply verifies every base before writing, rejects previously reviewed patches, and records a contribution. Tests are suggested, not automatically executed.

## Conversation branches

The owner-only fork endpoint copies a snapshot through a selected answer. Subsequent turns are independent. Forks are bounded to 200 messages / one million serialized characters and rate limited. Comparison shows the latest answers and proposed file contents from two owned conversations. Missing file changes are compared against the recorded base. Different bases are flagged. No comparison applies a patch. The diff editor is lazy-loaded so opening the home page does not download Monaco.

## Graph notes

Comments, questions and decisions are attached to exact file/symbol ranges. Open-note counts appear on the original graph. Authors and maintainers can resolve/reopen/remove notes. Creation validates file membership, symbol membership and line bounds. SHA-256 content fingerprints flag changed source. Older notes have conservative revision-based staleness. File-level notes never bleed into unrelated files.

## Issue-to-change workspace

Task cards and the editor task icon open a connected work record. It stores relevant files, proposed patches, context notes and manual verification results. Patch diffs show actual persisted proposal content/status. These checks are explicitly manual records, not a sandbox or CI execution claim. Save requires task.manage, project-scoped references and an expected version. Conflicting updates require reloading the latest record.

## Draft recovery

Unsent questions and team messages are kept locally until a successful response/acknowledgment. Sending never erases a newer composer draft. Code updates show opening/saving/saved/reconnecting/error feedback. Disconnected sockets do not buffer full-file overwrites for automatic replay.

Code drafts include the server base and repository revision, scoped by user/project/workspace/path. A page-local backup remains when device storage fails. On reconnect, the server version is reopened and drafts are compared. Recovery requires an explicit diff and editing permission; doc:replace checks exact current server content before replacing. Concurrent changes reject recovery rather than silently overwrite. A successful acknowledgment or explicit discard clears the draft.

Device drafts expire after seven days. The cache is bounded to 20 entries and approximately two million serialized characters. Code backup can be disabled in layout settings. Logout clears the current user's drafts. This is plaintext device storage, not encrypted backup; it is not suitable for sensitive source on shared computers. Existing server persistence configuration still determines durability across hosting restarts.

New motion is short action feedback and restrained reveals. Reduced-motion preferences disable it. Mobile uses the existing panels, scrollable source tabs, a stacked diff and larger touch targets. Team chat can be collapsed so editor/assistant space remains useful.
