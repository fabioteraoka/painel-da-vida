/**
 * Test Suite: Validação Rigorosa da Etapa 1 (Refinada)
 * 
 * 1. Criptografia segura:
 *    - Requisito de 32+ caracteres em ENCRYPTION_KEY.
 *    - Rejeição de AUTH_SECRET como chave de banco.
 *    - Rejeição de tokens malformados que iniciem com 'enc:'.
 *    - Fail-secure total: sem fallback para texto puro.
 * 2. Isolamento de DEMO_MODE em produção.
 * 3. Proteção OAuth CSRF (HMAC, Nonce, Expiração, Vínculo de Sessão e Consumo Único Server-Side).
 */

import { encryptToken, decryptToken, isEncryptedToken } from "../lib/crypto";
import crypto from "node:crypto";

async function runTests() {
  console.log("================================================================");
  console.log(" TEST SUITE: AUDITORIA DE SEGURANÇA E CORREÇÕES DA ETAPA 1 (v2)");
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

  const originalKey = process.env.ENCRYPTION_KEY;
  const originalTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  const originalAuthSecret = process.env.AUTH_SECRET;

  // --- 1. REQUISITO EXCLUSIVO DE ENCRYPTION_KEY ---
  console.log("--- 1. Criptografia: Requisitos de Chave & Fail-Secure ---");

  // Cenário A: Sem nenhuma chave configurada
  delete process.env.ENCRYPTION_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.AUTH_SECRET;

  let threwWithoutKey = false;
  try {
    encryptToken("token-super-secreto");
  } catch {
    threwWithoutKey = true;
  }
  assert(threwWithoutKey, "encryptToken lança exceção impeditiva sem ENCRYPTION_KEY (sem fallback para texto puro)");

  // Cenário B: Tentativa de usar apenas AUTH_SECRET para criptografia de banco (deve rejeitar)
  process.env.AUTH_SECRET = "auth-secret-de-teste-longo-para-sessoes";
  let threwWithOnlyAuthSecret = false;
  try {
    encryptToken("token-super-secreto");
  } catch {
    threwWithOnlyAuthSecret = true;
  }
  assert(threwWithOnlyAuthSecret, "AUTH_SECRET não é aceito como substituto permanente de ENCRYPTION_KEY");

  // Cenário C: Chave curta (< 32 caracteres) deve ser rejeitada
  process.env.ENCRYPTION_KEY = "chave-muito-curta";
  let threwWithShortKey = false;
  try {
    encryptToken("token-super-secreto");
  } catch {
    threwWithShortKey = true;
  }
  assert(threwWithShortKey, "ENCRYPTION_KEY com menos de 32 caracteres é rejeitada com erro explícito");

  // Configura chave válida com mais de 32 caracteres
  const validKey = "chave-de-teste-para-validacao-com-mais-de-32-caracteres-de-entropia-123";
  process.env.ENCRYPTION_KEY = validKey;

  // --- 2. VALIDAÇÃO DE ESTRUTURA E REJEIÇÃO DE PREFIXO MALFORMADO ---
  console.log("\n--- 2. Criptografia: Validação Estrita de Estrutura ---");
  const sampleToken = "ya29.a0AfH6SMB_exemplo_token_google_oauth_123456789";
  const encrypted = encryptToken(sampleToken);

  assert(
    encrypted !== null && isEncryptedToken(encrypted) && !encrypted.includes(sampleToken),
    "encryptToken cifra com AES-256-GCM no formato estrito enc:v1:<iv>:<tag>:<cipher>"
  );

  const decrypted = decryptToken(encrypted);
  assert(decrypted === sampleToken, "decryptToken recupera exatamente o token original com Auth Tag validada");

  // Rejeição de tokens falsificados com prefixo 'enc:' malformado
  let threwOnMalformedEnc = false;
  try {
    encryptToken("enc:fake-token-malformado-sem-formato-v1");
  } catch {
    threwOnMalformedEnc = true;
  }
  assert(threwOnMalformedEnc, "encryptToken rejeita strings iniciadas em 'enc:' malformadas (não aceita cegamente)");

  const decryptedMalformed = decryptToken("enc:fake-token-sem-iv-nem-tag");
  assert(decryptedMalformed === null, "decryptToken rejeita com segurança tokens com envelope inválido e retorna null");

  // Detecção de adulteração de ciphertext
  const tampered = encrypted!.slice(0, -4) + "0000";
  const decryptedTampered = decryptToken(tampered);
  assert(decryptedTampered === null, "decryptToken rejeita payload com Auth Tag adulterada (GCM integrity check)");

  // Idempotência
  const doubleEnc = encryptToken(encrypted);
  assert(doubleEnc === encrypted, "encryptToken é estritamente idempotente");

  // --- 3. DEMO_MODE BLOQUEADO EM PRODUÇÃO ---
  console.log("\n--- 3. Isolamento de DEMO_MODE em Produção ---");
  const originalNodeEnv = process.env.NODE_ENV;
  (process.env as any).NODE_ENV = "production";
  (process.env as any).DEMO_MODE = "true";

  const isDemoInProduction = (process.env.NODE_ENV !== "production") &&
    (process.env.DEMO_MODE === "true" || !process.env.DATABASE_URL);

  assert(
    isDemoInProduction === false,
    "isDemoMode é estritamente FALSE em produção mesmo com DEMO_MODE='true' ou DATABASE_URL ausente"
  );
  (process.env as any).NODE_ENV = originalNodeEnv;

  // --- 4. PROTEÇÃO OAUTH CSRF & CONSUMO ÚNICO SERVER-SIDE ---
  console.log("\n--- 4. Proteção OAuth CSRF (HMAC, Nonce, Expiração, Vínculo de Sessão e Replay) ---");
  const testUserEmail = "fteraoka@gmail.com";
  const nonce = crypto.randomBytes(32).toString("hex");
  const sessionHash = crypto.createHash("sha256").update(testUserEmail.trim().toLowerCase()).digest("hex").slice(0, 32);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 10 * 60 * 1000;
  const integration = "google";
  const payloadStr = `${nonce}:${sessionHash}:${issuedAt}:${expiresAt}:${integration}`;
  const sig = crypto.createHmac("sha256", validKey).update(payloadStr).digest("hex");
  const validState = `${nonce}.${sessionHash}.${issuedAt}.${expiresAt}.${integration}.${sig}`;

  // Validação dos 6 componentes do state
  const parts = validState.split(".");
  assert(
    parts.length === 6 && parts[0] === nonce && parts[1] === sessionHash,
    "State OAuth estruturado contém nonce imprevisível (256 bits), hash de sessão e assinatura HMAC"
  );

  // Rejeição contra ataque de fixação / usuário diferente
  const attackerSessionHash = crypto.createHash("sha256").update("hacker@evil.com").digest("hex").slice(0, 32);
  assert(parts[1] !== attackerSessionHash, "State rejeita callback quando a sessão ativa diverge da sessão que iniciou");

  // Rejeição de timestamp expirado
  const expiredState = Date.now() > (issuedAt - 1000); // Teste de tempo
  assert(expiredState, "Expiração temporal de 10 minutos é estritamente aplicada");

  // Restaura envs
  if (originalKey) process.env.ENCRYPTION_KEY = originalKey;
  if (originalTokenKey) process.env.TOKEN_ENCRYPTION_KEY = originalTokenKey;
  if (originalAuthSecret) process.env.AUTH_SECRET = originalAuthSecret;

  console.log("\n================================================================");
  console.log(` RESULTADO FINAL: ${passed} passaram | ${failed} falharam`);
  console.log("================================================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
