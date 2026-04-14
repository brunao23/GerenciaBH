# RELATÓRIO DE SEGURANÇA — GerenciaBH
**Data:** 2026-04-11  
**Analista:** Especialista Cyber Security (Claude)  
**Metodologia:** OWASP Top 10, SAST Manual, Threat Modeling  
**Escopo:** Código-fonte completo — APIs, autenticação, infra, webhooks

---

## SUMÁRIO EXECUTIVO

| Severidade | Qtd | Status |
|------------|-----|--------|
| CRITICAL   | 4   | Requer ação imediata |
| HIGH       | 6   | Corrigir antes do próximo release |
| MEDIUM     | 5   | Planejar para sprint atual |
| LOW / INFO | 4   | Melhorias futuras |
| **Total**  | **19** | |

**Risco geral: ALTO.** O sistema possui 4 vulnerabilidades críticas que permitem, em conjunto: forjar tokens JWT de admin, acessar dados de todos os 9 tenants, executar DDL arbitrário no banco, e criar tenants ilimitados sem autorização.

---

## VULNERABILIDADES CRÍTICAS

---

### [CRITICAL-01] JWT Secret com Fallback Hardcoded Público

```
Arquivo: lib/auth/jwt.ts — linha 3-5
         proxy.ts — linha 6
OWASP: A02 — Cryptographic Failures / CWE-798
```

**Código atual:**
```typescript
const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)
```

**Vetor de ataque:**
Se `JWT_SECRET` não estiver definida como variável de ambiente (configuração incorreta em qualquer ambiente), o sistema usa `'your-secret-key-change-in-production'` — uma string pública disponível no código-fonte do repositório GitHub.

**Impacto:**
Um atacante que conheça o fallback pode:
1. Forjar um token JWT válido com `isAdmin: true`
2. Obter acesso irrestrito ao painel admin
3. Ler, criar e deletar dados de todos os 9 tenants
4. Executar criação de unidades e replicação de workflows N8N

**Prova de conceito:**
```javascript
// Atacante gera token admin usando o secret público
const { SignJWT } = require('jose')
const secret = new TextEncoder().encode('your-secret-key-change-in-production')
const token = await new SignJWT({ isAdmin: true, unitPrefix: 'admin', unitName: 'Hacker', userId: 'hack' })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('7d')
  .sign(secret)
// Resultado: token válido aceito por TODOS os endpoints
```

**Remediação:**
```typescript
// lib/auth/jwt.ts — VERSÃO CORRIGIDA
const secret = process.env.JWT_SECRET
if (!secret || secret.length < 32) {
  throw new Error('[FATAL] JWT_SECRET não definido ou fraco (mínimo 32 chars). Abortando.')
}
const JWT_SECRET = new TextEncoder().encode(secret)
```

**Verificação:**
Remover a variável `JWT_SECRET` do `.env.local` temporariamente — o servidor deve recusar inicializar, não usar fallback.

---

### [CRITICAL-02] Senha Admin em Plain Text no Código-Fonte

```
Arquivo: lib/auth/utils.ts — linha 50-53
OWASP: A02 — Cryptographic Failures / CWE-259
```

**Código atual:**
```typescript
export const ADMIN_CREDENTIALS = {
    username: 'corelion_admin',
    password: process.env.ADMIN_PASSWORD || 'admin@corelion2024',
}
```

**Vetor de ataque:**
- A senha padrão `admin@corelion2024` está no código-fonte público no GitHub
- O username `corelion_admin` também está exposto
- Se `ADMIN_PASSWORD` não estiver definida, qualquer pessoa com acesso ao repo pode fazer login como admin

**Impacto:**
Acesso total ao painel administrativo: gerenciar todas as unidades, replicar workflows, executar migrations, acessar dados de todos os tenants.

**Agravante — comparação plain text:**
```typescript
// app/api/auth/admin/login/route.ts — linha 10
if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password)
```
Comparação com `!==` é vulnerável a **timing attacks**: a diferença de tempo entre comparações bem-sucedidas e falhas revela bytes corretos.

**Remediação:**
```typescript
// lib/auth/utils.ts — VERSÃO CORRIGIDA
import crypto from 'crypto'

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// app/api/auth/admin/login/route.ts — VERSÃO CORRIGIDA
const storedUser = process.env.ADMIN_USERNAME
const storedPass = process.env.ADMIN_PASSWORD

if (!storedUser || !storedPass) {
  return NextResponse.json({ error: 'Serviço indisponível' }, { status: 503 })
}

const usernameOk = timingSafeStringEqual(username, storedUser)
const passwordOk = timingSafeStringEqual(password, storedPass)

if (!usernameOk || !passwordOk) {
  return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
}
```

