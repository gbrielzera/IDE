// Dicionário em linguagem simples: o que cada componente é, para que serve e como usar no código Python.
// Texto pensado para quem não programa: sem jargão, com exemplos curtos que dá para copiar.

export interface ComponentHelp {
  /** Uma frase: o que é. */
  resumo: string
  /** Quando usar. */
  paraQue: string
  /** Exemplo de código pronto (usa o ID de exemplo mostrado no próprio texto). */
  exemplo: string
}

export const COMPONENT_HELP: Record<string, ComponentHelp> = {
  Label: {
    resumo: 'Um texto fixo na tela, que o usuário só lê.',
    paraQue: 'Títulos, explicações e mensagens de resultado ("Salvo com sucesso").',
    exemplo: 'form.lblInfo.text = "Olá!"'
  },
  TextField: {
    resumo: 'Uma caixinha onde o usuário digita uma linha de texto.',
    paraQue: 'Pedir nome, e-mail, número... qualquer resposta curta.',
    exemplo: 'nome = form.txtNome.value'
  },
  TextArea: {
    resumo: 'Uma caixa grande para digitar vários parágrafos.',
    paraQue: 'Observações, comentários, textos longos.',
    exemplo: 'form.txtObs.value = "Texto com\\nvárias linhas"'
  },
  Button: {
    resumo: 'Um botão que o usuário clica para pedir uma ação.',
    paraQue: 'Salvar, enviar, calcular, limpar... é onde você liga o seu código.',
    exemplo: '@form.btnOk.on_click\ndef ao_clicar():\n    app.show_message("Clicou!")'
  },
  CheckBox: {
    resumo: 'Uma caixinha de marcar, com duas respostas: marcada ou não.',
    paraQue: 'Opções de sim/não, como "Lembrar de mim".',
    exemplo: 'if form.chkLembrar.checked:\n    print("marcado")'
  },
  RadioGroup: {
    resumo: 'Um grupo de bolinhas em que só uma pode ser escolhida.',
    paraQue: 'Escolher uma opção entre poucas, como o estado civil.',
    exemplo: 'escolhida = form.rgSexo.selected_item'
  },
  ComboBox: {
    resumo: 'Uma lista que se abre ao clicar, para escolher um item.',
    paraQue: 'Escolher uma opção entre muitas, ocupando pouco espaço (UF, cidade).',
    exemplo: 'form.cbUF.add_item("SP")\nprint(form.cbUF.selected_item)'
  },
  ListBox: {
    resumo: 'Uma lista sempre visível, com os itens um embaixo do outro.',
    paraQue: 'Mostrar vários itens (tarefas, nomes) e deixar escolher um.',
    exemplo: 'form.lstTarefas.add_item("Comprar pão")'
  },
  Image: {
    resumo: 'Uma figura, como uma foto ou um logotipo.',
    paraQue: 'Deixar a tela mais bonita ou mostrar uma imagem do seu projeto.',
    exemplo: 'form.imgLogo.visible = False'
  },
  Panel: {
    resumo: 'Uma caixa que guarda outros componentes dentro dela.',
    paraQue: 'Agrupar partes da tela e organizá-las automaticamente em coluna ou linha.',
    exemplo: 'form.pnlOpcoes.visible = False   # esconde tudo que está dentro'
  },
  Tabs: {
    resumo: 'Várias "páginas" na mesma tela, escolhidas por abas no topo.',
    paraQue: 'Separar assuntos diferentes sem lotar a janela.',
    exemplo: 'form.tabPrincipal.selected_index = 1   # vai para a 2ª aba'
  },
  Table: {
    resumo: 'Uma tabela com linhas e colunas.',
    paraQue: 'Mostrar listas de dados com mais de uma informação por linha.',
    exemplo: 'form.tblClientes.add_row(["Ana", "ana@email.com"])'
  }
}

export interface Term {
  nome: string
  explicacao: string
  exemplo?: string
}

export const TERMS: Term[] = [
  {
    nome: 'Formulário (form)',
    explicacao: 'A janela que você está desenhando. No código, "form" dá acesso a todos os componentes dela pelo ID.',
    exemplo: 'form.txtNome.value'
  },
  {
    nome: 'ID',
    explicacao:
      'O nome que você dá a um componente para falar com ele no código. Use letras, números e _, sem espaços e sem começar por número. Dica: prefixos como btn, txt, lbl ajudam a lembrar o tipo.',
    exemplo: 'btnSalvar, txtNome, lblResultado'
  },
  {
    nome: 'Propriedade',
    explicacao: 'Uma característica do componente que você pode ler ou mudar: o texto, a cor, se está visível...',
    exemplo: 'form.btnOk.text = "Enviar"'
  },
  {
    nome: 'Evento',
    explicacao:
      'Algo que acontece na tela e que o seu código pode "escutar": um clique, uma mudança no campo. Para reagir, escreva uma função com @form.<id>.on_<evento>. Dar dois cliques no componente já cria a função para você.',
    exemplo: '@form.btnOk.on_click\ndef ao_clicar():\n    ...'
  },
  {
    nome: 'Função (def)',
    explicacao: 'Um bloquinho de código com nome. O que está recuado (com espaços) embaixo do "def" faz parte dela.',
    exemplo: 'def ao_clicar():\n    print("oi")'
  },
  {
    nome: 'app',
    explicacao: 'Controla a janela em execução: mudar o título, mostrar uma mensagem ou fechar.',
    exemplo: 'app.show_message("Pronto!")\napp.title = "Meu programa"\napp.close()'
  },
  {
    nome: 'print',
    explicacao: 'Escreve um texto no Console da IDE. Ótimo para descobrir o que o programa está fazendo.',
    exemplo: 'print("valor:", form.txtNome.value)'
  },
  {
    nome: 'on_load',
    explicacao: 'Função que roda sozinha quando a janela termina de abrir. Boa para preparar listas e textos iniciais.',
    exemplo: '@form.on_load\ndef ao_abrir():\n    form.cbUF.add_item("SP")'
  }
]

/** Entrada do índice do dicionário. */
export type Topic = { kind: 'component'; type: string } | { kind: 'term'; index: number }
