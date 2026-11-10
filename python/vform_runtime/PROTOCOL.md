# Protocolo IDE ⇄ runtime Python

Comunicação por **stdin/stdout**, um objeto JSON por linha (UTF-8). O stdout real é só do protocolo:
o `print()` do script do usuário vira mensagens `console`. O stderr fica para falhas do próprio
interpretador (a IDE mostra o que sair ali se o processo morrer).

Cada mensagem tem o campo `type`. Não há respostas por requisição: cada lado envia notificações.

## IDE → Python

| `type` | Campos | Efeito |
|---|---|---|
| `load_form` | `form` `{name,title,width,height}`, `components` `{id: {type, props}}`, `script` (texto), `script_name` | Monta o espelho dos componentes, executa o script e depois os `@form.on_load`. Responde com `patch` (se algo mudou) e `loaded`. |
| `sync` | `id`, `prop`, `value` | O usuário alterou um valor na tela (digitou, marcou...). Atualiza **só o espelho**; não gera resposta. |
| `event` | `id`, `name`, `args` | Dispara os handlers do evento (`click`, `change`, `double_click`). Ao fim, envia um `patch` com o que mudou. |
| `ping` | — | Responde `pong`. |
| `shutdown` | — | Encerra o processo (código 0). |

Ordem esperada para um campo de texto: `sync {prop:"value"}` **antes** de `event {name:"change"}`, para o
handler já enxergar o valor novo em `form.txt.value`.

## Python → IDE

| `type` | Campos | Significado |
|---|---|---|
| `patch` | `changes` `[{id, prop, value}]` | Alterações feitas pelo script, em lote (uma por propriedade: a última vence). `id` `":form"` com `prop` `"title"` altera o título da janela. |
| `console` | `level` (`info`/`warn`/`error`), `text`, `line?`, `file?` | Saída do `print()` (info), erros do script (error, com a linha do arquivo do usuário). |
| `message` | `text`, `title` | `app.show_message(...)`: a IDE mostra uma caixa de mensagem. |
| `close` | — | `app.close()`: a IDE fecha a janela de execução. |
| `navigate` | `form` | `app.open_form("Nome")`: a IDE troca a tela exibida (novo processo Python com o script da tela de destino; erro no console se o nome não existir). |
| `loaded` | `ok` | O `load_form` terminou (`ok` é falso se o script ou algum `on_load` falhou). |
| `pong` | — | Resposta ao `ping`. |

## Propriedades

`props` usa os nomes do arquivo do formulário (camelCase: `selectedIndex`, `readOnly`, `fontSize`), mais
`x`, `y`, `width`, `height`. No script, os mesmos nomes aparecem em snake_case (`selected_index`,
`read_only`, `font_size`). `text` é apelido de `value` em TextField/TextArea.

## API do script

```python
form.txtNome.value            # ler (local, sem ida e volta)
form.lblInfo.text = "Olá"      # escrever (vira patch no fim do handler)
form.cbUF.add_item("SP")      # ComboBox/ListBox/RadioGroup/Tabs; Table: add_row([...])
form.cbUF.items.append("RJ")  # listas também notificam
form["id_dinamico"]           # busca por texto

@form.on_load
def inicio(): ...

@form.btnOk.on_click          # ou btnOk.on("click", fn); o handler pode receber (ev)
def ok(ev): ...

app.title = "Meu app"; app.show_message("Pronto"); app.open_form("Tela2"); app.close()
```

Erros do script (inclusive de sintaxe) viram `console` com `level: "error"` e a linha; o runtime continua
vivo e os demais handlers seguem funcionando.
