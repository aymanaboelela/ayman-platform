-- ═══════════════════════════════════════════════════════════════════════════
-- «ربط Claude» — scoped, revocable keys for an AI assistant to call the admin
-- API with. See `AgentToken` in schema.prisma.
--
-- Only the SHA-256 of a key is stored (`token_hash`, unique: it is the lookup
-- key on every request made with one). Rows are revoked, never deleted, so the
-- audit log's `agent-token:use` entries keep pointing at something.
--
-- No GRANT: `ALTER DEFAULT PRIVILEGES` in the entrypoint covers new tables.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."agent_tokens" (
  "id"           UUID NOT NULL,
  "user_id"      TEXT NOT NULL,
  "name"         VARCHAR(60) NOT NULL,
  "token_hash"   CHAR(64) NOT NULL,
  "hint"         VARCHAR(16) NOT NULL,
  "permissions"  TEXT[] NOT NULL,
  "expires_at"   TIMESTAMP(3) NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  "last_used_ip" VARCHAR(64),
  "revoked_at"   TIMESTAMP(3),
  CONSTRAINT "agent_tokens_pkey" PRIMARY KEY ("id"),
  -- A key with no permissions is a key nobody can explain. The API refuses
  -- one; the schema holds it too.
  CONSTRAINT "agent_tokens_permissions_nonempty" CHECK (cardinality("permissions") > 0)
);

CREATE UNIQUE INDEX "agent_tokens_token_hash_key" ON "app"."agent_tokens"("token_hash");
CREATE INDEX "agent_tokens_user_id_created_at_idx" ON "app"."agent_tokens"("user_id", "created_at" DESC);

ALTER TABLE "app"."agent_tokens"
  ADD CONSTRAINT "agent_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
