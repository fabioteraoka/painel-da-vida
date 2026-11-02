import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PREFIX = "enc:v1:";

/**
 * Returns encryption key derived from environment secret.
 * Throws a secure error if no valid secret is configured.
 * Never uses hardcoded or predictable fallbacks.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_KEY ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;

  if (!secret || secret.trim().length < 16) {
    throw new Error(
      "[Crypto] Chave de criptografia não configurada ou insuficiente. " +
      "Defina ENCRYPTION_KEY ou AUTH_SECRET com alta entropia."
    );
  }

  return crypto.createHash("sha256").update(secret.trim()).digest();
}

/**
 * Encrypt sensitive token for storage at rest using AES-256-GCM.
 * Never returns plaintext on error — throws to ensure fail-secure behavior.
 */
export function encryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.startsWith(PREFIX) || token.startsWith("enc:")) return token; // already encrypted

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Crypto] Falha segura na criptografia do token:", msg);
    throw new Error(`Falha segura ao criptografar token: ${msg}`);
  }
}

/**
 * Decrypt token for API usage.
 * If not encrypted (raw token), returns it directly for backwards compatibility during migration.
 */
export function decryptToken(encryptedToken: string | null | undefined): string | null {
  if (!encryptedToken) return null;
  if (!encryptedToken.startsWith("enc:")) return encryptedToken;

  try {
    const parts = encryptedToken.split(":");
    // Supports enc:v1:iv:tag:cipher (4 parts after split) or legacy enc:iv:tag:cipher (3 parts)
    let ivHex: string;
    let authTagHex: string;
    let cipherText: string;

    if (parts.length === 5 && parts[1] === "v1") {
      [, , ivHex, authTagHex, cipherText] = parts;
    } else if (parts.length === 4) {
      [, ivHex, authTagHex, cipherText] = parts;
    } else {
      console.warn("[Crypto] Formato de token cifrado inválido.");
      return null;
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("[Crypto] Falha ao decriptografar token.");
    return null;
  }
}

