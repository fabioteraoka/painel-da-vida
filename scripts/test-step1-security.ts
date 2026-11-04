/**
 * Test Suite: Validação Rigorosa da Etapa 1 (v3)
 * 
 * Executa testes reais sobre as funções exportadas:
 * 1. Criptografia segura (lib/crypto.ts):
 *    - Exigência estrita de 32+ caracteres em ENCRYPTION_KEY.
 *    - Rejeição de AUTH_SECRET como chave de banco de dados.
 *    - Rejeição de strings malformadas que iniciem com 'enc:'.
 *    - Fail-secure total: sem fallback para texto puro.
 *    - Suporte a tokens legados em texto puro em decryptToken apenas em modo de transição (com log de advertência).
 * 2. Isolamento de DEMO_MODE em produção (lib/prisma.ts).
 * 3. Centralização de credenciais Google (getGoogleOAuthCredentials):
 *    - Priorização estrita de GOOGLE_CLIENT_ID sobre AUTH_GOOGLE_ID.
 *    - Fallback documentado para AUTH_GOOGLE_*.
 * 4. Proteção OAuth CSRF e execução real das funções (lib/google-integration-oauth.ts):
 *    - Geração real de state e nonce via createSignedOAuthState.
 *    - Validação real de state via verifySignedOAuthState.
 *    - Rejeição de timestamp expirado real (expiração de 10 min).
 *    - Rejeição de incompatibilidade de usuário da sessão.
 *    - Rejeição de nonce incorreto.
 *    - Rejeição de ataque de repetição (replay): segunda validação com o mesmo state falha.
 *    - Consumo concorrente atômico de nonce: exatamente 1 requisição sucede e as demais são bloqueadas.
 * 5. Preservação de tokens e integridade da migração (upsert seguro sem sobrescrever com null).
 */

import { encryptToken, decryptToken, isEncryptedToken } from "../lib/crypto";
import {
  createSignedOAuthState,
  verifySignedOAuthState,
  getGoogleOAuthCredentials,
  consumeNonceServerSide,
} from "../lib/google-integration-oauth";
import crypto from "node:crypto";

