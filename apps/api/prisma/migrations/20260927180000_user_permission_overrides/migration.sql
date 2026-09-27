-- صلاحية مفتوحة أو مقفولة على حساب بعينه، فوق أساس الرول.
--
-- `role_permission_grants` بيفتح على الرول كله، والمساعدين كلهم رول واحد
-- (`owner`) — فقفل «المصروفات» هناك بيقفلها على كلهم. وده الجدول اللي بيخلّي
-- القرار لكل حساب.
CREATE TABLE "app"."user_permission_overrides" (
  "user_id"        TEXT        NOT NULL,
  "permission"     TEXT        NOT NULL,
  "allow"          BOOLEAN     NOT NULL,
  "set_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "set_by_user_id" TEXT,

  CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("user_id", "permission")
);

CREATE INDEX "user_permission_overrides_user_id_idx"
  ON "app"."user_permission_overrides" ("user_id");

-- `Cascade` على صاحب الصف: حساب اتمسح مايسيبش وراه قرارات صلاحيات.
ALTER TABLE "app"."user_permission_overrides"
  ADD CONSTRAINT "user_permission_overrides_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `SetNull` على اللي عمل القرار — نفس قاعدة `role_permission_grants`: مسح
-- الأدمن اللي قفل حاجة مالازمش يفتحها تاني في صمت.
ALTER TABLE "app"."user_permission_overrides"
  ADD CONSTRAINT "user_permission_overrides_set_by_user_id_fkey"
  FOREIGN KEY ("set_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
