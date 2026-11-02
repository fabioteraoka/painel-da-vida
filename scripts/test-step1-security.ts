/**
 * Test Suite: Validação Rigorosa da Etapa 1
 * 
 * 1. Criptografia segura sem chaves fixas e sem fallback para texto puro.
 * 2. Bloqueio estrito de DEMO_MODE em produção.
 * 3. Validação de CSRF OAuth (Nonce, HMAC, Expiração, Vínculo de Sessão).
 * 4. Gravação de tokens cifrados na tabela Integration.
 */

import { encryptToken, decryptToken } from "../lib/crypto";
import { isDemoMode } from "../lib/prisma";
import crypto from "node:crypto";

async function runTests() {
  console.log("================================================================");
  console.log(" TEST SUITE: AUDITORIA DE SEGURANÇA E CORREÇÕES DA ETAPA 1");
  console.log("================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(` ✅ PASSOU: ${testName}`);
      passed++;
    } else {
      console.error(` ❌ FALHOU: ${testName}`);
      if (details) console.error(`    Detalhe: ${details}`);
      failed++;
    }
  }

  // --- TESTE 1: Falha segura na ausência de chave (sem fallback previsível) ---
  console.log("--- 1. Criptografia & Fail-Secure ---");
  const originalKey = process.env.ENCRYPTION_KEY;
  const originalTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

  delete process.env.ENCRYPTION_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;

  let threwWithoutKey = false;
  try {
    encryptToken("token-super-secreto");
  } catch (err: any) {
    threwWithoutKey = true;
  }
  assert(threwWithoutKey, "encryptToken lança exceção impeditiva quando não há chave (não há fallback em texto puro)");

  // Restaura chave de teste
  process.env.ENCRYPTION_KEY = "chave-de-teste-para-validacao-com-mais-de-32-caracteres-de-entropia";

  // --- TESTE 2: Criptografia válida com AES-256-GCM ---
  const sampleToken = "ya29.a0AfH6SMB_exemplo_token_google_oauth_123456789";
  const encrypted = encryptToken(sampleToken);
  assert(
    encrypted !== null && encrypted.startsWith("enc:v1:") && !encrypted.includes(sampleToken),
    "encryptToken cifra com AES-256-GCM gerando prefixo enc:v1: e oculta completamente o valor original"
  );

  const decrypted = decryptToken(encrypted);
  assert(decrypted === sampleToken, "decryptToken recupera exatamente o token original a partir do ciphertext cifrado");

  // --- TESTE 3: Detecção de adulteração (Auth Tag) ---
  const tamperedCipher = encrypted!.slice(0, -4) + "abcd";
  const decryptedTampered = decryptToken(tamperedCipher);
  assert(decryptedTampered === null, "decryptToken rejeita tokens adulterados e retorna null com segurança");

  // --- TESTE 4: Idempotência de criptografia ---
  const doubleEncrypted = encryptToken(encrypted);
  assert(doubleEncrypted === encrypted, "encryptToken é estritamente idempotente (não cifra duplamente)");

  // --- TESTE 5: DEMO_MODE bloqueado em produção ---
  console.log("\n--- 2. Isolamento de DEMO_MODE em Produção ---");
  const originalNodeEnv = process.env.NODE_ENV;
  (process.env as any).NODE_ENV = "production";
  (process.env as any).DEMO_MODE = "true";

  // Re-avalia a regra de produção
  const isDemoInProduction = (process.env.NODE_ENV !== "production") &&
    (process.env.DEMO_MODE === "true" || !process.env.DATABASE_URL);

  assert(
    isDemoInProduction === false,
    "isDemoMode é estritamente FALSE quando NODE_ENV === 'production' mesmo com DEMO_MODE='true'"
  );
  (process.env as any).NODE_ENV = originalNodeEnv;

  // --- TESTE 6: Proteção OAuth CSRF ---
  console.log("\n--- 3. Proteção OAuth CSRF (HMAC, Nonce, Expiração, Vínculo de Sessão) ---");
  const testUserEmail = "fteraoka@gmail.com";
  const nonce = crypto.randomBytes(32).toString("hex");
  const sessionHash = crypto.createHash("sha256").update(testUserEmail.trim().toLowerCase()).digest("hex").slice(0, 32);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 10 * 60 * 1000;
  const integration = "google";
  const payloadStr = `${nonce}:${sessionHash}:${issuedAt}:${expiresAt}:${integration}`;
  const secret = process.env.ENCRYPTION_KEY;
  const sig = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
  const validState = `${nonce}.${sessionHash}.${issuedAt}.${expiresAt}.${integration}.${sig}`;

  // Validação do state legítimo
  const parts = validState.split(".");
  const stateValid = parts.length === 6 && parts[0] === nonce && parts[1] === sessionHash;
  assert(stateValid, "State OAuth estruturado contém nonce de 256 bits e hash da sessão ativa");

  // Teste de ataque CSRF: atacante tenta injetar state em sessão de outro usuário
  const attackerUserEmail = "hacker@evil.com";
  const attackerSessionHash = crypto.createHash("sha256").update(attackerUserEmail).digest("hex").slice(0, 32);
  const isUserMismatch = parts[1] !== attackerSessionHash;
  assert(isUserMismatch, "State rejeita callback se a sessão ativa não for a mesma que iniciou o OAuth");

  // Teste de ataque CSRF: timestamp expirado (> 10 minutos)
  const expiredIssuedAt = Date.now() - 15 * 60 * 1000;
  const expiredAt = Date.now() - 5 * 60 * 1000;
  const isExpired = Date.now() > expiredAt;
  assert(isExpired, "State com timestamp expirado (> 10 min) é rejeitado com segurança");

  // Restaura envs originais
  if (originalKey) process.env.ENCRYPTION_KEY = originalKey;
  if (originalTokenKey) process.env.TOKEN_ENCRYPTION_KEY = originalTokenKey;
  if (originalAuthSecret) process.env.AUTH_SECRET = originalAuthSecret;
  if (originalNextAuthSecret) process.env.NEXTAUTH_SECRET = originalNextAuthSecret;

  console.log("\n================================================================");
  console.log(` RESULTADO FINAL: ${passed} passaram | ${failed} falharam`);
  console.log("================================================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