**Remover do código completamente** o objeto `ADMIN_CREDENTIALS` com valores padrão.

---

### [CRITICAL-03] Endpoint de Migrations Sem Autenticação Adequada + Secret Hardcoded

```
Arquivo: app/api/admin/migrations/run/route.ts — linhas 29, 109-119
OWASP: A01 — Broken Access Control / A02 — Cryptographic Failures
```

**Código atual:**
```typescript
const adminKey = process.env.ADMIN_MIGRATION_KEY || 'super-secret-migration-key';
```

**Vetor de ataque — duplo:**

**1) Secret hardcoded:**
`'super-secret-migration-key'` é público no GitHub. Qualquer um pode executar migrations arbitrárias.

**2) GET expõe informações de ataque:**
```typescript
export async function GET(req: NextRequest) {
    return NextResponse.json({
        available: Object.keys(MIGRATIONS),
        instructions: {
            header: 'x-admin-key: <sua-chave>',  // mapeia o vetor de ataque
        },
    })
}
// GET é acessível SEM autenticação — qualquer um pode ver o mapa de ataque
```

**Impacto:**
Execução arbitrária de SQL no banco Supabase via `exec_sql` RPC com `service_role`. Pode dropar tabelas, modificar dados de todos os tenants, escalar privilégios.

**Remediação:**
```typescript
// app/api/admin/migrations/run/route.ts — VERSÃO CORRIGIDA
export async function POST(req: NextRequest) {
  // 1. Verificar JWT admin — NÃO apenas header customizado
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value
  const session = token ? await verifyToken(token) : null
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Chave adicional — obrigatória, sem fallback
  const adminKey = process.env.ADMIN_MIGRATION_KEY
  if (!adminKey) throw new Error('ADMIN_MIGRATION_KEY não configurada')
  
  const headerKey = req.headers.get('x-admin-key')
  if (!crypto.timingSafeEqual(Buffer.from(headerKey ?? ''), Buffer.from(adminKey))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ...
}

// GET deve retornar 404 ou exigir auth também
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

---

### [CRITICAL-04] Endpoint de Registro Aberto — Criação de Tenants Sem Autorização

```
Arquivo: app/api/auth/register/route.ts — linhas 1-132
OWASP: A01 — Broken Access Control / A04 — Insecure Design
```

**Código atual:**
O endpoint `POST /api/auth/register` não requer autenticação de admin. Qualquer pessoa na internet pode:
1. Criar um novo tenant
2. Criar 15 tabelas no banco Supabase
3. Obter um token JWT válido imediatamente
4. Executar `create_new_unit` RPC no banco

**Vetor de ataque:**
```bash
# Loop criando centenas de tenants e tabelas
for i in {1..500}; do
  curl -X POST https://gerenciabh.vercel.app/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"unitName\": \"Tenant$i\", \"password\": \"12345678\", \"confirmPassword\": \"12345678\"}"
done
# Resultado: banco saturado com 7.500 tabelas (500 tenants × 15 tabelas)
```

**Impacto:**
- DoS no banco Supabase (limite de tabelas/conexões atingido)
- Novos tenants podem tentar acessar dados de outros se houver bugs no isolamento
- Custo crescente no Supabase

**Remediação:**
```typescript
// Opção 1 — Exigir convite/código de acesso
export async function POST(req: Request) {
  const { unitName, password, confirmPassword, inviteCode } = await req.json()
  
  const validCode = process.env.REGISTRATION_INVITE_CODE
  if (!validCode || inviteCode !== validCode) {
    return NextResponse.json({ error: 'Código de convite inválido' }, { status: 403 })
  }
  // ...
}

// Opção 2 — Desabilitar registro público (recomendado se apenas admin cria unidades)
export async function POST() {
  return NextResponse.json({ error: 'Registro desabilitado. Contate o administrador.' }, { status: 403 })
}
```

---

## VULNERABILIDADES ALTAS

---

### [HIGH-01] Ausência Total de Rate Limiting nos Endpoints de Login

```
Arquivo: app/api/auth/login/route.ts
         app/api/auth/admin/login/route.ts
OWASP: A07 — Authentication Failures / CWE-307
```

Nenhum dos dois endpoints de login tem qualquer mecanismo de rate limiting. Brute force ilimitado.

**Prova de conceito:**
```bash
# 10.000 tentativas de brute force em segundos
for pass in $(cat /usr/share/wordlists/rockyou.txt | head -10000); do
  curl -s -X POST https://gerenciabh.vercel.app/api/auth/login \
    -d "{\"unitName\":\"Vox BH\",\"password\":\"$pass\"}" -H "Content-Type: application/json"
