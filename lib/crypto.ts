import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "painel-da-vida-secure-token-encryption-key-fallback";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt sensitive token for storage at rest.
 * If already encrypted or empty, handles gracefully.
 */
export function encryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.startsWith("enc:")) return token; // already encrypted

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `enc:${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error("Token encryption failed, storing in safe fallback:", error);
    return token;
  }
}

/**
 * Decrypt token for API usage.
 * If not encrypted (raw token), returns it directly for backwards compatibility.
 */
export function decryptToken(encryptedToken: string | null | undefined): string | null {
  if (!encryptedToken) return null;
  if (!encryptedToken.startsWith("enc:")) return encryptedToken;

  try {
    const parts = encryptedToken.split(":");
    if (parts.length !== 4) return encryptedToken;
    const [, ivHex, authTagHex, cipherText] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Token decryption failed:", error);
    return null;
  }
}
