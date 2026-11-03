# Painel da Vida

> **Central inteligente de produtividade pessoal**: transforme informações dispersas em prioridades claras, acompanhe compromissos e prazos, identifique contas a vencer e visualize seus ambientes pessoal e profissional com total controle.

---

## 1. Apresentação e Objetivo

O **Painel da Vida** foi concebido para um usuário único como um assistente de produtividade proativo. Mais do que um simples dashboard agregador de feeds, o sistema atua como um **filtro inteligente**:

```
Fontes de Dados (Google / M365)
          │
          ▼
Validação & Criptografia Segura (AES-256-GCM)
          │
          ▼
Motor de Prioridades & Conflitos
          │
          ▼
Dashboard Unificado (Geral, Pessoal, Profissional)
          │
          ▼
Ações Proativas (Resumo Matinal, Notificações, Tarefas)
```

O objetivo central é responder em **30 segundos**:
1. *Quais são os meus compromissos inadiáveis de hoje?*
2. *Existem conflitos de horário entre minha vida pessoal e o trabalho?*
3. *Quais e-mails exigem resposta hoje e não podem esperar?*
4. *Quais contas ou boletos vencem nos próximos dias?*
5. *Quais tarefas operacionais são prioritárias?*

---

## 2. Funcionalidades: Implementadas vs. Planejadas

Para transparência operacional, o status de cada recurso está detalhado abaixo:

### ✅ Realmente Implementadas e Operacionais
- **Autenticação Desacoplada do Painel:** Sessão persistente de 30 dias via NextAuth (JWT) com proteção de rotas privadas.
- **Múltiplas Contas Google Conectadas:** Vinculação simultânea de contas pessoais (`@gmail.com`) e profissionais (`Google Workspace`) no modelo `ConnectedAccount`.
- **Criptografia em Repouso com AES-256-GCM:** Tokens OAuth cifrados com vetor de inicialização único e autenticação de integridade (GCM Auth Tag).
- **Proteção OAuth CSRF Multi-Fator:** Nonce imprevisível (256 bits), vínculo criptográfico à sessão ativa, assinatura HMAC, expiração (10 min) e consumo de uso único no servidor.
- **Google Calendar Multi-Conta:** Consulta cronológica unificada ou filtrada por conta com suporte a fusos horários.
- **Detecção Cruzada de Conflitos de Agenda:** Identificação automática em tempo real de compromissos sobrepostos entre contas diferentes (ex.: consulta médica pessoal no mesmo horário de reunião corporativa).
- **Gmail Consolidado com Classificação:** Leitura de e-mails com identificação da conta de origem e categorização em `RESPOND_TODAY`, `FOLLOW_UP`, `INFORMATIVE` e `NOISE`.
- **Criação de Tarefas a partir de E-mails:** Associação bidirecional de mensagens a tarefas com prevenção de duplicatas (`Task.emailId`).
- **Detecção Heurística e por IA de Boletos:** Varredura de e-mails para identificação de vencimentos, valores, códigos PIX e geração automática de tarefas para contas a vencer em 10 dias.
- **Monitor de Preços de Produtos:** Coleta segura com validação de SSRF para URLs HTTPS públicas, extração de JSON-LD/OpenGraph e busca com IA.
- **Síntese Diária ("Seu dia em 30 segundos"):** Bloco matinal no dashboard consolidando pendências urgentes.
- **Tarefas Agendadas (Vercel Cron):** Rotas protegidas por `Bearer CRON_SECRET` executando diariamente às 10:00 UTC (07:00 BRT).

### ⏳ Planejadas para as Próximas Etapas (Roadmap)
- **Integração Microsoft 365 (Profissional):** Conexão via Microsoft Entra ID e Microsoft Graph API para leitura de Outlook e Outlook Calendar com permissões delegadas e somente leitura (`Mail.Read`, `Calendars.Read`).
- **Extração de Boletos em Anexos PDF:** Download e processamento direto de faturas anexadas em PDF no Gmail.
- **Validação Matemática de Boletos e PIX:** Conferência de dígitos verificadores de linha digitável (Módulo 10/11) e payload PIX (BR Code / EMVCo).
- **Módulo de Aniversários e Datas Importantes:** Cadastro de eventos recorrentes anuais com alertas configuráveis.
- **Central Unificada de Notificações:** Registro persistente de notificações com controle de retentativas, deduplicação e histórico.
- **Notificações via WhatsApp Business Cloud API:** Disparo de mensagens proativas (outbound) de um número empresarial verificado para o WhatsApp pessoal do usuário, sem leitura de conversas privadas.