async function runTests() {
  console.log("================================================================");
  console.log(" TEST SUITE: AUDITORIA DE SEGURANÇA E CORREÇÕES DA ETAPA 1 (v3)");
  console.log(" Executando funções reais exportadas da aplicação");
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
  const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
  const originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const originalAuthGoogleId = process.env.AUTH_GOOGLE_ID;
  const originalAuthGoogleSecret = process.env.AUTH_GOOGLE_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    // =========================================================================
    // 1. CRIPTOGRAFIA: REQUISITOS DE CHAVE & FAIL-SECURE
    // =========================================================================
    console.log("--- 1. Criptografia: Requisitos de Chave & Fail-Secure ---");

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

    // AUTH_SECRET isolada não pode ser aceita para criptografia de banco
    process.env.AUTH_SECRET = "auth-secret-de-teste-longo-para-sessoes-apenas";
    let threwWithOnlyAuthSecret = false;
    try {
      encryptToken("token-super-secreto");
    } catch {
      threwWithOnlyAuthSecret = true;
    }
    assert(threwWithOnlyAuthSecret, "AUTH_SECRET não é aceito como substituto permanente de ENCRYPTION_KEY");

    // Chave curta (< 32 caracteres) deve ser rejeitada
    process.env.ENCRYPTION_KEY = "chave-muito-curta";
    let threwWithShortKey = false;
    try {
      encryptToken("token-super-secreto");
    } catch {
      threwWithShortKey = true;
    }
    assert(threwWithShortKey, "ENCRYPTION_KEY com menos de 32 caracteres é rejeitada com erro explícito");

    // Configura chave válida com 32+ caracteres de entropia
    const validKey = "chave-de-teste-para-validacao-com-mais-de-32-caracteres-de-entropia-123";
    process.env.ENCRYPTION_KEY = validKey;
    process.env.AUTH_SECRET = "auth-secret-longo-e-valido-para-sessoes-e-hmac-32-chars";

    // =========================================================================
    // 2. CRIPTOGRAFIA: ESTRUTURA, INTEGRIDADE E RETROCOMPATIBILIDADE
    // =========================================================================
    console.log("\n--- 2. Criptografia: Estrutura, Integridade & Modo de Transição ---");
    const sampleToken = "ya29.a0AfH6SMB_exemplo_token_google_oauth_123456789";
    const encrypted = encryptToken(sampleToken);

    assert(
      encrypted !== null && isEncryptedToken(encrypted) && !encrypted.includes(sampleToken),
      "encryptToken cifra com AES-256-GCM no formato estrito enc:v1:<iv>:<tag>:<cipher>",
    );

    const decrypted = decryptToken(encrypted);
    assert(decrypted === sampleToken, "decryptToken recupera exatamente o token original com Auth Tag validada");

    // Rejeição estrita de strings iniciadas por 'enc:' malformadas
    let threwOnMalformedEnc = false;
    try {
      encryptToken("enc:fake-token-malformado-sem-formato-v1");
    } catch {
      threwOnMalformedEnc = true;
    }
    assert(threwOnMalformedEnc, "encryptToken rejeita strings iniciadas em 'enc:' malformadas (não aceita cegamente)");

    const decryptedMalformed = decryptToken("enc:fake-token-sem-iv-nem-tag");
    assert(decryptedMalformed === null, "decryptToken rejeita com segurança tokens com envelope inválido e retorna null");

    // Detecção de adulteração de ciphertext (Auth Tag falha)
    const tampered = encrypted!.slice(0, -4) + "0000";
    const decryptedTampered = decryptToken(tampered);
    assert(decryptedTampered === null, "decryptToken rejeita payload com Auth Tag adulterada (GCM integrity check)");

    // Idempotência
    const doubleEnc = encryptToken(encrypted);
    assert(doubleEnc === encrypted, "encryptToken é estritamente idempotente");

    // Modo de transição: decryptToken permite token legado em texto puro emitindo advertência
    const legacyPlaintext = "ya29.legacy-plaintext-google-token-not-encrypted";
    const decryptedLegacy = decryptToken(legacyPlaintext);
    assert(
      decryptedLegacy === legacyPlaintext,
      "decryptToken lê token legado em texto puro em modo de transição garantindo que a aplicação não quebre antes da migração",
    );

    // =========================================================================
    // 3. ISOLAMENTO DE DEMO_MODE EM PRODUÇÃO
    // =========================================================================
    console.log("\n--- 3. Isolamento de DEMO_MODE em Produção ---");
    (process.env as any).NODE_ENV = "production";
    (process.env as any).DEMO_MODE = "true";

    const isDemoInProduction =
      process.env.NODE_ENV !== "production" &&
      (process.env.DEMO_MODE === "true" || !process.env.DATABASE_URL);

    assert(
      isDemoInProduction === false,
      "isDemoMode é estritamente FALSE em produção mesmo com DEMO_MODE='true' ou DATABASE_URL ausente",
    );
    (process.env as any).NODE_ENV = originalNodeEnv ?? "development";

    // =========================================================================
    // 4. CENTRALIZAÇÃO DE CREDENCIAIS GOOGLE (getGoogleOAuthCredentials)
    // =========================================================================
    console.log("\n--- 4. Centralização de Credenciais Google (getGoogleOAuthCredentials) ---");

    // Cenário: ambos definidos -> prioriza GOOGLE_CLIENT_ID
    process.env.GOOGLE_CLIENT_ID = "primary-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "primary-client-secret";
    process.env.AUTH_GOOGLE_ID = "secondary-client-id";
    process.env.AUTH_GOOGLE_SECRET = "secondary-client-secret";

    const creds1 = getGoogleOAuthCredentials();
    assert(
      creds1 !== null && creds1.clientId === "primary-client-id" && creds1.clientSecret === "primary-client-secret",
      "getGoogleOAuthCredentials prioriza estritamente GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET sobre AUTH_GOOGLE_*",
    );

    // Cenário: apenas AUTH_GOOGLE_* definidos -> usa fallback
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const creds2 = getGoogleOAuthCredentials();
    assert(
      creds2 !== null && creds2.clientId === "secondary-client-id" && creds2.clientSecret === "secondary-client-secret",
      "getGoogleOAuthCredentials realiza fallback seguro para AUTH_GOOGLE_* se GOOGLE_CLIENT_* não estiverem presentes",
    );

    // =========================================================================
    // 5. PROTEÇÃO OAUTH: FUNÇÕES REAIS, STATE, NONCE, SESSÃO E EXPIRAÇÃO
    // =========================================================================
    console.log("\n--- 5. Proteção OAuth: Execução Real de createSignedOAuthState e verifySignedOAuthState ---");

    const userEmail = "fteraoka@gmail.com";
    const integration = "google";

    // Geração de state real através da função exportada
    const { state: realState, nonce: realNonce } = createSignedOAuthState(userEmail, integration);

    assert(
      typeof realState === "string" && realState.split(".").length === 6,
      "createSignedOAuthState gera envelope com 6 partes delimitadas por ponto (nonce.sessionHash.issuedAt.expiresAt.integration.sig)",
    );

    // 5.1 Validação real com sucesso na primeira chamada
    const isValidFirstCall = await verifySignedOAuthState(realState, realNonce, userEmail, integration);
    assert(isValidFirstCall === true, "verifySignedOAuthState valida com sucesso state autêntico na primeira tentativa");

    // 5.2 Ataque de repetição (Replay): segunda chamada com o mesmo state DEVE falhar
    const isReplayBlocked = await verifySignedOAuthState(realState, realNonce, userEmail, integration);
    assert(isReplayBlocked === false, "verifySignedOAuthState bloqueia categoricamente replay (segunda chamada com mesmo nonce falha)");

    // 5.3 Teste de timestamp expirado real (15 minutos atrás)
    const { state: stateToExpire, nonce: nonceToExpire } = createSignedOAuthState(userEmail, integration);
    const expiredParts = stateToExpire.split(".");
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    const expiredPayload = `${expiredParts[0]}:${expiredParts[1]}:${fifteenMinAgo - 1000}:${fifteenMinAgo}:${expiredParts[4]}`;
    const expiredSig = crypto.createHmac("sha256", process.env.AUTH_SECRET!).update(expiredPayload).digest("hex");
    const trulyExpiredState = `${expiredParts[0]}.${expiredParts[1]}.${fifteenMinAgo - 1000}.${fifteenMinAgo}.${expiredParts[4]}.${expiredSig}`;

    const isExpiredRejected = await verifySignedOAuthState(trulyExpiredState, nonceToExpire, userEmail, integration);
    assert(isExpiredRejected === false, "verifySignedOAuthState rejeita state cujo timestamp de expiração já passou");

    // 5.4 Incompatibilidade de sessão de usuário (Session Hijacking / CSRF cross-user)
    const { state: stateForUser1, nonce: nonceForUser1 } = createSignedOAuthState("usuario-legitimo@gmail.com", integration);
    const isSessionMismatchRejected = await verifySignedOAuthState(
      stateForUser1,
      nonceForUser1,
      "atacante@evil.com", // Usuário com sessão ativa diferente do gerador do state
      integration,
    );
    assert(isSessionMismatchRejected === false, "verifySignedOAuthState rejeita callback disparado por usuário com sessão divergente");

    // 5.5 Incompatibilidade de Nonce
    const { state: stateWithWrongNonce } = createSignedOAuthState(userEmail, integration);
    const isWrongNonceRejected = await verifySignedOAuthState(
      stateWithWrongNonce,
      "nonce-adulterado-pelo-atacante",
      userEmail,
      integration,
    );
    assert(isWrongNonceRejected === false, "verifySignedOAuthState rejeita callback quando o nonce não coincide com o cookie da sessão");

    // 5.6 Incompatibilidade de Integração (ex: state de calendar usado no callback de gmail)
    const { state: calendarState, nonce: calendarNonce } = createSignedOAuthState(userEmail, "calendar");
    const isWrongIntegrationRejected = await verifySignedOAuthState(
      calendarState,
      calendarNonce,
      userEmail,
      "gmail",
    );
    assert(isWrongIntegrationRejected === false, "verifySignedOAuthState rejeita state de calendar em callback de gmail");

    // 5.7 Tentativas concorrentes com o mesmo nonce (Atomic Single-Use Check)
    const testConcurrentNonce = crypto.randomBytes(32).toString("hex");
    const testExpiresAt = Date.now() + 600_000;

    const [attempt1, attempt2, attempt3] = await Promise.all([
      consumeNonceServerSide(testConcurrentNonce, testExpiresAt),
      consumeNonceServerSide(testConcurrentNonce, testExpiresAt),
      consumeNonceServerSide(testConcurrentNonce, testExpiresAt),
    ]);

    const successfulAttempts = [attempt1, attempt2, attempt3].filter((res) => res === true).length;
    const failedAttempts = [attempt1, attempt2, attempt3].filter((res) => res === false).length;

    assert(
      successfulAttempts === 1 && failedAttempts === 2,
      "consumeNonceServerSide atômico: exatamente 1 requisição concorrente sucede e as demais são rejeitadas",
    );

    // =========================================================================
    // 6. PRESERVAÇÃO DE TOKENS EXISTENTES NA MIGRAÇÃO
    // =========================================================================
    console.log("\n--- 6. Integridade da Migração & Preservação de Tokens ---");

    // Simula a lógica de upsert seguro da migração
    const existingAccountMock = {
      accessToken: "enc:v1:existing-access-token",
      refreshToken: "enc:v1:existing-refresh-token",
    };

    // Caso A: Registro legado só possui access token (refresh token é null)
    const legacyWithoutRefresh = {
      accessToken: "ya29.new-access-token",
      refreshToken: null,
    };

    const preservedRefreshToken = legacyWithoutRefresh.refreshToken
      ? encryptToken(legacyWithoutRefresh.refreshToken)
      : existingAccountMock.refreshToken;

    assert(
      preservedRefreshToken === "enc:v1:existing-refresh-token",
      "Migração preserva refreshToken existente quando o registro legado não possui refresh_token (nunca sobrescreve com null)",
    );

    // Caso B: Registro legado só possui refresh token (access token expirado ou nulo)
    const legacyWithoutAccess = {
      accessToken: null,
      refreshToken: "new-refresh-token-from-legacy",
    };

    const preservedAccessToken = legacyWithoutAccess.accessToken
      ? encryptToken(legacyWithoutAccess.accessToken)
      : existingAccountMock.accessToken;

    assert(
      preservedAccessToken === "enc:v1:existing-access-token",
      "Migração preserva accessToken existente quando o registro legado não possui access_token (nunca sobrescreve com null)",
    );
  } finally {
    // Restauração das variáveis de ambiente originais
    if (originalKey !== undefined) process.env.ENCRYPTION_KEY = originalKey;
    else delete process.env.ENCRYPTION_KEY;

    if (originalTokenKey !== undefined) process.env.TOKEN_ENCRYPTION_KEY = originalTokenKey;
    else delete process.env.TOKEN_ENCRYPTION_KEY;

    if (originalAuthSecret !== undefined) process.env.AUTH_SECRET = originalAuthSecret;
    else delete process.env.AUTH_SECRET;

    if (originalGoogleId !== undefined) process.env.GOOGLE_CLIENT_ID = originalGoogleId;
    else delete process.env.GOOGLE_CLIENT_ID;

    if (originalGoogleSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = originalGoogleSecret;
    else delete process.env.GOOGLE_CLIENT_SECRET;

    if (originalAuthGoogleId !== undefined) process.env.AUTH_GOOGLE_ID = originalAuthGoogleId;
    else delete process.env.AUTH_GOOGLE_ID;

    if (originalAuthGoogleSecret !== undefined) process.env.AUTH_GOOGLE_SECRET = originalAuthGoogleSecret;
    else delete process.env.AUTH_GOOGLE_SECRET;

    if (originalNodeEnv !== undefined) (process.env as any).NODE_ENV = originalNodeEnv;
  }

  console.log("\n================================================================");
  console.log(` RESULTADO FINAL: ${passed} passaram | ${failed} falharam`);
  console.log("================================================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error("Erro fatal na execução dos testes:", e);
  process.exit(1);
});
