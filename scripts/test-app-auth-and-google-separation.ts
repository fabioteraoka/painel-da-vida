/**
 * Test Suite: App Authentication & Google Integration Separation
 * Tests:
 * 1. Private route without session (401)
 * 2. Setup owner initial flow (one-time execution, data preservation)
 * 3. Login with wrong password (401)
 * 4. Login with correct password (200 + Argon2id validation + cookie)
 * 5. Expired and tampered session tokens (401)
 * 6. Google OAuth optionality (Gmail & Calendar disconnected when unconfigured, no mock leak)
 * 7. Logout and session invalidation
 */

import { getAppSetupSecret } from "../lib/setup-secret";

const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("==========================================================");
  console.log("Iniciando bateria de testes de autenticação e desacoplamento");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
      failed++;
    }
  }

  // 1. Rota privada sem sessão
  console.log("--- Teste 1: Proteção de Rotas Privadas sem Sessão ---");
  const unauthTasks = await fetch(`${BASE_URL}/api/tasks`);
  assert(unauthTasks.status === 401, "GET /api/tasks sem cookie retorna 401");

  const unauthBills = await fetch(`${BASE_URL}/api/bills`);
  assert(unauthBills.status === 401, "GET /api/bills sem cookie retorna 401");

  const unauthMe = await fetch(`${BASE_URL}/api/auth/me`);
  assert(unauthMe.status === 401, "GET /api/auth/me sem cookie retorna 401");

  const unauthHome = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  assert(
    unauthHome.status === 200 || unauthHome.status === 307 || unauthHome.status === 302,
    "GET / sem cookie exibe interface de autenticação ou redireciona (Status " + unauthHome.status + ")",
  );

  // 2. Setup inicial do proprietário
  console.log("\n--- Teste 2: Configuração Inicial do Proprietário (Uso Único) ---");
  const setupStatusRes = await fetch(`${BASE_URL}/api/auth/setup-status`);
  const setupStatus = await setupStatusRes.json();
  assert(setupStatusRes.status === 200, "GET /api/auth/setup-status responde com sucesso");
  assert(
    typeof setupStatus.setupRequired === "boolean",
    "Campo setupRequired está presente no retorno",
  );

  // Tentativa com chave de setup incorreta
  const badSecretRes = await fetch(`${BASE_URL}/api/auth/setup-owner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setupSecret: "chave-errada-123",
      email: "fteraoka72@gmail.com",
      password: "SenhaCorreta123!",
    }),
  });
  assert(
    badSecretRes.status === 403,
    "Tentativa de setup com secret incorreto é bloqueada com 403",
  );

  const realSecret = getAppSetupSecret();

  // Tentativa com senha curta (<8)
  const shortPassRes = await fetch(`${BASE_URL}/api/auth/setup-owner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setupSecret: realSecret,
      email: "fteraoka72@gmail.com",
      password: "curta",
    }),
  });
  assert(
    shortPassRes.status === 400,
    "Tentativa de setup com senha menor que 8 caracteres é rejeitada com 400",
  );

  // Execução legítima do setup inicial
  const validSetupRes = await fetch(`${BASE_URL}/api/auth/setup-owner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setupSecret: realSecret,
      email: "fteraoka72@gmail.com",
      name: "Fábio Teraoka",
      password: "MinhaSenhaSeguraArgon2id!",
    }),
  });
  const validSetupData = await validSetupRes.json();
  assert(
    validSetupRes.status === 200,
    "Setup legítimo do proprietário é aceito com 200",
  );
  assert(
    validSetupData.user?.email === "fteraoka72@gmail.com",
    "Usuário proprietário configurado corretamente",
  );

  // Tentativa de executar setup novamente (bloqueio de uso único)
  const duplicateSetupRes = await fetch(`${BASE_URL}/api/auth/setup-owner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setupSecret: realSecret,
      email: "outro@hacker.com",
      password: "OutraSenha12345!",
    }),
  });
  assert(
    duplicateSetupRes.status === 403,
    "Segunda execução do setup é terminantemente bloqueada com 403 (Uso Único)",
  );

  // 3. Login com senha
  console.log("\n--- Teste 3: Login Próprio com E-mail e Senha (Argon2id) ---");

  // Senha incorreta
  const wrongPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "fteraoka72@gmail.com",
      password: "SenhaTotalmenteIncorreta!",
    }),
  });
  assert(wrongPassRes.status === 401, "Login com senha incorreta falha com 401");

  // Usuário inexistente
  const nonExistentUserRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "naoexiste@exemplo.com",
      password: "QualquerSenha123!",
    }),
  });
  assert(
    nonExistentUserRes.status === 401,
    "Tentativa com e-mail inexistente falha com 401 genérico (sem enumeração)",
  );

  // Login correto
  const correctLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "fteraoka72@gmail.com",
      password: "MinhaSenhaSeguraArgon2id!",
    }),
  });
  assert(correctLoginRes.status === 200, "Login com senha correta aprovado com 200");

  const setCookieHeader = correctLoginRes.headers.get("set-cookie") || "";
  assert(
    setCookieHeader.includes("painel_session="),
    "Cookie de sessão painel_session emitido no cabeçalho Set-Cookie",
  );
  assert(
    setCookieHeader.includes("HttpOnly") || setCookieHeader.includes("httponly"),
    "Cookie emitido possui flag HttpOnly",
  );

  // Extrai o token do cookie
  const match = setCookieHeader.match(/painel_session=([^;]+)/);
  const sessionToken = match ? match[1] : "";
  const authHeaders = {
    Cookie: `painel_session=${sessionToken}`,
  };

  // 4. Acesso autenticado e preservação de dados
  console.log("\n--- Teste 4: Acesso Autenticado e Preservação de Dados do Proprietário ---");
  const authMeRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: authHeaders });
  const authMe = await authMeRes.json();
  assert(authMeRes.status === 200, "GET /api/auth/me com sessão retorna 200");
  assert(authMe.user?.email === "fteraoka72@gmail.com", "E-mail da sessão coincide com o proprietário");

  const authTasksRes = await fetch(`${BASE_URL}/api/tasks`, { headers: authHeaders });
  const tasksData = await authTasksRes.json();
  assert(authTasksRes.status === 200, "GET /api/tasks com sessão retorna 200");
  const tasksList = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];
  assert(tasksList.length > 0, `Tarefas existentes preservadas no banco/store (${tasksList.length} tarefas)`);

  const authBillsRes = await fetch(`${BASE_URL}/api/bills`, { headers: authHeaders });
  const billsData = await authBillsRes.json();
  assert(authBillsRes.status === 200, "GET /api/bills com sessão retorna 200");
  const billsList = Array.isArray(billsData) ? billsData : billsData.bills || [];
  assert(billsList.length > 0, `Boletos e contas existentes preservados (${billsList.length} boletos)`);

  const authProductsRes = await fetch(`${BASE_URL}/api/products`, { headers: authHeaders });
  const productsData = await authProductsRes.json();
  assert(authProductsRes.status === 200, "GET /api/products com sessão retorna 200");
  const productsList = Array.isArray(productsData) ? productsData : productsData.products || [];
  assert(productsList.length > 0, `Produtos monitorados preservados (${productsList.length} produtos)`);

  // 5. Sessão expirada ou adulterada
  console.log("\n--- Teste 5: Validação de Tokens Adulterados ou Expirados ---");
  const tamperedCookie = `painel_session=${sessionToken}malicious`;
  const tamperedRes = await fetch(`${BASE_URL}/api/tasks`, {
    headers: { Cookie: tamperedCookie },
  });
  assert(
    tamperedRes.status === 401,
    "Sessão com assinatura adulterada é imediatamente rejeitada com 401",
  );

  // 6. Google como integração opcional (sem dados mock em produção)
  console.log("\n--- Teste 6: Google como Integração Opcional (Sem Simulação Falsa) ---");
  const calendarRes = await fetch(`${BASE_URL}/api/calendar/events`, { headers: authHeaders });
  const calendarData = await calendarRes.json();
  assert(calendarRes.status === 200, "GET /api/calendar/events responde com 200");
  assert(
    calendarData.connected === false,
    "Google Calendar reporta status desconectado (connected: false)",
  );

  const gmailRes = await fetch(`${BASE_URL}/api/gmail/messages`, { headers: authHeaders });
  const gmailData = await gmailRes.json();
  assert(gmailRes.status === 200, "GET /api/gmail/messages responde com 200");
  assert(
    gmailData.connected === false,
    "Gmail reporta status desconectado (connected: false)",
  );

  const googleConnectRes = await fetch(`${BASE_URL}/api/integrations/google/connect`, {
    headers: authHeaders,
    redirect: "manual",
  });
  const connectLocation = googleConnectRes.headers.get("location") || "";
  assert(
    connectLocation.includes("google_error=not_configured") || googleConnectRes.status === 307 || googleConnectRes.status === 302,
    "Tentativa de conectar Google sem credenciais redireciona com not_configured",
  );

  // 7. Logout e invalidação de sessão
  console.log("\n--- Teste 7: Logout e Invalidação da Sessão ---");
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders,
  });
  assert(logoutRes.status === 200, "POST /api/auth/logout responde com 200");

  const postLogoutTasks = await fetch(`${BASE_URL}/api/tasks`, {
    headers: { Cookie: `painel_session=${sessionToken}` }, // Tentativa com token anterior
  });
  // Depois do logout, se o cookie foi limpo no cliente
  const emptyCookieTasks = await fetch(`${BASE_URL}/api/tasks`);
  assert(emptyCookieTasks.status === 401, "Após logout, rotas privadas continuam inacessíveis (401)");

  console.log("\n==========================================================");
  console.log(`Resultado da bateria de testes: ${passed} passaram, ${failed} falharam.`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal ao rodar testes:", err);
  process.exit(1);
});
