# Painel da Vida

Dashboard pessoal para centralizar agenda, tarefas, e-mails, alertas e resumo diário.

## Stack
Next.js · React · TypeScript · Tailwind CSS · Prisma · PostgreSQL · Lucide

## Rodando localmente
```bash
npm install
npm run dev
```

Abra http://localhost:3000

Para usar os fixtures locais, defina `DEMO_MODE=true` e `NEXT_PUBLIC_DEMO_MODE=true` no `.env`. Sem essas opções, o servidor não substitui falhas de banco ou OAuth por dados simulados.

## Banco
Use os dados de demonstração somente com os dois flags de demo ativados. O schema Prisma prepara os modelos usados pela aplicação.

```bash
cp .env.example .env
npx prisma generate
npx prisma db push
```

## Próximas etapas
1. Persistência real das tarefas
2. Autenticação
3. Google Calendar
4. Gmail
5. Sincronização automática
6. Resumo diário com IA
7. Alertas inteligentes
8. Deploy na Vercel

## Banco de dados

O projeto usa PostgreSQL com Prisma. Para ativar a persistência real na Vercel:

1. Crie/conecte um PostgreSQL ao projeto na Vercel (Neon é uma opção adequada).
2. Configure a variável `DATABASE_URL` no ambiente **Production** e também em **Preview**, se quiser testar previews.
3. Faça um novo deploy após salvar a variável.
4. No primeiro deploy com o banco disponível, execute `npx prisma db push` em um ambiente que tenha acesso à mesma `DATABASE_URL`, ou use uma etapa de migração no CI/CD.

A API de tarefas fica em `/api/tasks`; sem banco, ela retorna erro fora do modo demo.

### Próxima etapa

Depois que PostgreSQL, OAuth e integrações estiverem configurados, o painel trabalha com os dados reais. Use o modo demo apenas para desenvolvimento e demonstrações.


## Modo demo e produção

O modo demo deve ser ativado explicitamente com `DEMO_MODE=true` e `NEXT_PUBLIC_DEMO_MODE=true` para que servidor e interface usem os mesmos fixtures. Ele usa dados simulados em memória e pode manter alterações durante a vida do processo; não é armazenamento durável e reinicializações podem restaurar os dados de demonstração. O seed é aplicado somente na criação do armazenamento demo, não a cada leitura ou alteração.

Em produção, use `DEMO_MODE=false` (ou deixe a variável ausente), configure `DATABASE_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET` e `CRON_SECRET`. Falhas do PostgreSQL são retornadas como erros e não trocam para dados demo. Conecte Gmail e Google Calendar para consultar essas integrações; sem conexão, as rotas informam que ela está ausente.

## Monitoramento de preços

Cadastre cada produto com uma URL HTTPS pública que exponha preço em JSON-LD Product/Offer, metadados `product:price:amount` / `og:price:amount`, ou `itemprop=price`. A cada coleta o servidor valida o destino público, baixa a página, normaliza o preço BRL, grava `PriceHistory`, atualiza atual/mínimo/máximo/média e cria um `PriceAlert` quando o preço alcança o alvo. Falhas de coleta aparecem no resultado do cron; nenhum preço simulado é usado em produção.

Configure `CRON_SECRET` na Vercel. O agendamento em `vercel.json` executa a coleta diariamente às 10:00 UTC (07:00 no horário de Brasília), compatível com o plano Hobby. Também é possível clicar em **Consultar preços agora** no painel para iniciar uma coleta manual autenticada dos seus produtos ativos. O primeiro deploy com o novo schema também precisa aplicar `npx prisma db push` ou uma migração Prisma equivalente antes de chamar essas rotas.