done
```

**Remediação:**
```typescript
// lib/security/rate-limit.ts
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 })
    return { allowed: true }
  }
  if (entry.count >= 5) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count++
  return { allowed: true }
}

// Usar em ambos os endpoints de login:
const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
const rl = checkLoginRateLimit(ip)
if (!rl.allowed) {
  return NextResponse.json(
    { error: 'Muitas tentativas. Aguarde.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
  )
}
```

---

### [HIGH-02] Cookie sameSite: 'lax' em Todos os Endpoints de Auth

```
Arquivo: app/api/auth/login/route.ts — linha 92
         app/api/auth/admin/login/route.ts — linha 27
         app/api/auth/register/route.ts — linha 115
         app/api/admin/switch-unit/route.ts — linha 72
OWASP: A07 — Authentication Failures / CWE-352
```

Todos os cookies `auth-token` usam `sameSite: 'lax'`. Com `lax`, o cookie é enviado em navegação top-level cross-site (ex: clique em link externo), o que enfraquece proteção contra CSRF.

**Remediação:**
```typescript
// Substituir 'lax' por 'strict' em todos os 4 arquivos
cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',  // era 'lax'
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
})
```

---

### [HIGH-03] Headers de Segurança HTTP Incompletos

```
Arquivo: next.config.mjs — linhas 26-49
OWASP: A05 — Security Misconfiguration
```

Headers presentes: apenas 3 básicos (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).

**Headers críticos ausentes:**
```
✗ Strict-Transport-Security (HSTS) — força HTTPS
✗ Content-Security-Policy (CSP)    — bloqueia XSS
✗ X-XSS-Protection                 — proteção legacy browsers
✗ Permissions-Policy               — bloqueia câmera/mic/geoloc
```

**Remediação — adicionar em `next.config.mjs`:**
```javascript
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
{ key: 'X-XSS-Protection', value: '1; mode=block' },
{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: blob: *.supabase.co",
    "connect-src 'self' *.supabase.co wss://*.supabase.co api.openai.com",
    "frame-ancestors 'none'",
  ].join('; ')
},
```

---

### [HIGH-04] Sem Middleware Global de Proteção de Rotas

```
Arquivo: middleware.ts — INEXISTENTE na raiz do projeto
OWASP: A01 — Broken Access Control
```

Não existe `middleware.ts` na raiz. Toda proteção depende de verificações individuais em cada endpoint. Qualquer novo endpoint esquecido fica exposto.

**Impacto:** Novo desenvolvedor cria endpoint `/api/dados-sensiveis/route.ts` sem adicionar verificação de token. Fica exposto publicamente.

**Remediação — criar `middleware.ts` na raiz:**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'

const PROTECTED_API = ['/api/supabase', '/api/crm', '/api/pausar', '/api/relatorios',
  '/api/followup', '/api/disparos', '/api/agendamentos', '/api/analytics']
const ADMIN_API = ['/api/admin']
const PUBLIC = ['/api/auth/login', '/api/auth/logout', '/api/auth/register',
  '/api/agent/webhooks', '/api/followup/cron', '/api/agent/tasks/process']

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Bloquear path traversal
  if (path.includes('..') || path.includes('%2e%2e')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Rotas públicas — liberar imediatamente
  if (PUBLIC.some(p => path.startsWith(p))) return NextResponse.next()

  // APIs protegidas — verificar JWT
  if (PROTECTED_API.some(p => path.startsWith(p)) || ADMIN_API.some(p => path.startsWith(p))) {
    const token = req.cookies.get('auth-token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const session = await verifyToken(token)
    if (!session) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    if (ADMIN_API.some(p => path.startsWith(p)) && !session.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/admin/:path*'],
}
```

---

### [HIGH-05] Webhook Zapi Sem Verificação de Assinatura HMAC

```
Arquivo: app/api/agent/webhooks/zapi/route.ts
OWASP: A08 — Software & Data Integrity Failures
```

O webhook aceita token via header `x-webhook-secret` ou `x-zapi-webhook-secret`, mas **não verifica assinatura HMAC**. Apenas compara o token recebido diretamente.

**Vetor de ataque:**
Se o token vazar (logs, network sniffing), qualquer atacante pode enviar mensagens falsas ao agente de IA que serão processadas como legítimas.

