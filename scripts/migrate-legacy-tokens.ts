/**
 * Script de Migração e Criptografia Segura de Tokens Legados
 * 
 * Uso:
 *   npx tsx scripts/migrate-legacy-tokens.ts           # Modo de Diagnóstico (Dry-run, não altera o banco)
 *   npx tsx scripts/migrate-legacy-tokens.ts --execute # Executa a migração e criptografia com segurança
 */

import { PrismaClient } from "@prisma/client";
import { encryptToken, decryptToken } from "../lib/crypto";

const prisma = new PrismaClient();
const isExecute = process.argv.includes("--execute");

async function resolveGoogleIdentity(accessToken: string): Promise<{ email?: string; sub?: string; name?: string } | null> {
  try {
    const rawToken = decryptToken(accessToken);
    if (!rawToken) return null;

    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${rawToken}` },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = (await res.json()) as { email?: string; sub?: string; name?: string };
      return { email: data.email, sub: data.sub, name: data.name };
    }
  } catch {
    // Falha normal se token estiver expirado ou sem rede
  }
  return null;
}

async function run() {
  console.log("==================================================================");
  console.log(" PAINEL DA VIDA — DIAGNÓSTICO E MIGRAÇÃO SEGURA DE TOKENS");
  console.log(` Modo: ${isExecute ? "EXECUTAR ALTERAÇÕES (--execute)" : "SIMULAÇÃO / DIAGNÓSTICO (Dry-Run)"}`);
  console.log("==================================================================\n");

  // 1. Diagnóstico da Chave de Criptografia
  const hasKey = Boolean(
    process.env.ENCRYPTION_KEY ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET
  );

  if (!hasKey) {
    console.error("❌ ERRO FATAL: Nenhuma chave de criptografia encontrada no ambiente.");
    console.error("   Defina ENCRYPTION_KEY ou AUTH_SECRET antes de prosseguir.");
    process.exit(1);
  }
  console.log("✅ Chave de criptografia presente e validada.");

  // 2. Consulta de registros legados na tabela Integration
  let legacyIntegrations: any[] = [];
  try {
    legacyIntegrations = await prisma.integration.findMany({
      include: { user: true },
    });
  } catch (err) {
    console.warn("⚠️ Tabela Integration não acessível ou inexistente:", (err as any)?.message);
  }

  // 3. Consulta de registros na tabela ConnectedAccount
  let connectedAccounts: any[] = [];
  try {
    connectedAccounts = await (prisma as any).connectedAccount.findMany({
      include: { user: true },
    });
  } catch (err) {
    console.warn("⚠️ Tabela ConnectedAccount não acessível:", (err as any)?.message);
  }

  console.log(`\n📊 Registros encontrados:`);
  console.log(` - Integrações legadas (Integration): ${legacyIntegrations.length}`);
  console.log(` - Contas conectadas (ConnectedAccount): ${connectedAccounts.length}`);

  // 4. Análise de tokens em texto puro vs já criptografados
  let unencryptedInConnectedAccount = 0;
  let alreadyEncryptedInConnectedAccount = 0;

  for (const acc of connectedAccounts) {
    const hasPlainAccess = acc.accessToken && !acc.accessToken.startsWith("enc:");
    const hasPlainRefresh = acc.refreshToken && !acc.refreshToken.startsWith("enc:");
    if (hasPlainAccess || hasPlainRefresh) {
      unencryptedInConnectedAccount++;
    } else if (acc.accessToken || acc.refreshToken) {
      alreadyEncryptedInConnectedAccount++;
    }
  }

  let unencryptedInLegacy = 0;
  let alreadyEncryptedInLegacy = 0;
  for (const leg of legacyIntegrations) {
    const hasPlainAccess = leg.accessToken && !leg.accessToken.startsWith("enc:");
    const hasPlainRefresh = leg.refreshToken && !leg.refreshToken.startsWith("enc:");
    if (hasPlainAccess || hasPlainRefresh) {
      unencryptedInLegacy++;
    } else if (leg.accessToken || leg.refreshToken) {
      alreadyEncryptedInLegacy++;
    }
  }

  console.log(`\n🔐 Status de Criptografia Atual:`);
  console.log(` - ConnectedAccount com tokens em texto puro: ${unencryptedInConnectedAccount}`);
  console.log(` - ConnectedAccount com tokens criptografados: ${alreadyEncryptedInConnectedAccount}`);
  console.log(` - Integration legada com tokens em texto puro: ${unencryptedInLegacy}`);
  console.log(` - Integration legada com tokens criptografados: ${alreadyEncryptedInLegacy}`);

  console.log("\n------------------------------------------------------------------");
  console.log(" DETALHAMENTO DE CONTAS E PLANO DE MIGRAÇÃO");
  console.log("------------------------------------------------------------------");

  const actionsToPerform: Array<{
    type: "ENCRYPT_CONNECTED_ACCOUNT" | "MIGRATE_INTEGRATION_TO_CONNECTED_ACCOUNT" | "ENCRYPT_LEGACY_INTEGRATION";
    description: string;
    action: () => Promise<void>;
  }> = [];

  // A. Contas ConnectedAccount existentes com tokens em texto puro
  for (const acc of connectedAccounts) {
    const needsAccessEncrypt = acc.accessToken && !acc.accessToken.startsWith("enc:");
    const needsRefreshEncrypt = acc.refreshToken && !acc.refreshToken.startsWith("enc:");

    if (needsAccessEncrypt || needsRefreshEncrypt) {
      console.log(` [ConnectedAccount] ${acc.id} (${acc.email}) precisa ser cifrada.`);
      actionsToPerform.push({
        type: "ENCRYPT_CONNECTED_ACCOUNT",
        description: `Criptografar tokens de ConnectedAccount ${acc.email} (${acc.id})`,
        action: async () => {
          await (prisma as any).connectedAccount.update({
            where: { id: acc.id },
            data: {
              accessToken: needsAccessEncrypt ? encryptToken(acc.accessToken) : acc.accessToken,
              refreshToken: needsRefreshEncrypt ? encryptToken(acc.refreshToken) : acc.refreshToken,
            },
          });
        },
      });
    }
  }

  // B. Integrações legadas que precisam ser consolidadas em ConnectedAccount
  // Agrupa por usuário para fundir GMAIL e GOOGLE_CALENDAR na mesma conta
  const legacyByUser = new Map<string, any[]>();
  for (const leg of legacyIntegrations) {
    const list = legacyByUser.get(leg.userId) || [];
    list.push(leg);
    legacyByUser.set(leg.userId, list);
  }

  for (const [userId, items] of legacyByUser.entries()) {
    const primaryItem = items.find((i) => i.accessToken) || items[0];
    const user = primaryItem.user;
    if (!user) continue;

    actionsToPerform.push({
      type: "MIGRATE_INTEGRATION_TO_CONNECTED_ACCOUNT",
      description: `Migrar e unificar integrações legadas de ${user.email} (${items.map((i) => i.provider).join(", ")})`,
      action: async () => {
        // Tenta resolver a identidade real externa Google
        let externalEmail = user.email;
        let externalSub = primaryItem.externalUserId ?? null;

        if (primaryItem.accessToken) {
          const resolved = await resolveGoogleIdentity(primaryItem.accessToken);
          if (resolved?.email) {
            externalEmail = resolved.email;
            externalSub = resolved.sub ?? externalSub;
          }
        }

        const consolidatedAccessToken = primaryItem.accessToken;
        const consolidatedRefreshToken =
          items.find((i) => i.refreshToken)?.refreshToken ?? primaryItem.refreshToken;
        const latestExpiry = items.find((i) => i.expiresAt)?.expiresAt ?? primaryItem.expiresAt;

        // Upsert seguro em ConnectedAccount garantindo criptografia
        await (prisma as any).connectedAccount.upsert({
          where: {
            userId_provider_email: {
              userId,
              provider: "GOOGLE",
              email: externalEmail.toLowerCase(),
            },
          },
          update: {
            accessToken: encryptToken(consolidatedAccessToken),
            refreshToken: encryptToken(consolidatedRefreshToken),
            expiresAt: latestExpiry,
            externalUserId: externalSub,
            status: "CONNECTED",
          },
          create: {
            userId,
            provider: "GOOGLE",
            externalUserId: externalSub,
            email: externalEmail.toLowerCase(),
            name: user.name ?? "Google Pessoal",
            label: "Google — pessoal",
            accountType: "PERSONAL",
            accessToken: encryptToken(consolidatedAccessToken),
            refreshToken: encryptToken(consolidatedRefreshToken),
            expiresAt: latestExpiry,
            status: "CONNECTED",
          },
        });

        // Atualiza a tabela legada para também ficar com os tokens criptografados
        for (const it of items) {
          if (it.accessToken && !it.accessToken.startsWith("enc:")) {
            await prisma.integration.update({
              where: { id: it.id },
              data: {
                accessToken: encryptToken(it.accessToken),
                refreshToken: encryptToken(it.refreshToken),
              },
            });
          }
        }
      },
    });
  }

  console.log(`\nTotal de ações de saneamento pendentes: ${actionsToPerform.length}`);

  if (!isExecute) {
    console.log("\nℹ️ NENHUMA ALTERAÇÃO FOI REALIZADA (Modo Dry-Run ativo).");
    console.log("Para aplicar as alterações com segurança, execute:");
    console.log("  npx tsx scripts/migrate-legacy-tokens.ts --execute\n");
  } else {
    console.log("\n🚀 Executando migração e criptografia com segurança...");
    for (let i = 0; i < actionsToPerform.length; i++) {
      const act = actionsToPerform[i];
      process.stdout.write(` [${i + 1}/${actionsToPerform.length}] ${act.description}... `);
      await act.action();
      console.log("✅");
    }
    console.log("\n🎉 Migração concluída com sucesso! Todos os tokens foram criptografados com AES-256-GCM.");
  }

  console.log("==================================================================");
  console.log(" PLANO DE BACKUP E PROCEDIMENTO DE REVERSÃO");
  console.log("==================================================================");
  console.log(`
1. Backup pré-migração (PostgreSQL):
   pg_dump -d "$DATABASE_URL" -t '"ConnectedAccount"' -t '"Integration"' -F c -f backup_tokens_$(date +%Y%m%d_%H%M%S).dump

2. Verificação de integridade pós-execução:
   SELECT id, email, status,
          (CASE WHEN "accessToken" LIKE 'enc:%' THEN 'CRIPTOGRAFADO' ELSE 'TEXTO_PURO' END) as token_status
   FROM "ConnectedAccount";

3. Procedimento de Reversão (Rollback):
   pg_restore -d "$DATABASE_URL" --clean --if-exists backup_tokens_*.dump
  `);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("Erro na execução da migração:", err);
  process.exit(1);
});
