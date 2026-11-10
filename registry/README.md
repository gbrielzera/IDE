# Component Registry

`components.json` é a **fonte única** dos componentes do VForm. Ele é lido por:

| Quem | Para quê |
|---|---|
| `src/shared/registry.ts` → `catalog.ts` | catálogo da paleta, tamanhos padrão, painel de propriedades, validação e valores padrão |
| `core/pyapi.ts` | autocompletar do Monaco, avisos do código, eventos (`on_click`...) |
| `core/glossary.ts`, `tools/manual` | dicionário (F1) e manual `.chm` (campo `help`, propriedades, eventos e ações) |
| `python/vform_runtime/registry.py` | eventos, apelidos (`text` → `value`), listas e métodos permitidos em cada tipo |

## Campos de um componente

`type`, `label`, `category`, `width`, `height`, `container`, `insetTop`, `props` (tipo, padrão, `min`/`max`/`options`),
`common` (chaves de `commonProps`), `runtimeProps` (só existem rodando), `aliases`, `selectedItem`, `events`
(`name` + `doc`), `methods` (nomes de `methods`) e `help` (`resumo`, `paraQue`, `exemplo`).

## Para adicionar ou mudar um componente

1. Edite `components.json` (e, se for um método novo, acrescente-o em `methods` e implemente em `Component`, no Python).
2. Se mudar o desenho na tela, ajuste `components/render.tsx` (a aparência não é dado puro).
3. Rode `npm run manual` (atualiza `docs/VForm.chm`) e os testes: `registry.test.ts` e `RegistryTest` conferem a consistência.