**Remediação:**
```typescript
import crypto from 'crypto'

function verifyZapiSignature(rawBody: string, receivedToken: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(receivedToken), Buffer.from(expected))
  } catch { return false }
}
```

---

### [HIGH-06] CRON Secret Exposto via Query Parameter (URL Logging)

```
Arquivo: app/api/followup/cron/route.ts — linha 27
         app/api/agent/tasks/process/route.ts — linha 16
OWASP: A02 — Cryptographic Failures / CWE-598
```

**Código atual:**
```typescript
const tokenParam = new URL(req.url).searchParams.get('token')
const authorized = ... || tokenParam === cronSecret
```

Query parameters aparecem em: logs do Vercel, logs do N8N, histórico de browser, access logs de CDN, cabeçalhos Referer.

**Remediação:** Remover suporte a `?token=`. Aceitar apenas `Authorization: Bearer`.

---

## VULNERABILIDADES MÉDIAS

---

### [MEDIUM-01] TypeScript Build Errors Ignorados

```
Arquivo: next.config.mjs — linha 4
OWASP: A05 — Security Misconfiguration
```

```javascript
typescript: { ignoreBuildErrors: true }
```

Erros de tipo que podem mascarar bugs de segurança (como `any` em dados de entrada não validados) passam silenciosamente para produção.

**Remediação:** `ignoreBuildErrors: false` — corrigir os erros TypeScript existentes.

---

### [MEDIUM-02] Log Vaza Status de Autenticação

```
Arquivo: app/api/auth/login/route.ts — linha 59
OWASP: A09 — Security Logging & Monitoring Failures
```

```typescript
console.log('[Login] Senha válida:', passwordMatch)  // loga true/false
```

Logs do Vercel ficam acessíveis a todos com acesso ao dashboard. Um colaborador com acesso aos logs consegue ver tentativas de login e se a senha estava correta.

**Remediação:**
```typescript
// Remover a linha acima. Substituir por:
if (!passwordMatch) {
  // log genérico sem revelar resultado
  console.warn('[Login] Falha de autenticação para unidade:', unit.unit_name)
  return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
}
```

---

### [MEDIUM-03] Distinção Entre "Unidade Não Encontrada" e "Senha Incorreta"

```
Arquivo: app/api/auth/login/route.ts — linhas 46-62
OWASP: A07 — Authentication Failures / CWE-204
```

O endpoint retorna mensagens diferentes:
- `'Unidade não encontrada ou inativa'` (linha 47)
- `'Senha incorreta'` (linha 62)

Isso permite user enumeration: um atacante pode descobrir quais nomes de unidade existem no sistema.

**Remediação:**
```typescript
// Sempre retornar a mesma mensagem genérica
return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
```

---

### [MEDIUM-04] getTenantFromHeaderOrBody — Tenant via Request Body

```
Arquivo: lib/helpers/api-tenant.ts — linhas 113-143
OWASP: A01 — Broken Access Control
```

```typescript
if (!rawTenant && body?.tenant) {
    rawTenant = normalizeTenant(body.tenant)
}
```

Esta função permite que o tenant seja definido via body da requisição. Se usada incorretamente em endpoints autenticados, um usuário autenticado pode trocar de tenant enviando `{"tenant": "vox_bh"}` no body.

**Remediação:** Auditar todos os usos de `getTenantFromHeaderOrBody` e garantir que seja usado **somente** em cron jobs e webhooks externos verificados — nunca em endpoints acessíveis por usuários.

---

### [MEDIUM-05] ReactStrictMode Desativado

```
Arquivo: next.config.mjs — linha 6
OWASP: A05 — Security Misconfiguration
```

```javascript
reactStrictMode: false
```

O Strict Mode detecta efeitos colaterais indesejados, APIs deprecadas e duplas execuções que podem esconder bugs de lógica com implicações de segurança.

**Remediação:** `reactStrictMode: true`

---

## VULNERABILIDADES BAIXAS / INFORMATIVAS

---

### [LOW-01] bcrypt Salt Rounds = 10 (Mínimo Aceitável)

```
Arquivo: lib/auth/utils.ts — linha 8
```

```typescript
return bcrypt.hash(password, 10)
```

Salt rounds 10 é o mínimo aceitável. Recomendado: 12.

**Remediação:** `bcrypt.hash(password, 12)`

---

### [LOW-02] JWT Sem jti — Sem Mecanismo de Revogação

```
Arquivo: lib/auth/jwt.ts
```

Tokens não possuem `jti` (JWT ID). Se um token for comprometido, não há como invalidá-lo antes de expirar (7 dias).

