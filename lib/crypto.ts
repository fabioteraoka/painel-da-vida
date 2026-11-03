import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recomendado para AES-GCM
const PREFIX = "enc:v1:";

/**
 * Expressão regular para validação estrita do formato criptografado:
 * Formato: enc:v1:<iv_hex_24_chars>:<authTag_hex_32_chars>:<ciphertext_hex>
 */
export const ENCRYPTED_TOKEN_REGEX = /^enc:v1:([0-9a-fA-F]{24}):([0-9a-fA-F]{32}):([0-9a-fA-F]+)$/;

/**
 * Retorna a chave de 256 bits derivada estritamente de ENCRYPTION_KEY.
 *
 * REQUISITOS DE SEGURANÇA:
 * - A chave deve ser fornecida exclusivamente via ENCRYPTION_KEY (ou o alias TOKEN_ENCRYPTION_KEY).
 * - AUTH_SECRET NÃO é aceito como substituto permanente de criptografia de banco.
 * - Deve possuir entropia mínima equivalente a pelo menos 32 caracteres.
 * - Nunca utiliza chaves fixas, previsíveis ou hardcoded.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;

  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "[Crypto] ENCRYPTION_KEY ausente ou insegura. " +
      "Configure uma chave dedicada com no mínimo 32 caracteres na Vercel / .env."
    );
  }

  return crypto.createHash("sha256").update(secret.trim()).digest();
}

/**
 * Verifica se uma string corresponde exatamente ao formato válido de token criptografado.
 */
export function isEncryptedToken(value: string | null | undefined): boolean {
  if (!value) return false;
  return ENCRYPTED_TOKEN_REGEX.test(value.trim());
}

/**
 * Criptografa token sensível para persistência em repouso usando AES-256-GCM.
 *
 * COMPORTAMENTO:
 * - Se o token já for válido e cifrado (`enc:v1:...`), retorna diretamente (idempotência).
 * - Se o token iniciar por 'enc:' mas tiver estrutura inválida/corrompida, LANÇA ERRO.
 * - Em caso de qualquer falha no cipher, LANÇA ERRO imediatamente (fail-secure).
 * - NUNCA retorna o token em texto puro se a criptografia falhar.
 */
export function encryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const trimmed = token.trim();

  // Verifica se já está cifrado no formato estrito v1
  if (isEncryptedToken(trimmed)) {
    return trimmed;
  }

  // Se inicia com prefixo de cifra mas a estrutura é inválida, rejeita para evitar corrupção
  if (trimmed.startsWith("enc:")) {
    throw new Error(
      "[Crypto] Rejeitado: tentativa de armazenar token com formato 'enc:' malformado ou corrompido."
    );
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(trimmed, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[Crypto] Falha segura ao criptografar token:", msg);
    throw new Error(`[Crypto] Falha segura ao criptografar token: ${msg}`);
  }
}

/**
 * Descriptografa token para utilização nas requisições às APIs externas (Google, etc.).
 *
 * COMPORTAMENTO DE SEGURANÇA E TRATAMENTO DE CHAVE:
 * - Se o token for nulo ou vazio: retorna null.
 * - Se o token for criptografado (`enc:v1:...`): descriptografa e valida a Auth Tag (GCM).
 * - Se a ENCRYPTION_KEY tiver sido alterada ou perdida:
 *     A validação da Auth Tag falhará criptograficamente ('unable to authenticate data').
 *     A função captura o erro, registra aviso seguro SEM vazar segredos e retorna null.
 *     O chamador deve marcar a conta com status ERROR para que o usuário reconecte a conta.
 * - Tratamento de tokens legados em texto puro:
 *     Tokens não iniciados por 'enc:' são retornados apenas para viabilizar migração
 *     progressiva, emitindo aviso no log operacional para indicar saneamento pendente.
 */
export function decryptToken(encryptedToken: string | null | undefined): string | null {
  if (!encryptedToken) return null;
  const trimmed = encryptedToken.trim();

  // Tratamento de token legado em texto puro
  if (!trimmed.startsWith("enc:")) {
    console.warn(
      "[Crypto] AVISO OPERACIONAL: Token legado em texto puro em uso. " +
      "Execute 'scripts/migrate-legacy-tokens.ts' para criptografar os dados em repouso."
    );
    return trimmed;
  }

  const match = trimmed.match(ENCRYPTED_TOKEN_REGEX);
  if (!match) {
    console.error("[Crypto] Formato de token cifrado inválido ou versão de envelope não suportada.");
    return null;
  }

  const [, ivHex, authTagHex, cipherText] = match;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // Falha de integridade: Auth Tag incorreta, chave incorreta ou dados corrompidos
    console.error(
      "[Crypto] Falha de integridade/autenticação ao descriptografar token. " +
      "Possível chave incorreta (ENCRYPTION_KEY alterada) ou payload corrompido."
    );
    return null;
  }
}