---

## 3. Arquitetura e Tecnologias

- **Framework Web:** [Next.js 15+](https://nextjs.org/) (App Router, Server Components e Server Actions).
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/) com tipagem estrita.
- **Estilização & UI:** [Tailwind CSS v4](https://tailwindcss.com/) com ícones [Lucide React](https://lucide.dev/).
- **Banco de Dados:** [PostgreSQL](https://www.postgresql.org/) hospedado no [Neon](https://neon.tech/) via Vercel Integration.
- **ORM:** [Prisma ORM v6](https://www.prisma.io/) com pooler para runtime e conexão direta para migrations.
- **Autenticação:** [NextAuth v5 / Auth.js](https://authjs.dev/) com JWT assinado.
- **Segurança Criptográfica:** Módulo nativo `node:crypto` com cifra `aes-256-gcm` e chave de 256 bits.
- **Inteligência Artificial:** [Vercel AI SDK](https://sdk.vercel.ai/) com suporte ao AI Gateway e fallbacks determinísticos.
- **Hospedagem & Agendamento:** [Vercel](https://vercel.com/) com Vercel Cron Jobs.

---

## 4. Separação entre Ambiente Pessoal e Profissional

O Painel da Vida implementa isolamento de dados na camada de armazenamento e oferece três modos de visualização na camada de consulta:

| Modo de Visualização | Escopo dos Dados | Indicador Visual |
| :--- | :--- | :---: |
| **Geral (Consolidado)** | Mescla eventos e e-mails de todas as contas ativas em ordem cronológica estrita. | `Todas as contas` |
| **Pessoal** | Restringe visualização aos dados originados do Google Pessoal (`@gmail.com`). | Badge verde `👤 Pessoal` |
| **Profissional** | Restringe aos dados corporativos (`Google Workspace` e, na próxima etapa, `Microsoft 365 Outlook`). | Badge roxo `💼 Profissional` |

A consolidação ocorre na camada de apresentação: registros originais nunca são fundidos nem alterados. A desconexão de uma conta profissional não afeta os dados nem a conexão da conta pessoal.

---

## 5. Estrutura das Integrações Google e Preparação para Microsoft 365

O modelo central é a tabela `ConnectedAccount`:

```prisma
enum AccountProvider {
  GOOGLE
  MICROSOFT
}

enum ConnectedAccountType {
  PERSONAL
  WORK
  OTHER
}

model ConnectedAccount {
  id             String               @id @default(cuid())
  userId         String
  provider       AccountProvider      @default(GOOGLE)
  accountType    ConnectedAccountType @default(PERSONAL)
  email          String
  name           String?
  label          String?              // Ex: "Google — pessoal", "M365 — empresa"
  accessToken    String?              // enc:v1:<iv>:<tag>:<cipher> (AES-256-GCM)
  refreshToken   String?              // enc:v1:<iv>:<tag>:<cipher> (AES-256-GCM)
  expiresAt      DateTime?
  status         ConnectionStatus     @default(CONNECTED)
  lastSyncAt     DateTime?
  // ...
  @@unique([userId, provider, email])
}
```

### Por que esta arquitetura suporta Microsoft 365 nativamente?
1. **Unicidade Composta:** A restrição `@@unique([userId, provider, email])` permite que o mesmo usuário tenha uma conta `provider = GOOGLE` e outra `provider = MICROSOFT` sem qualquer colisão de chaves.
2. **Preservação de Tokens:** O serviço `upsertConnectedAccount` preserva o `refreshToken` quando um provedor não devolve novo token offline em reautorizações subsequentes.
3. **Renovação Modular:** A função `refreshAccountToken` roteia para o endpoint do Google (`oauth2.googleapis.com/token`) ou da Microsoft (`login.microsoftonline.com/common/oauth2/v2.0/token`) conforme o enum `provider`.

---

## 6. Instalação e Execução Local Passo a Passo

### Pré-requisitos
- Node.js 20+ (ou Bun 1.1+)
- Git
- Instância local do PostgreSQL ou projeto Neon gratuito

### 1. Clonar o repositório
```bash
git clone https://github.com/fabioteraoka/painel-da-vida.git
cd painel-da-vida
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Copie o modelo de ambiente:
```bash
cp .env.example .env
```
Preencha o `.env` com as configurações locais:
- Gere sua `ENCRYPTION_KEY`:
  ```bash
  openssl rand -base64 32
  ```
- Gere seu `AUTH_SECRET`:
  ```bash
  openssl rand -base64 32
  ```
- Defina `DATABASE_URL` e `DATABASE_URL_UNPOOLED` com sua conexão PostgreSQL.

### 4. Inicializar o Banco de Dados
```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Executar em Desenvolvimento
```bash
npm run dev
```
Acesse: [http://localhost:3000](http://localhost:3000)

*Nota:* Para rodar localmente sem banco de dados (apenas interface com dados simulados em memória), configure no `.env`:
`DEMO_MODE="true"` e `NEXT_PUBLIC_DEMO_MODE="true"`. O servidor bloqueia essa opção automaticamente quando `NODE_ENV === "production"`.

---

## 7. Configuração do PostgreSQL e Prisma

O projeto utiliza duas strings de conexão para compatibilidade com connection poolers (PgBouncer/Neon/Supabase):

1. **`DATABASE_URL` (Pooled):** Utilizada pelas rotas da aplicação para conexões rápidas e escaláveis via pooler de transações.
2. **`DATABASE_URL_UNPOOLED` (Direct):** Conexão direta ao PostgreSQL (porta 5432 sem pooler), obrigatória para a execução estável de comandos DDL (`prisma migrate`).

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}
```

### Executar Migrações Manualmente
```bash
npx prisma migrate deploy
```

---

## 8. Configuração da Vercel e Processo de Deploy

### 1. Conexão do Repositório
No painel da Vercel:
1. `Add New` → `Project` → Importar `fabioteraoka/painel-da-vida`.
2. Framework Preset: **Next.js**.

### 2. Banco de Dados na Vercel (Neon Postgres)
1. Na aba **Storage** do projeto Vercel, clique em **Connect Database** e selecione **Neon**.
2. A integração injeta automaticamente as variáveis de banco de dados (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_PRISMA_URL`, etc.) em todos os ambientes (Production, Preview, Development).

### 3. Execução das Migrações no Build
O script `package.json` define:
```json
"build": "node scripts/deploy-migrations.mjs && prisma generate && NODE_ENV=production next build"
```
O arquivo `scripts/deploy-migrations.mjs` verifica a presença de `process.env.VERCEL === "1"`. Durante o deploy na Vercel, ele sincroniza as migrations versionadas (`prisma migrate deploy`) antes de compilar o bundle. Fora da Vercel, o script não executa migrações automáticas.

---

## 9. Autenticação e Segurança

### 1. Isolamento Estrito do Modo Demo em Produção
Em `lib/prisma.ts`:
```typescript
const isProduction = process.env.NODE_ENV === "production";
export const isDemoMode = !isProduction && (isExplicitDemo || hasNoDb);
```
Em produção, `isDemoMode` é **estritamente `false`**. Caso o banco fique temporariamente inacessível, o sistema responde com erro seguro 503 e **nunca** concede acesso simulado anônimo.

### 2. Criptografia em Repouso (AES-256-GCM)
- Chave derivada exclusivamente de `ENCRYPTION_KEY` com SHA-256.
- A chave exige entropia mínima comprovada de pelo menos 32 caracteres.
- Formato do envelope: `enc:v1:<iv_12bytes_hex>:<authTag_16bytes_hex>:<ciphertext_hex>`.
- Rejeição estrita de strings iniciadas por `enc:` que não atendam à expressão regular de validação.
- Nenhum token em texto puro é aceito ou armazenado.

### 3. Proteção CSRF no OAuth Google
O parâmetro `state` gerado em `/api/integrations/google/connect` cumpre 6 requisitos criptográficos:
1. **Nonce Imprevisível:** 32 bytes de alta entropia gerados com `crypto.randomBytes(32)` (256 bits).
2. **Vínculo à Sessão:** Hash SHA-256 do e-mail do usuário autenticado incluído no payload.
3. **Expiração Temporal:** Validade máxima de 10 minutos verificada no callback.
4. **Assinatura HMAC:** Assinado com chave secreta do servidor e verificado com `crypto.timingSafeEqual`.
5. **Consumo Único no Servidor:** Registro atômico de nonces consumidos no servidor, bloqueando ataques de repetição (replay) e chamadas concorrentes.
6. **Consumo do Cookie:** Invalidação imediata do cookie no navegador após a primeira leitura.

---

## 10. Inventário das Variáveis de Ambiente

| Variável | Obrigatoriedade | Onde é Utilizada | Função |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Obrigatória** | `schema.prisma`, `lib/prisma.ts` | Conexão PostgreSQL (com pooling). Automática via Vercel Neon. |
| `DATABASE_URL_UNPOOLED` | **Obrigatória** | `schema.prisma`, `deploy-migrations.mjs` | Conexão direta PostgreSQL (sem pooling) para migrations. |
| `ENCRYPTION_KEY` | **Obrigatória** | `lib/crypto.ts`, scripts | Chave de 32+ caracteres para criptografia AES-256-GCM dos tokens. |
| `AUTH_SECRET` | **Obrigatória** | `auth.ts`, `google-integration-oauth.ts` | Assinatura da sessão JWT (NextAuth) e assinatura HMAC do OAuth state. |
| `GOOGLE_CLIENT_ID` | **Obrigatória** | `auth.ts`, `lib/google-integration-oauth.ts` | Client ID do Google OAuth 2.0 (Google Cloud Console). |
| `GOOGLE_CLIENT_SECRET` | **Obrigatória** | `auth.ts`, `lib/google-integration-oauth.ts` | Client Secret do Google OAuth 2.0. |
| `CRON_SECRET` | **Obrigatória** | `app/api/cron/bills`, `app/api/cron/prices` | Segredo para validação do header `Authorization: Bearer <CRON_SECRET>`. |
| `AI_GATEWAY_API_KEY` | Opcional | `lib/ai-gateway.ts` | Chave do Vercel AI Gateway (se ausente, usa heurísticas/regex). |
| `AI_MODEL` | Opcional | `lib/ai-gateway.ts` | Identificador do modelo de IA (padrão: `openai/gpt-4o-mini`). |
| `DEMO_MODE` | Opcional | `lib/prisma.ts` | `true` apenas para desenvolvimento local offline. Bloqueado em produção. |
| `NEXT_PUBLIC_DEMO_MODE`| Opcional | `components/dashboard/dashboard.tsx` | Espelhamento no cliente para exibição de fixtures em dev. |

### Configuração Recomendada por Ambiente:
- **Production (Vercel):** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`.
- **Preview (Vercel):** Mesmas variáveis de Production (apontando preferencialmente para branch do Neon).
- **Development (Local):** Arquivo `.env` local com as chaves de teste ou `DEMO_MODE="true"` para desenvolvimento desconectado.

---

## 11. Cron Jobs e Agendamentos

Configurados em `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/bills",
      "schedule": "0 10 * * *"
    },
    {
      "path": "/api/cron/prices",
      "schedule": "0 10 * * *"
    }
  ]
}
```

- **Frequência:** Diariamente às 10:00 UTC (07:00 no Horário de Brasília).
- **Compatibilidade:** Totalmente compatível com o plano Vercel Hobby (limite de 1 execução diária por cron job).
- **Segurança:** O endpoint exige `Authorization: Bearer <CRON_SECRET>`. A Vercel injeta esse cabeçalho automaticamente ao disparar o cron quando `CRON_SECRET` está configurada nas variáveis do projeto.
- **Duração Máxima:** Ambas as rotas possuem `export const maxDuration = 60;` para evitar interrupções precoces.

---

## 12. Diagnóstico de Problemas Comuns (Troubleshooting)

### 1. Erro `[Crypto] ENCRYPTION_KEY ausente ou insegura`
- **Causa:** A variável `ENCRYPTION_KEY` não foi definida no ambiente ou possui menos de 32 caracteres.
- **Solução:** Gere uma chave de 32 bytes (`openssl rand -base64 32`) e adicione ao painel da Vercel ou `.env`.

### 2. Erro de autenticação Google: `oauth_csrf_validation_failed`
- **Causa:** O cookie de state expirou (mais de 10 minutos), houve troca de navegador/aba durante o consentimento, ou o callback foi disparado por sessão de outro usuário.
- **Solução:** Inicie o fluxo novamente clicando em `Gerenciar contas` → `+ Adicionar conta Google`.

### 3. Falha de integridade ao descriptografar token Google
- **Causa:** A variável `ENCRYPTION_KEY` foi alterada após os tokens terem sido salvos no banco de dados. Como o AES-GCM valida a integridade com Auth Tag, tokens cifrados com uma chave anterior não podem ser decifrados com a nova chave.
- **Solução:** Na interface, a conta será marcada com status `ERROR`. Clique em `Reconectar conta` para autorizar novamente e gravar novos tokens com a chave atual.

### 4. Erro `CRON_SECRET não está configurado` ao chamar `/api/cron/*`
- **Causa:** A variável `CRON_SECRET` não foi adicionada no painel da Vercel.
- **Solução:** Adicione a variável `CRON_SECRET` nas configurações do projeto na Vercel com um valor forte.

---

## 13. Procedimentos de Backup e Recuperação

### 1. Backup Completo de Dados e Tokens (PostgreSQL)
Execute antes de qualquer migração estrutural:
```bash
pg_dump -d "$DATABASE_URL_UNPOOLED" \
  -t '"ConnectedAccount"' \
  -t '"Integration"' \
  -t '"User"' \
  -t '"Bill"' \
  -t '"Task"' \
  -F c -f backup_painel_$(date +%Y%m%d_%H%M%S).dump
```

### 2. Validação da Criptografia dos Tokens
Verifique se 100% dos registros ativos estão protegidos com AES-256-GCM:
```sql
SELECT
  id,
  email,
  provider,
  status,
  CASE
    WHEN "accessToken" LIKE 'enc:v1:%' THEN 'CRIPTOGRAFADO_AES_GCM'
    ELSE 'TEXTO_PURO_VULNERAVEL'
  END AS status_token
FROM "ConnectedAccount";
```

### 3. Restauração (Rollback)
Caso necessite reverter para o backup:
```bash
pg_restore -d "$DATABASE_URL_UNPOOLED" --clean --if-exists backup_painel_*.dump
```

---

## 14. Roadmap das Próximas Etapas

```
[Etapa Atual: Etapa 1 - Estabilização & Segurança Concluída]
                           │
                           ▼
[Etapa 2: Microsoft 365 Profissional]
 ├── Registro de App no Microsoft Entra ID (Delegated Permissions)
 ├── OAuth 2.0 PKCE / Authorization Code com M365
 ├── Serviço Microsoft Graph: Outlook (Mail.Read) e Calendar (Calendars.Read)
 └── Normalização nos filtros do Dashboard: Geral | Pessoal | Profissional
                           │
                           ▼
[Etapa 3: Inteligência de Boletos & Gestão Financeira]
 ├── Extração de anexos PDF no Gmail
 ├── Validação matemática de linha digitável (Módulos 10 e 11) e payload PIX
 └── Deduplicação inteligente de faturas
                           │
                           ▼
[Etapa 4: Central de Notificações & WhatsApp]
 ├── Tabela de Notificações centralizada com deduplicação e retentativas
 └── Driver desacoplado para WhatsApp Business Cloud API (outbound)
```
