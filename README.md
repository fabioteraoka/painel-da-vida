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