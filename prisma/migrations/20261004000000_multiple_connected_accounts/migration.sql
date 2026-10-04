-- Migration: 20261004000000_multiple_connected_accounts
-- Support multiple connected Google/external accounts per user, prepared for Microsoft 365

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountProvider') THEN
    CREATE TYPE "AccountProvider" AS ENUM ('GOOGLE', 'MICROSOFT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConnectedAccountType') THEN
    CREATE TYPE "ConnectedAccountType" AS ENUM ('PERSONAL', 'WORK', 'OTHER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConnectionStatus') THEN
    CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'EXPIRED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ConnectedAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AccountProvider" NOT NULL DEFAULT 'GOOGLE',
  "externalUserId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "label" TEXT,
  "accountType" "ConnectedAccountType" NOT NULL DEFAULT 'PERSONAL',
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP(3),
  "status" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "scopes" TEXT,
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedAccount_userId_provider_email_key"
  ON "ConnectedAccount"("userId", "provider", "email");

CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_provider_idx"
  ON "ConnectedAccount"("userId", "provider");

CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_status_idx"
  ON "ConnectedAccount"("userId", "status");

-- Add foreign key from ConnectedAccount to User
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ConnectedAccount_userId_fkey'
      AND conrelid = 'public."ConnectedAccount"'::regclass
  ) THEN
    ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add connectedAccountId to CalendarEvent
ALTER TABLE "CalendarEvent"
  ADD COLUMN IF NOT EXISTS "connectedAccountId" TEXT;

CREATE INDEX IF NOT EXISTS "CalendarEvent_connectedAccountId_idx"
  ON "CalendarEvent"("connectedAccountId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CalendarEvent_connectedAccountId_fkey'
      AND conrelid = 'public."CalendarEvent"'::regclass
  ) THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_connectedAccountId_fkey"
      FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add connectedAccountId to Email
ALTER TABLE "Email"
  ADD COLUMN IF NOT EXISTS "connectedAccountId" TEXT;

CREATE INDEX IF NOT EXISTS "Email_connectedAccountId_idx"
  ON "Email"("connectedAccountId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Email_connectedAccountId_fkey'
      AND conrelid = 'public."Email"'::regclass
  ) THEN
    ALTER TABLE "Email" ADD CONSTRAINT "Email_connectedAccountId_fkey"
      FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add connectedAccountId to Bill
ALTER TABLE "Bill"
  ADD COLUMN IF NOT EXISTS "connectedAccountId" TEXT;

CREATE INDEX IF NOT EXISTS "Bill_connectedAccountId_idx"
  ON "Bill"("connectedAccountId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Bill_connectedAccountId_fkey'
      AND conrelid = 'public."Bill"'::regclass
  ) THEN
    ALTER TABLE "Bill" ADD CONSTRAINT "Bill_connectedAccountId_fkey"
      FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill existing Integration data into ConnectedAccount if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM to_regclass('public."Integration"')) THEN
    INSERT INTO "ConnectedAccount" (
      "id", "userId", "provider", "externalUserId", "email", "name", "label",
      "accountType", "accessToken", "refreshToken", "expiresAt", "status", "createdAt", "updatedAt"
    )
    SELECT
      'legacy_' || i."id",
      i."userId",
      'GOOGLE'::"AccountProvider",
      i."externalUserId",
      u."email",
      u."name",
      'Google — Pessoal',
      'PERSONAL'::"ConnectedAccountType",
      i."accessToken",
      i."refreshToken",
      i."expiresAt",
      CASE WHEN i."status" = 'CONNECTED' THEN 'CONNECTED'::"ConnectionStatus" ELSE 'DISCONNECTED'::"ConnectionStatus" END,
      i."createdAt",
      i."updatedAt"
    FROM "Integration" i
    JOIN "User" u ON u."id" = i."userId"
    WHERE i."accessToken" IS NOT NULL
    ON CONFLICT ("userId", "provider", "email") DO NOTHING;
  END IF;
END $$;
