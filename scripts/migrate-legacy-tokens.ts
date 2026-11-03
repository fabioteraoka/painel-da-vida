/**
 * Script de Migração e Criptografia Segura de Tokens Legados (v2)
 *
 * USO:
 *   npx tsx scripts/migrate-legacy-tokens.ts           # Modo Diagnóstico e Dry-Run (NÃO altera o banco)
 *   npx tsx scripts/migrate-legacy-tokens.ts --execute # Executa as correções com segurança
 *
 * REGRAS DE INTEGRIDADE:
 * 1. Não combina access token e refresh token de contas externas diferentes.
 * 2. Não associa automaticamente uma conta externa se a identidade Google não for confirmada.
 * 3. Marca registros sem identidade confirmada como 'PENDENTE DE REVISÃO' (status ERROR).
 * 4. Criptografa independentemente access token e refresh token (trata casos em que um já estava cifrado).
 * 5. Garante idempotência estrita e preservação de dados.
 * 6. Não remove a tabela Integration.
 */

import { PrismaClient } from "@prisma/client";
import { encryptToken, decryptToken, isEncryptedToken } from "../lib/crypto";

const prisma = new PrismaClient();
const isExecute = process.argv.includes("--execute");

async function resolveGoogleIdentity(accessToken: string): Promise<{ email?: string; sub?: string; name?: string } | null> {
  try {
    const rawToken = decryptToken(accessToken);
    if (!rawToken) return null;

    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${rawToken}` },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = (await res.json()) as { email?: string; sub?: string; name?: string };
      if (data.email) {
        return {
          email: data.email.toLowerCase(),
          sub: data.sub,
          name: data.name,
        };
      }
    }
  } catch {
    // Falha esperada se o token estiver expirado ou sem conectividade
  }
  return null;
}

type MigrationPlanItem = {
  sourceTable: "ConnectedAccount" | "Integration";
  recordId: string;
  userEmail: string;
  provider: string;
  confirmedGoogleEmail: string | null;
  externalUserId: string | null;
  needsAccessTokenEncryption: boolean;
  needsRefreshTokenEncryption: boolean;
  status: "OK_ENCRYPTED" | "REQUIRES_ENCRYPTION" | "PENDING_REVIEW_UNCONFIRMED_IDENTITY";
  reason: string;
  action: () => Promise<void>;
};

async function main() {
  console.log("==================================================================");
  console.log(" PAINEL DA VIDA — DIAGNÓSTICO E PLANO DE MIGRAÇÃO DE TOKENS");
  console.log(` Modo: ${isExecute ? "EXECUTAR MIGRAÇÃO (--execute)" : "SIMULAÇÃO / DIAGNÓSTICO (Dry-Run)"}`);
  console.log("==================================================================\n");

  // 1. Verificação estrita de ENCRYPTION_KEY
  const encryptionKey = process.env.ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.trim().length < 32) {
    console.error("❌ ERRO FATAL: ENCRYPTION_KEY ausente ou com menos de 32 caracteres.");
    console.error("   Defina ENCRYPTION_KEY com no mínimo 32 caracteres antes de prosseguir.");
    process.exit(1);
  }
  console.log("✅ ENCRYPTION_KEY validada (requisito de 32+ caracteres atendido).");

  // 2. Consulta segura aos dados do banco
  let connectedAccounts: any[] = [];
  let legacyIntegrations: any[] = [];

  try {
    connectedAccounts = await (prisma as any).connectedAccount.findMany({
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
  } catch (err: any) {
    console.warn("ℹ️ Tabela ConnectedAccount não acessível (banco local sem migration ou offline):", err?.message);
  }

  try {
    legacyIntegrations = await prisma.integration.findMany({
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
  } catch (err: any) {
    console.warn("ℹ️ Tabela Integration não acessível:", err?.message);
  }

  console.log(`\n📊 Registros Encontrados:`);
  console.log(` - ConnectedAccount existentes: ${connectedAccounts.length}`);
  console.log(` - Integrações legadas (Integration): ${legacyIntegrations.length}`);

  const plan: MigrationPlanItem[] = [];

  // 3. Análise independente de ConnectedAccount existentes
  for (const acc of connectedAccounts) {
    const hasAccess = Boolean(acc.accessToken);
    const hasRefresh = Boolean(acc.refreshToken);
    const accessEnc = isEncryptedToken(acc.accessToken);
    const refreshEnc = isEncryptedToken(acc.refreshToken);

    const needsAccess = hasAccess && !accessEnc;
    const needsRefresh = hasRefresh && !refreshEnc;

    if (needsAccess || needsRefresh) {
      plan.push({
        sourceTable: "ConnectedAccount",
        recordId: acc.id,
        userEmail: acc.user?.email ?? "desconhecido",
        provider: acc.provider,
        confirmedGoogleEmail: acc.email,
        externalUserId: acc.externalUserId,
        needsAccessTokenEncryption: needsAccess,
        needsRefreshTokenEncryption: needsRefresh,
        status: "REQUIRES_ENCRYPTION",
        reason: `Tokens em texto puro detectados (${[needsAccess ? "accessToken" : null, needsRefresh ? "refreshToken" : null].filter(Boolean).join(", ")})`,
        action: async () => {
          await (prisma as any).connectedAccount.update({
            where: { id: acc.id },
            data: {
              accessToken: needsAccess ? encryptToken(acc.accessToken) : acc.accessToken,
              refreshToken: needsRefresh ? encryptToken(acc.refreshToken) : acc.refreshToken,
            },
          });
        },
      });
    }
  }

  // 4. Análise de Integrações Legadas (Integration)
  for (const leg of legacyIntegrations) {
    const user = leg.user;
    if (!user) continue;

    const hasAccess = Boolean(leg.accessToken);
    const hasRefresh = Boolean(leg.refreshToken);
    const accessEnc = isEncryptedToken(leg.accessToken);
    const refreshEnc = isEncryptedToken(leg.refreshToken);

    const needsAccessEncrypt = hasAccess && !accessEnc;
    const needsRefreshEncrypt = hasRefresh && !refreshEnc;

    // Resolução segura de identidade Google sem misturar contas
    let resolvedIdentity: { email?: string; sub?: string; name?: string } | null = null;
    if (hasAccess) {
      resolvedIdentity = await resolveGoogleIdentity(leg.accessToken);
    }

    const confirmedEmail = resolvedIdentity?.email ?? null;
    const externalUserId = resolvedIdentity?.sub ?? leg.externalUserId ?? null;

    if (!confirmedEmail) {
      // NÃO ASSOCIA AUTOMATICAMENTE se a identidade Google não puder ser confirmada
      // Marca como pendente de revisão (status ERROR) com identificador provisório isolado
      const placeholderEmail = `unverified_${leg.provider.toLowerCase()}_${leg.id.slice(0, 8)}@pendente.local`;

      plan.push({
        sourceTable: "Integration",
        recordId: leg.id,
        userEmail: user.email,
        provider: leg.provider,
        confirmedGoogleEmail: null,
        externalUserId: null,
        needsAccessTokenEncryption: needsAccessEncrypt,
        needsRefreshTokenEncryption: needsRefreshEncrypt,
        status: "PENDING_REVIEW_UNCONFIRMED_IDENTITY",
        reason: "Identidade externa do Google não pôde ser confirmada (token expirado ou sem rede). Requer reconexão pelo usuário.",
        action: async () => {
          // Cria registro em ConnectedAccount com status ERROR para não perder o registro,
          // mas sem poluir a conta do usuário com suposição incorreta
          await (prisma as any).connectedAccount.upsert({
            where: {
              userId_provider_email: {
                userId: user.id,
                provider: "GOOGLE",
                email: placeholderEmail,
              },
            },
            update: {
              status: "ERROR",
              errorMessage: "Identidade Google não confirmada durante a migração. Reconecte esta conta no Painel da Vida.",
              accessToken: needsAccessEncrypt ? encryptToken(leg.accessToken) : leg.accessToken,
              refreshToken: needsRefreshEncrypt ? encryptToken(leg.refreshToken) : leg.refreshToken,
            },
            create: {
              userId: user.id,
              provider: "GOOGLE",
              email: placeholderEmail,
              name: `Google (${leg.provider} legado)`,
              label: `Google legado — ${leg.provider} (Pendente de Revisão)`,
              accountType: "PERSONAL",
              status: "ERROR",
              errorMessage: "Identidade Google não confirmada durante a migração. Reconecte esta conta no Painel da Vida.",
              accessToken: needsAccessEncrypt ? encryptToken(leg.accessToken) : leg.accessToken,
              refreshToken: needsRefreshEncrypt ? encryptToken(leg.refreshToken) : leg.refreshToken,
            },
          });

          // Criptografa o registro na tabela legada Integration in-place
          if (needsAccessEncrypt || needsRefreshEncrypt) {
            await prisma.integration.update({
              where: { id: leg.id },
              data: {
                accessToken: needsAccessEncrypt ? encryptToken(leg.accessToken) : leg.accessToken,
                refreshToken: needsRefreshEncrypt ? encryptToken(leg.refreshToken) : leg.refreshToken,
              },
            });
          }
        },
      });
    } else {
      // Identidade externa Google confirmada com sucesso
      plan.push({
        sourceTable: "Integration",
        recordId: leg.id,
        userEmail: user.email,
        provider: leg.provider,
        confirmedGoogleEmail: confirmedEmail,
        externalUserId,
        needsAccessTokenEncryption: needsAccessEncrypt,
        needsRefreshTokenEncryption: needsRefreshEncrypt,
        status: "REQUIRES_ENCRYPTION",
        reason: `Identidade Google confirmada como '${confirmedEmail}'. Migrando tokens com criptografia.`,
        action: async () => {
          await (prisma as any).connectedAccount.upsert({
            where: {
              userId_provider_email: {
                userId: user.id,
                provider: "GOOGLE",
                email: confirmedEmail,
              },
            },
            update: {
              status: "CONNECTED",
              externalUserId,
              accessToken: needsAccessEncrypt ? encryptToken(leg.accessToken) : leg.accessToken,
              refreshToken: needsRefreshEncrypt ? encryptToken(leg.refreshToken) : leg.refreshToken,
              expiresAt: leg.expiresAt,
            },
            create: {
              userId: user.id,
              provider: "GOOGLE",
              externalUserId,
              email: confirmedEmail,
              name: resolvedIdentity?.name ?? user.name ?? "Google Pessoal",
              label: confirmedEmail.endsWith("@gmail.com") ? "Google — pessoal" : "Google — profissional",
              accountType: confirmedEmail.endsWith("@gmail.com") ? "PERSONAL" : "WORK",
              status: "CONNECTED",
              accessToken: needsAccessEncrypt ? encryptToken(leg.accessToken) : leg.accessToken,
              refreshToken: needsRefreshEncrypt ? encryptToken(leg.refreshToken) : leg.refreshToken,
              expiresAt: leg.expiresAt,
            },
          });

          // Criptografa também na tabela legada
          if (needsAccessEncrypt || needsRefreshEncrypt) {
            await prisma.integration.update({
              where: { id: leg.id },
              data: {
                accessToken: needsAccessEncrypt ? encryptToken(leg.accessToken) : leg.accessToken,
                refreshToken: needsRefreshEncrypt ? encryptToken(leg.refreshToken) : leg.refreshToken,
              },
            });
          }
        },
      });
    }
  }

  // 5. Apresentação do Plano Detalhado
  console.log("\n------------------------------------------------------------------");
  console.log(" PLANO DE MIGRAÇÃO IDENTIFICADO (Item a Item)");
  console.log("------------------------------------------------------------------");

  if (plan.length === 0) {
    console.log("✨ Nenhum registro requer saneamento. Todos os tokens já estão devidamente cifrados.");
  } else {
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      const icon = item.status === "PENDING_REVIEW_UNCONFIRMED_IDENTITY" ? "⚠️" : "🔒";
      console.log(`\n[${i + 1}/${plan.length}] ${icon} Tabela: ${item.sourceTable} | ID: ${item.recordId}`);
      console.log(`   Usuário: ${item.userEmail} | Provedor: ${item.provider}`);
      console.log(`   Identidade Google Confirmada: ${item.confirmedGoogleEmail ?? "NÃO CONFIRMADA (PENDENTE DE REVISÃO)"}`);
      console.log(`   Criptografar Access Token: ${item.needsAccessTokenEncryption ? "SIM" : "NÃO (Já cifrado ou ausente)"}`);
      console.log(`   Criptografar Refresh Token: ${item.needsRefreshTokenEncryption ? "SIM" : "NÃO (Já cifrado ou ausente)"}`);
      console.log(`   Diagnóstico: ${item.reason}`);
    }
  }

  console.log("\n==================================================================");
  console.log(` RESUMO: ${plan.length} ação(ões) mapeadas | ${plan.filter((p) => p.status === "PENDING_REVIEW_UNCONFIRMED_IDENTITY").length} pendente(s) de revisão`);
  console.log("==================================================================");

  if (!isExecute) {
    console.log("\nℹ️ MODO DRY-RUN: Nenhuma alteração foi persistida no banco.");
    console.log("Para aplicar as alterações mapeadas com segurança, execute:");
    console.log("  npx tsx scripts/migrate-legacy-tokens.ts --execute\n");
  } else {
    console.log("\n🚀 Executando ações de migração e criptografia...");
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      process.stdout.write(` [${i + 1}/${plan.length}] Aplicando ${item.sourceTable}:${item.recordId}... `);
      await item.action();
      console.log("✅");
    }
    console.log("\n🎉 Migração e criptografia executadas com sucesso!");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erro no script de migração:", err);
  process.exit(1);
});
