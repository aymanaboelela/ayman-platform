# Platform MCP server

Lets Claude work on a stack's admin API with a scoped agent key instead of a
logged-in browser tab. One file, no dependencies.

1. On the stack, open **ربط Claude** (`/admin/agent-tokens`), tick the
   permissions, make a key. It is shown once.
2. Store it in the Keychain (it prompts for the key, so it never lands in shell
   history):

   ```sh
   security add-generic-password -U -s platform-mcp -a <stack-host> -w
   ```

3. Register the server with Claude Code:

   ```sh
   claude mcp add --scope user platform -- node /abs/path/server.mjs --url https://<stack-host>
   ```

One Mac can hold a key per stack (the Keychain account is the host); register
one server per stack under different names.

The API enforces the key's permissions (`AuthGuard` → `AgentTokenResolver`);
this file does not. Writes are spaced 1.1 s apart and 429s are retried. Every
write made with a key, and every refused request, is an `agent-token:use` row
in the audit log.
