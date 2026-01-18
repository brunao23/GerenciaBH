# 📚 GUIA DE USO - SISTEMA SIMPLIFICADO

## ARQUITETURA

### Middleware:
- **Função:** Apenas redireciona `/` para `/login`
- **NÃO faz:** Verificação JWT, proteção de rotas
- **Por quê:** Evita problemas com Edge Runtime

### Proteção de Páginas:
- **Hook:** `useAuth()`
- **Uso:** Cada página protegida usa o hook
- **Benefício:** Proteção consistente e simples

### APIs:
- **Função:** Verificam autenticação via `getTenantFromSession()`
- **Retorno:** 401 se não autenticado
- **Benefício:** Dados sempre seguros

---

## COMO USAR

### Proteger Página de Cliente:

```typescript
'use client'

import { useAuth } from '@/lib/hooks/useAuth'

export default function DashboardPage() {
    const { session, loading } = useAuth()
    
    if (loading) {
        return <div>Carregando...</div>
    }
    
    return (
        <div>
            <h1>Dashboard de {session?.unitName}</h1>
        </div>
    )
}
```

### Proteger Página de Admin:

```typescript
'use client'

import { useAuth } from '@/lib/hooks/useAuth'

export default function AdminDashboardPage() {
    const { session, loading } = useAuth({ requireAdmin: true })
    
    if (loading) {
        return <div>Carregando...</div>
    }
    
    return (
        <div>
            <h1>Painel Admin</h1>
        </div>
    )
}
```

### Navegação:

```typescript
// SEMPRE usar window.location.href
// NUNCA usar router.push() para mudança de contexto

// ✅ CORRETO:
window.location.href = '/dashboard'

// ❌ ERRADO:
router.push('/dashboard')
```

---

## BENEFÍCIOS

1. ✅ **Simples:** Fácil de entender
2. ✅ **Robusto:** Sem erros de Edge Runtime
3. ✅ **Consistente:** Mesma lógica em todas as páginas
4. ✅ **Seguro:** Verificação em múltiplas camadas
5. ✅ **Rápido:** Menos verificações redundantes

---

## PRÓXIMOS PASSOS

1. Aplicar `useAuth()` em todas as páginas protegidas
2. Testar fluxos de autenticação
3. Otimizar queries lentas
4. Adicionar loading states
5. Melhorar mensagens de erro

---

SISTEMA SIMPLIFICADO E FUNCIONAL! 🚀
