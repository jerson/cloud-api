DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "email" IS NULL OR btrim("email") = ''
  ) THEN
    RAISE EXCEPTION 'Cannot migrate users without email';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(btrim("email")) AS normalized_email
      FROM "User"
      GROUP BY lower(btrim("email"))
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Cannot migrate duplicate user emails';
  END IF;
END $$;

CREATE TABLE "UserIdentity" (
  "id" BIGSERIAL NOT NULL,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "userId" BIGINT NOT NULL,

  CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UserIdentity" ("provider", "providerUserId", "userId")
SELECT 'google', "googleId", "id"
FROM "User";

UPDATE "User"
SET "email" = lower(btrim("email"));

ALTER TABLE "User"
  ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "UserIdentity_provider_providerUserId_key" ON "UserIdentity"("provider", "providerUserId");

ALTER TABLE "UserIdentity"
  ADD CONSTRAINT "UserIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "User_googleId_key";
ALTER TABLE "User" DROP COLUMN "googleId";
