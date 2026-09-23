-- Bring the Vercel-managed Neon database to the schema expected by Prisma.
-- Existing application tables and rows are preserved; all additions are additive.

ALTER TYPE "EmailCategory" ADD VALUE IF NOT EXISTS 'NOISE';

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "emailId" TEXT;

CREATE TABLE IF NOT EXISTS "MonitoredProduct" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "targetPrice" DOUBLE PRECISION NOT NULL,
  "currentPrice" DOUBLE PRECISION,
  "lowestPrice" DOUBLE PRECISION,
  "highestPrice" DOUBLE PRECISION,
  "averagePrice" DOUBLE PRECISION,
  "source" TEXT DEFAULT 'Amazon',
  "notifyTarget" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastChecked" TIMESTAMP(3),
  "lastAttemptedAt" TIMESTAMP(3),
  "lastCheckError" TEXT,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonitoredProduct_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MonitoredProduct"
  ADD COLUMN IF NOT EXISTS "lastAttemptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCheckError" TEXT;

CREATE TABLE IF NOT EXISTS "PriceHistory" (
  "id" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "source" TEXT,
  "monitoredProductId" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PriceHistory"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE TABLE IF NOT EXISTS "PriceAlert" (
  "id" TEXT NOT NULL,
  "monitoredProductId" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "targetPrice" DOUBLE PRECISION NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Task_emailId_key"
  ON "Task"("emailId");
CREATE UNIQUE INDEX IF NOT EXISTS "Email_userId_externalId_key"
  ON "Email"("userId", "externalId");
CREATE INDEX IF NOT EXISTS "PriceAlert_monitoredProductId_isRead_idx"
  ON "PriceAlert"("monitoredProductId", "isRead");
CREATE INDEX IF NOT EXISTS "PriceAlert_createdAt_idx"
  ON "PriceAlert"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Task_emailId_fkey'
      AND conrelid = 'public."Task"'::regclass
  ) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_emailId_fkey"
      FOREIGN KEY ("emailId") REFERENCES "Email"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MonitoredProduct_userId_fkey'
      AND conrelid = 'public."MonitoredProduct"'::regclass
  ) THEN
    ALTER TABLE "MonitoredProduct" ADD CONSTRAINT "MonitoredProduct_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PriceHistory_monitoredProductId_fkey'
      AND conrelid = 'public."PriceHistory"'::regclass
  ) THEN
    ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_monitoredProductId_fkey"
      FOREIGN KEY ("monitoredProductId") REFERENCES "MonitoredProduct"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PriceAlert_monitoredProductId_fkey'
      AND conrelid = 'public."PriceAlert"'::regclass
  ) THEN
    ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_monitoredProductId_fkey"
      FOREIGN KEY ("monitoredProductId") REFERENCES "MonitoredProduct"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
