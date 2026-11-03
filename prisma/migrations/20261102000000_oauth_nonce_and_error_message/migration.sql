-- AlterTable
ALTER TABLE "ConnectedAccount" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "OAuthNonce" (
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthNonce_expiresAt_idx" ON "OAuthNonce"("expiresAt");
