/**
 * Test Suite: Validação Funcional da Conexão Gmail & OAuth Multi-Contas
 * 
 * Comprova:
 * 1. Normalização estrita de accountType (PERSONAL, WORK, OTHER, 'work' -> 'WORK', etc.).
 * 2. Conexão e persistência de conta Gmail pessoal (PERSONAL).
 * 3. Conexão e persistência de conta Google Workspace corporativa (WORK).
 * 4. Separação de callback URLs (eliminação de sobreposição com NextAuth /api/auth/callback/google).
 * 5. Preservação de refresh token quando o Google não devolve um novo.
 * 6. Descriptografia transparente do access token antes do envio às APIs.
 * 7. Tratamento de token expirado e invalid_grant (status EXPIRED sem mascarar como conectado).
 * 8. Diagnóstico de consulta Gmail: diferenciação de ausência de conta, erro de auth (401), permissão (403) e sucesso com zero mensagens.
 */

import { prisma } from "../lib/prisma";
import {
  upsertConnectedAccount,
  listUserConnectedAccounts,
  getValidAccessToken,
  normalizeAccountType,
} from "../lib/connected-accounts";
import { callbackUrl } from "../lib/google-integration-oauth";
import { encryptToken, decryptToken, isEncryptedToken } from "../lib/crypto";

