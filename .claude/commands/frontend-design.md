---
description: "Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics."
---

# Frontend Design

Cria interfaces frontend de alta qualidade visual, adaptando-se ao contexto do projeto.

## Comportamento Adaptativo

**ANTES de começar**, detecte se o projeto tem design system:

```
Verificar existência de:
- tailwind.config.* (cores customizadas)
- src/constants/colors.ts ou similar
- .claude/skills/design-consistency/
- src/styles/variables.css
- theme.ts ou tokens.*
```

### Se EXISTIR Design System → Modo Constrained

Foque em **criatividade dentro das constraints**:

| Área | Abordagem |
|------|-----------|
| **Layout** | Assimetria, overlap, grid-breaking, negative space |
| **Composição** | Hierarquia visual clara, flow diagonal, densidade controlada |
| **Motion** | Staggered reveals, scroll-triggered, hover surprises |
| **Espacial** | Proporções interessantes, ritmo visual |

**USE APENAS** tokens existentes (cores, fontes, espaçamentos).

### Se NÃO EXISTIR Design System → Modo Creative

Liberdade total para escolhas de:
- Tipografia distintiva (evite Inter/Roboto/Arial)
- Paletas de cor originais
- Identidade visual única

---

## Design Thinking (Ambos os Modos)

Antes de codar, defina:

1. **Propósito**: Que problema resolve? Quem usa?
2. **Tom**: Minimal, maximalista, retro-futurista, brutalist, orgânico, editorial, etc.
3. **Diferencial**: O que torna MEMORÁVEL? O que vão lembrar?

> "Bold maximalism e refined minimalism funcionam - a chave é intencionalidade, não intensidade."

---

## Guidelines por Área

### Typography (Modo Creative)

```
❌ Evitar: Arial, Inter, Roboto, system fonts
✅ Usar: Fontes com personalidade, pares display + body intencionais
```

### Typography (Modo Constrained)

```
✅ Usar fontes do design system
✅ Focar em: tamanhos, pesos, hierarquia, espaçamento entre letras
✅ Criar contraste através de escala, não de fonte diferente
```

### Color & Theme

**Modo Creative:**
- Paletas coesas com CSS variables
- Cores dominantes + acentos sharp > paletas tímidas distribuídas

**Modo Constrained:**
- USE APENAS tokens existentes
- Crie interesse através de: contraste, layering, opacity
- Backgrounds com gradients sutis usando cores do sistema

### Motion & Animation

```css
/* High-impact: page load com staggered reveals */
.item { animation: fadeIn 0.4s ease-out backwards; }
.item:nth-child(1) { animation-delay: 0.0s; }
.item:nth-child(2) { animation-delay: 0.1s; }
.item:nth-child(3) { animation-delay: 0.2s; }

/* Hover states que surpreendem */
.card:hover { transform: translateY(-2px) scale(1.01); }

/* Scroll-triggered (CSS only) */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Priorize**: Um page load bem orquestrado > micro-interações espalhadas

### Spatial Composition

```
✅ Assimetria intencional
✅ Elementos que quebram o grid
✅ Overlap controlado
✅ Negative space generoso OU densidade controlada
✅ Flow diagonal / não-linear
```

### Visual Details

**Ambos os modos:**
- Gradients mesh sutis
- Noise textures leves
- Shadows com personalidade (não só drop-shadow genérico)
- Bordas decorativas quando apropriado

---

## Anti-Patterns (NUNCA fazer)

```
❌ Layouts previsíveis e simétricos demais
❌ Componentes cookie-cutter sem contexto
❌ Hover states genéricos (só mudança de cor)
❌ Animações sem propósito
❌ Espaçamento uniforme em tudo
❌ Hierarquia visual plana
```

**Modo Constrained adicional:**
```
❌ Inventar cores fora do sistema
❌ Usar fontes não definidas
❌ Criar componentes que já existem
❌ Ignorar padrões de layout estabelecidos
```

---

## Processo de Implementação

### 1. Análise Inicial

```bash
# Detectar design system
Glob: **/tailwind.config.*
Glob: **/colors.ts
Glob: **/*theme*.*
Glob: **/.claude/skills/design-consistency/
```

Se encontrar, ler e extrair:
- Paleta de cores
- Fontes definidas
- Componentes existentes
- Padrões de layout

### 2. Definir Direção

Responda mentalmente:
- [ ] Qual o tom/mood da interface?
- [ ] Qual o diferencial memorável?
- [ ] Quais constraints devo respeitar?

### 3. Implementar

**Ordem de foco:**
1. Estrutura/Layout (mais impacto visual)
2. Hierarquia tipográfica
3. Cores e contraste
4. Motion/animações
5. Detalhes e polish

### 4. Validar

```
✅ Visualmente distintivo (não genérico)?
✅ Coeso com o restante do projeto?
✅ Funcional e acessível?
✅ Animações performáticas (prefer CSS)?
```

---

## Exemplos de Aplicação

### Modo Constrained (com Design System)

```tsx
// ✅ Criativo DENTRO das constraints
<div className="grid grid-cols-12 gap-4">
  {/* Elemento que quebra o grid */}
  <div className="col-span-7 -mr-8 z-10">
    <Card className="transform rotate-1 hover:-rotate-1 transition-transform">
      ...
    </Card>
  </div>
  {/* Overlap intencional */}
  <div className="col-span-6 -ml-4 mt-8">
    <Card className="opacity-95 backdrop-blur">
      ...
    </Card>
  </div>
</div>
```

### Modo Creative (sem Design System)

```tsx
// ✅ Liberdade total
<div
  className="min-h-screen"
  style={{
    fontFamily: "'Space Grotesk', sans-serif",
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
  }}
>
  <h1 className="text-7xl font-black tracking-tighter text-amber-400">
    ...
  </h1>
</div>
```

---

## Checklist Final

- [ ] Detectei se há design system?
- [ ] Defini tom/mood claro?
- [ ] Layout tem interesse visual (não só grid simétrico)?
- [ ] Hierarquia tipográfica está clara?
- [ ] Animações são intencionais e performáticas?
- [ ] Respeitei constraints do projeto (se existirem)?
- [ ] Resultado é memorável, não genérico?

---

**LEMBRE-SE**: Claude é capaz de trabalho criativo extraordinário. Não segure - mostre o que pode ser criado quando pensa fora da caixa e se compromete totalmente com uma visão distintiva, respeitando o contexto do projeto.
