-- CreateTable
CREATE TABLE "session_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "ip" INET,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "logged_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "session_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_devices_session_id_key" ON "session_devices"("session_id");

-- CreateIndex
CREATE INDEX "session_devices_user_id_revoked_at_idx" ON "session_devices"("user_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "session_devices" ADD CONSTRAINT "session_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