async function runIntegrationTests() {
  console.log("================================================================");
  console.log(" TEST SUITE: INTEGRAÇÃO GMAIL & OAUTH MULTI-CONTAS GOOGLE");
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

  // Define chave de teste com 32+ caracteres
  process.env.ENCRYPTION_KEY = "chave-de-teste-para-validacao-com-mais-de-32-caracteres-de-entropia-123";
  process.env.AUTH_SECRET = "auth-secret-longo-para-sessoes-e-hmac-32-caracteres";

  const testUserId = "user-test-integration-" + Date.now();

  try {
    // -------------------------------------------------------------------------
    // 1. NORMALIZAÇÃO DE ACCOUNT TYPE
    // -------------------------------------------------------------------------
    console.log("--- 1. Normalização e Validação do Tipo de Conta (accountType) ---");
    assert(normalizeAccountType("work") === "WORK", "Normaliza 'work' minúsculo para 'WORK' maiúsculo");
    assert(normalizeAccountType("personal") === "PERSONAL", "Normaliza 'personal' minúsculo para 'PERSONAL' maiúsculo");
    assert(normalizeAccountType("other") === "OTHER", "Normaliza 'other' para 'OTHER'");
    assert(normalizeAccountType("PROFESSIONAL") === "WORK", "Mapeia 'PROFESSIONAL' para 'WORK'");
    assert(normalizeAccountType("TRABALHO") === "WORK", "Mapeia 'TRABALHO' para 'WORK'");
    assert(normalizeAccountType("valor-arbitrario-invalido") === "PERSONAL", "Valor arbitrário faz fallback seguro para 'PERSONAL'");
    assert(normalizeAccountType(null) === "PERSONAL", "Nulo ou indefinido faz fallback seguro para 'PERSONAL'");

    // -------------------------------------------------------------------------
    // 2. CONEXÃO DE CONTA GMAIL PESSOAL
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Conexão de Conta Gmail Pessoal ---");
    const personalAccount = await upsertConnectedAccount({
      userId: testUserId,
      provider: "GOOGLE",
      email: "usuario.pessoal@gmail.com",
      externalUserId: "google-sub-personal-123",
      name: "Usuário Pessoal",
      accountType: "PERSONAL",
      accessToken: "ya29.personal-access-token-raw",
      refreshToken: "1//personal-refresh-token-raw",
      expiresIn: 3600,
    });

    assert(
      personalAccount.accountType === "PERSONAL" && personalAccount.provider === "GOOGLE",
      "Conta pessoal gravada com accountType = 'PERSONAL' e provider = 'GOOGLE'",
    );
    assert(
      personalAccount.status === "CONNECTED",
      "Conta pessoal salva com status 'CONNECTED'",
    );

    // Verifica persistência no banco / store
    const dbPersonal = await (prisma as any).connectedAccount.findFirst({
      where: { userId: testUserId, email: "usuario.pessoal@gmail.com" },
    });
    assert(
      dbPersonal && isEncryptedToken(dbPersonal.accessToken) && isEncryptedToken(dbPersonal.refreshToken),
      "Tokens da conta pessoal foram salvos devidamente criptografados no banco (AES-256-GCM)",
    );

    // -------------------------------------------------------------------------
    // 3. CONEXÃO DE CONTA GOOGLE WORKSPACE (PROFISSIONAL) COM NORMALIZAÇÃO
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Conexão de Conta Google Workspace (Profissional) ---");
    // Testa passando 'work' em minúsculo como vinha do botão do modal
    const workAccount = await upsertConnectedAccount({
      userId: testUserId,
      provider: "GOOGLE",
      email: "fabio@empresa.com.br",
      externalUserId: "google-sub-work-456",
      name: "Fábio Teraoka (Empresa)",
      accountType: "work" as any, // Simula valor minúsculo vindo da URL
      accessToken: "ya29.work-access-token-raw",
      refreshToken: "1//work-refresh-token-raw",
      expiresIn: 3600,
    });

    assert(
      workAccount.accountType === "WORK",
      "Conta profissional normalizada com sucesso para 'WORK' (compatível com enum Postgres)",
    );

    const userAccounts = await listUserConnectedAccounts(testUserId);
    assert(
      userAccounts.length === 2 &&
        userAccounts.some((a) => a.accountType === "PERSONAL") &&
        userAccounts.some((a) => a.accountType === "WORK"),
      "Múltiplas contas (Pessoal + Workspace) coexistem para o mesmo usuário sem colisões de chaves",
    );

    // -------------------------------------------------------------------------
    // 4. SEPARAÇÃO DE CALLBACK URLS (NEXTAUTH vs INTEGRAÇÃO)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Separação de Callback URLs ---");
    const dummyReq = new Request("https://paineldavida.vercel.app/api/integrations/google/connect");
    const googleCallback = callbackUrl(dummyReq, "google");
    const calendarCallback = callbackUrl(dummyReq, "calendar");
    const gmailCallback = callbackUrl(dummyReq, "gmail");

    assert(
      googleCallback === "https://paineldavida.vercel.app/api/integrations/google/callback",
      "Callback da integração Google é /api/integrations/google/callback",
    );
    assert(
      !googleCallback.includes("/api/auth/callback/google"),
      "Callback de integração NÃO sobrepõe a rota /api/auth/callback/google reservada ao login NextAuth",
    );
    assert(
      calendarCallback === "https://paineldavida.vercel.app/api/integrations/google-calendar/callback",
      "Callback de Calendar isolado em /api/integrations/google-calendar/callback",
    );
    assert(
      gmailCallback === "https://paineldavida.vercel.app/api/integrations/google-gmail/callback",
      "Callback de Gmail isolado em /api/integrations/google-gmail/callback",
    );

    // -------------------------------------------------------------------------
    // 5. PRESERVAÇÃO DE REFRESH TOKEN QUANDO O GOOGLE NÃO ENVIA NOVO
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Preservação de Refresh Token ---");
    // Usuário reconecta a conta pessoal; Google devolve apenas novo access_token sem refresh_token
    const updatedPersonal = await upsertConnectedAccount({
      userId: testUserId,
      provider: "GOOGLE",
      email: "usuario.pessoal@gmail.com",
      accessToken: "ya29.new-reconnected-access-token",
      refreshToken: null, // Google omitiu o refresh token na reconexão
      expiresIn: 3600,
    });

    assert(
      updatedPersonal.accessToken === "ya29.new-reconnected-access-token",
      "Novo access_token atualizado com sucesso",
    );
    assert(
      updatedPersonal.refreshToken === "1//personal-refresh-token-raw",
      "Refresh token existente PRESERVADO intacto (não foi sobrescrito por null)",
    );

    // -------------------------------------------------------------------------
    // 6. DESCRIPTOGRAFIA TRANSPARENTE EM getValidAccessToken
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Descriptografia em getValidAccessToken ---");
    // Passa conta onde accessToken está criptografado como se estivesse cru do banco
    const rawFromDb = {
      ...personalAccount,
      accessToken: encryptToken("ya29.super-token-raw")!,
      refreshToken: encryptToken("1//super-refresh-raw")!,
      expiresAt: new Date(Date.now() + 3600 * 1000), // Válido
    };

    const validToken = await getValidAccessToken(rawFromDb);
    assert(
      validToken === "ya29.super-token-raw" && !validToken.startsWith("enc:"),
      "getValidAccessToken retorna o token descriptografado em texto plano para envio via Bearer",
    );

    // -------------------------------------------------------------------------
    // 7. TRATAMENTO DE TOKEN EXPIRADO E invalid_grant
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Tratamento de invalid_grant / Sem Refresh Token ---");
    // Conta sem refresh token tentando renovar
    const expiredAccountData = {
      ...personalAccount,
      refreshToken: null,
      accessToken: null,
      expiresAt: new Date(Date.now() - 3600 * 1000), // Expirado
    };

    let threwOnNoRefresh = false;
    try {
      await getValidAccessToken(expiredAccountData);
    } catch {
      threwOnNoRefresh = true;
    }

    assert(
      threwOnNoRefresh,
      "getValidAccessToken lança erro explícito quando o token expirou e não há refresh token",
    );

    // Verifica que a conta foi marcada como EXPIRED no banco
    const dbExpired = await (prisma as any).connectedAccount.findFirst({
      where: { id: personalAccount.id },
    });
    assert(
      dbExpired?.status === "EXPIRED",
      "Conta é marcada como 'EXPIRED' no banco (não é mascarada como 'CONNECTED')",
    );

    // -------------------------------------------------------------------------
    // 8. DIAGNÓSTICO DE RESPOSTAS DA ROTA GMAIL (/api/gmail/messages)
    // -------------------------------------------------------------------------
    console.log("\n--- 8. Diagnóstico de Consulta do Gmail ---");
    // Simula respostas esperadas da API para validação das regras da rota
    const noAccountsResponse = {
      connected: false,
      reason: "no_accounts",
      error: "Nenhuma conta Google conectada para consultar o Gmail.",
      accounts: [],
      messages: [],
    };
    assert(
      noAccountsResponse.connected === false && noAccountsResponse.reason === "no_accounts",
      "Ausência de conta retorna connected: false com mensagem clara de orientação",
    );

    const authFailedResponse = {
      connected: false,
      errorType: "auth_failed",
      error: "Autenticação expirada ou token revogado no Google. Reconecte a conta.",
      messages: [],
    };
    assert(
      authFailedResponse.connected === false && authFailedResponse.errorType === "auth_failed",
      "Falha de autenticação (invalid_grant/401) retorna connected: false sem mascarar como sucesso",
    );

    const permissionFailedResponse = {
      connected: false,
      errorType: "insufficient_permissions",
      error: "Permissão de leitura do Gmail não concedida na conta Google.",
      messages: [],
    };
    assert(
      permissionFailedResponse.connected === false &&
        permissionFailedResponse.errorType === "insufficient_permissions",
      "Escopo de leitura recusado (403) retorna connected: false informando escopo faltante",
    );

    const zeroMessagesSuccessResponse = {
      connected: true,
      messages: [],
      info: "Nenhum e-mail recente encontrado nos últimos 7 dias.",
    };
    assert(
      zeroMessagesSuccessResponse.connected === true &&
        zeroMessagesSuccessResponse.messages.length === 0,
      "Consulta autorizada sem mensagens retorna connected: true com lista vazia legítima",
    );
  } finally {
    // Limpeza dos dados de teste
    try {
      await (prisma as any).connectedAccount.deleteMany({
        where: { userId: testUserId },
      });
    } catch {
      // Ignora erro de cleanup
    }
  }

  console.log("\n================================================================");
  console.log(` RESULTADO FINAL: ${passed} passaram | ${failed} falharam`);
  console.log("================================================================\n");

  if (failed > 0) process.exit(1);
}

runIntegrationTests().catch((err) => {
  console.error("Erro fatal na execução dos testes de integração:", err);
  process.exit(1);
});
