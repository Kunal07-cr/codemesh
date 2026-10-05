# Major-Project Demonstration Script

1. Start the app with `npm.cmd run dev`.
2. Open `http://localhost:4200`.
3. Sign in as `owner@codemesh.dev` with `CodeMesh123!`.
4. Open Discovery, then TaskPilot Sample.
5. Open the workspace and show the file explorer, Monaco editor, and graph tab.
6. Click graph nodes to navigate back to files.
7. Ask: "How does authentication protect task routes?" using graph retrieval. Show citations and retrieval metadata.
8. Switch mode to "Propose changes" and ask for an auth error-code patch.
9. Review the proposed patch, then apply it. Explain that stale patch checks compare base hashes and current workspace content.
10. Open Contributions and show the ready contribution plus GitHub not-configured state.
11. Sign in in another browser as `contributor@codemesh.dev`, open the same workspace, and show live Yjs edit propagation and chat.
12. Sign in as `viewer@codemesh.dev` and show that project reading works but editing/discussion posting is denied by the server.

When GitHub is configured in a future milestone, step 10 becomes PR creation after explicit maintainer action.
