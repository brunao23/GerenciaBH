# GerenciaBH — Regras de Código

- Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4, Supabase direto (sem ORM)
- Multi-tenant: JWT com unitPrefix, helper `getTenantFromRequest()` em `lib/helpers/api-tenant.ts`
- `npm install --legacy-peer-deps` obrigatório
- Responda sempre em PT-BR, direto ao código, sem explicações longas
- Priorize editar arquivos existentes. Não crie arquivos desnecessários
- Nunca commite .env, credentials ou chaves