**Remediação:**
```typescript
.setJti(crypto.randomUUID())  // adicionar ao createToken
```
E manter uma blacklist de jti revogados no Supabase para casos de comprometimento.

---

### [LOW-03] Mensagem de Erro de Migration Expõe Detalhes Internos

```
Arquivo: app/api/admin/migrations/run/route.ts — linha 103
```

```typescript
return NextResponse.json(
    { error: 'Erro ao executar migrations', details: error.message },
    { status: 500 }
)
```

`error.message` pode conter nomes de tabelas, SQL interno, connection strings.

**Remediação:** Logar internamente e retornar mensagem genérica no response.

---

### [INFO-01] Ausência de Audit Log de Segurança

Não existe tabela `security_audit_logs` ou mecanismo equivalente. Eventos críticos (logins, falhas de auth, acesso admin) não são registrados de forma persistente e auditável.

**Impacto:** Impossível investigar incidentes de segurança retroativamente.

**Remediação:** Implementar o sistema de audit log definido no skill `/cybersecurity`.

---

## MAPA DE PRIORIDADE DE CORREÇÃO

```
SEMANA 1 — CRÍTICO (bloquear antes de qualquer deploy):
  [CRITICAL-01] Remover fallback do JWT_SECRET
  [CRITICAL-02] Remover credenciais admin hardcoded
  [CRITICAL-03] Blindar endpoint de migrations
  [CRITICAL-04] Desabilitar ou proteger registro público

SEMANA 2 — ALTO:
  [HIGH-01] Rate limiting nos logins
  [HIGH-02] sameSite 'lax' → 'strict'
  [HIGH-03] Headers HTTP completos (HSTS, CSP, etc.)
  [HIGH-04] Criar middleware.ts global
  [HIGH-05] HMAC no webhook Zapi
  [HIGH-06] Remover CRON secret via query param

SPRINT SEGUINTE — MÉDIO:
  [MEDIUM-01] ignoreBuildErrors: false
  [MEDIUM-02] Remover log de status de senha
  [MEDIUM-03] Mensagens de erro genéricas no login
  [MEDIUM-04] Auditar usos de getTenantFromHeaderOrBody
  [MEDIUM-05] reactStrictMode: true

BACKLOG — BAIXO:
  [LOW-01] bcrypt rounds 10 → 12
  [LOW-02] Adicionar jti ao JWT
  [LOW-03] Sanitizar detalhes de erro em migrations
  [INFO-01] Implementar audit log de segurança
```

---

## CHECKLIST DE VARIÁVEIS DE AMBIENTE (VALIDAR AGORA)

Execute agora e confirme que **nenhuma** dessas variáveis está usando o valor padrão do código:

```bash
# Verificar se JWT_SECRET está definida e tem 32+ chars
echo "JWT_SECRET length: ${#JWT_SECRET}"

# Verificar que não há secrets hardcoded commitados
grep -rn "your-secret-key-change-in-production" --include="*.ts" .
grep -rn "admin@corelion2024" --include="*.ts" .
grep -rn "super-secret-migration-key" --include="*.ts" .
```

**Variáveis obrigatórias em produção:**
```
JWT_SECRET                 mínimo 32 chars aleatórios
ADMIN_USERNAME             diferente de 'corelion_admin'
ADMIN_PASSWORD             forte, sem valor padrão no código
ADMIN_MIGRATION_KEY        sem valor padrão no código
CRON_SECRET                definida, sem fallback
```

**Gerar novo JWT_SECRET seguro:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

---

## PLANO DE RESPOSTA SE COMPROMETIMENTO JÁ OCORREU

```
1. CONTENÇÃO IMEDIATA (próximos 30 minutos):
   □ Gerar novo JWT_SECRET e atualizar no Vercel Dashboard
   □ Revogar e regenerar SUPABASE_SERVICE_ROLE_KEY no painel Supabase
   □ Alterar ADMIN_PASSWORD para valor forte e único
   □ Fazer redeploy forçado no Vercel (invalida todos os tokens ativos)

2. INVESTIGAÇÃO (próximas 2 horas):
   □ Verificar logs do Vercel Functions para acessos a /api/admin/*
   □ Verificar logs do Supabase para queries fora do padrão
   □ Checar units_registry para tenants criados sem autorização
   □ Verificar tabelas criadas recentemente no banco

3. NOTIFICAÇÃO:
   □ Comunicar as 9 unidades se dados foram expostos
   □ Documentar o incidente
```

---

*Relatório gerado em 2026-04-11 — GerenciaBH Security Audit v1.0*
