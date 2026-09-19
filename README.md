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

## Banco
A V1 usa dados demonstrativos. O schema Prisma já está preparado.

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

A API de tarefas fica em `/api/tasks` e já possui fallback de erro quando o banco ainda não está configurado.

### Próxima etapa

Depois que o PostgreSQL estiver conectado, o painel poderá migrar as tarefas do armazenamento local para o banco. Em seguida entraremos com autenticação e Google Calendar/Gmail.
