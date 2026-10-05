# WebSocket Events

Socket.IO connects to the API origin with authentication cookies.

## Client to Server

- `workspace:join { projectId, workspaceId }`
- `doc:open { projectId, workspaceId, path }`
- `doc:update { projectId, workspaceId, path, update }`
- `presence:update { projectId, workspaceId, path, cursor }`
- `workspace:chat:send { projectId, workspaceId, body }`

## Server to Client

- `presence:joined { user, role }`
- `presence:update { user, path, cursor }`
- `doc:update { path, update, userId }`
- `workspace:chat:message { id, projectId, workspaceId, body, authorId, createdAt }`

Yjs updates are the authority for code content. Socket.IO is the transport; it does not carry a separate competing text-sync protocol.
