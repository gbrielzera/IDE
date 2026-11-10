import { REGISTRY } from '@shared/registry'

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

/** Textos de ajuda de cada componente, vindos do Component Registry (campo `help`). */
export const COMPONENT_HELP: Record<string, ComponentHelp> = Object.fromEntries(REGISTRY.components.map((c) => [c.type, c.help]))

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
    nome: 'Identidade interna (uid)',
    explicacao:
      'Cada componente tem, por trás do ID, um código interno que nunca muda (você não precisa mexer nele). Por isso renomear o ID não "recria" o componente: a seleção, o histórico de desfazer e o que você está editando continuam valendo. Cópias ganham um uid novo. Projetos antigos recebem os uids ao abrir (o original fica salvo como .bak na primeira gravação).',
    exemplo: 'form.btnSalvar  # o ID (btnSalvar) pode mudar; o uid, não'
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
    explicacao: 'Controla a janela em execução: mudar o título, mostrar uma mensagem, abrir outra tela ou fechar.',
    exemplo: 'app.show_message("Pronto!")\napp.title = "Meu programa"\napp.open_form("Tela2")\napp.close()'
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

/** Um trecho de um guia: parágrafo, passo de lista, código ou aviso. */
export interface Block {
  tipo: 'p' | 'li' | 'code'
  texto: string
}

export interface Guide {
  id: string
  titulo: string
  blocos: Block[]
}

/**
 * Guias de uso. Esta lista alimenta o dicionário (F1) E o manual (Manual.chm): ao criar ou mudar uma
 * funcionalidade, atualize o guia correspondente aqui e rode `npm run manual` (um teste falha se o manual ficar velho).
 */
export const GUIDES: Guide[] = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    blocos: [
      { tipo: 'p', texto: 'O VForm IDE monta janelas (formulários) arrastando componentes, e a lógica é escrita em Python.' },
      { tipo: 'li', texto: 'Arquivo → Novo projeto: escolha uma pasta vazia. O projeto nasce com a tela "Main".' },
      { tipo: 'li', texto: 'Arraste componentes da lista da esquerda para a janela, ou dê dois cliques num item da lista.' },
      { tipo: 'li', texto: 'Dê um ID a cada componente no painel Propriedades (por exemplo btnSalvar). É com o ID que o código fala com ele.' },
      { tipo: 'li', texto: 'Dê dois cliques num componente: a IDE cria a função do evento dele e abre o código.' },
      { tipo: 'li', texto: 'Aperte F5 para executar. Salvar é Ctrl+S (ou ligue "Salvar automaticamente" no menu Arquivo).' }
    ]
  },
  {
    id: 'telas',
    titulo: 'Várias telas e navegação',
    blocos: [
      { tipo: 'p', texto: 'Um projeto pode ter quantas telas quiser. Cada tela tem seu layout (.form.json) e seu código (.py).' },
      { tipo: 'li', texto: 'Criar: botão "+ tela" ao lado das abas, ou Arquivo → Nova tela. O nome vira o nome dos arquivos e não pode se repetir.' },
      { tipo: 'li', texto: 'Trocar: clique nas abas da tela (layout e código de cada uma).' },
      { tipo: 'li', texto: 'Remover: Arquivo → Remover tela atual. Os arquivos não são apagados: ao salvar ganham o final .removido, e você pode recuperá-los.' },
      { tipo: 'p', texto: 'Para ir de uma tela para outra enquanto o programa roda, use app.open_form com o nome da tela:' },
      { tipo: 'code', texto: '@form.btnProximo.on_click\ndef ir():\n    app.open_form("Tela2")' },
      { tipo: 'p', texto: 'A tela nova substitui a atual na mesma janela, e o código da tela anterior deixa de rodar. Se o nome não existir, o Console mostra um erro com a lista de telas do projeto.' }
    ]
  },
  {
    id: 'editar-texto',
    titulo: 'Editar o texto de um componente',
    blocos: [
      { tipo: 'li', texto: 'Selecione o componente e aperte F2: uma caixa aparece em cima dele. Enter confirma e Esc cancela.' },
      { tipo: 'li', texto: 'Ou clique com o botão direito no componente e escolha "Editar texto".' },
      { tipo: 'p', texto: 'Funciona nos componentes que têm texto: Label, Button e CheckBox. Ctrl+Z desfaz a mudança.' },
      { tipo: 'p', texto: 'O menu do botão direito também tem Abrir código, Recortar, Copiar, Colar, Duplicar, Excluir e o dicionário. Clicando no fundo do formulário ele oferece Colar.' }
    ]
  },
  {
    id: 'codigo',
    titulo: 'Escrevendo o código',
    blocos: [
      { tipo: 'p', texto: 'No código, "form" dá acesso aos componentes pelo ID, e "app" controla a janela.' },
      { tipo: 'code', texto: '@form.btnOk.on_click\ndef ao_clicar():\n    form.lblInfo.text = "Olá, " + form.txtNome.value' },
      { tipo: 'li', texto: 'Digite "form." e a lista de IDs aparece; depois do ID, aparecem as propriedades e ações dele.' },
      { tipo: 'li', texto: 'IDs ou propriedades que não existem ganham um aviso sublinhado na linha.' },
      { tipo: 'li', texto: 'Renomear um ID no painel Propriedades atualiza o código automaticamente (e Desfazer volta o código também).' },
      { tipo: 'p', texto: 'Ações que quase todo componente entende (cada tipo só oferece as que fazem sentido para ele):' },
      { tipo: 'code', texto: 'form.btnSalvar.hide()          # esconde  (show() mostra)\nform.btnSalvar.disable()       # desabilita  (enable() habilita)\nform.txtNome.focus()           # leva o cursor para o campo\nform.btnSalvar.set_tooltip("Grava os dados")\nform.btnSalvar.set_position(20, 300)\nform.btnSalvar.set_size(120, 32)\nform.txtNome.reset()           # volta ao padrão (não mexe em posição e tamanho)' },
      { tipo: 'li', texto: 'Erros do programa em execução aparecem no Console; clicar na linha do erro leva ao código.' }
    ]
  },
  {
    id: 'executar',
    titulo: 'Executar e pré-visualização ao vivo',
    blocos: [
      { tipo: 'li', texto: 'F5 (ou Executar) abre a janela do programa; Shift+F5 para.' },
      { tipo: 'li', texto: 'Com "Pré-visualização ao vivo" ligada (botão "Ao vivo"), a janela abre ao lado da IDE e se atualiza sozinha a cada mudança, como o Live Preview do VS Code. Ao fechar a prévia, a IDE volta ao tamanho de antes.' },
      { tipo: 'li', texto: 'Se o programa tiver várias telas, a prévia mostra a tela que estava aberta ao executar.' }
    ]
  },
  {
    id: 'seguranca',
    titulo: 'Segurança e validação do projeto',
    blocos: [
      { tipo: 'p', texto: 'O código Python do projeto roda com os mesmos privilégios do seu usuário. Isso NÃO é um ambiente isolado (sandbox).' },
      { tipo: 'li', texto: 'Projetos criados na IDE são confiáveis. Ao executar pela primeira vez um projeto aberto de fora, a IDE pede sua confirmação.' },
      { tipo: 'li', texto: 'Ao abrir, o project.json e os formulários são conferidos: nome de tela, caminhos (nada de ".." nem caminho absoluto), tipos de componente, propriedades e limites. Os problemas aparecem no Console com o arquivo, a tela, o componente e a propriedade.' },
      { tipo: 'li', texto: 'Formulário com erro de validação não executa até ser corrigido.' },
      { tipo: 'li', texto: 'Links simbólicos ou junções que apontem para fora da pasta do projeto são recusados na leitura e na gravação.' },
      { tipo: 'li', texto: 'Se o script travar ao carregar (laço infinito), a execução é interrompida depois de 30 s e o Python é encerrado.' }
    ]
  },
  {
    id: 'logs',
    titulo: 'Console e Logs',
    blocos: [
      { tipo: 'p', texto: 'O painel de baixo tem duas abas.' },
      { tipo: 'li', texto: 'Console: o que o programa escreve com print() e os erros da execução atual. "limpar" esvazia a lista.' },
      { tipo: 'li', texto: 'Logs: o histórico completo, com data, hora, nível (INFO, AVISO, ERRO) e o número da execução. Dá para filtrar por nível e o "limpar" do Console não o apaga.' }
    ]
  },
  {
    id: 'janela',
    titulo: 'A janela do formulário',
    blocos: [
      { tipo: 'li', texto: 'Arraste a barra de título para mover a janela dentro da área de trabalho; dois cliques nela centralizam de novo.' },
      { tipo: 'li', texto: 'Arraste as bordas direita, de baixo ou o canto para mudar o tamanho do formulário.' },
      { tipo: 'li', texto: 'Réguas (menu Exibir) mostram as medidas; linhas-guia aparecem ao alinhar com os vizinhos. Alt desliga o encaixe na grade.' },
      { tipo: 'li', texto: 'Menu Organizar: alinhar e distribuir componentes selecionados.' }
    ]
  }
]

export interface Atalho {
  teclas: string
  acao: string
}

export const ATALHOS: Atalho[] = [
  { teclas: 'F1', acao: 'Abre o dicionário (no componente selecionado, se houver)' },
  { teclas: 'F2', acao: 'Edita o texto do componente selecionado' },
  { teclas: 'F5', acao: 'Executa o formulário' },
  { teclas: 'Shift+F5', acao: 'Para a execução' },
  { teclas: 'Ctrl+N / Ctrl+O / Ctrl+S', acao: 'Novo projeto / Abrir projeto / Salvar' },
  { teclas: 'Ctrl+Z / Ctrl+Y', acao: 'Desfazer / Refazer' },
  { teclas: 'Ctrl+C / Ctrl+X / Ctrl+V', acao: 'Copiar / Recortar / Colar componentes' },
  { teclas: 'Ctrl+D', acao: 'Duplicar' },
  { teclas: 'Delete', acao: 'Excluir os selecionados' },
  { teclas: 'Setas', acao: 'Move o componente selecionado (Shift: passo maior)' },
  { teclas: 'Esc', acao: 'Limpa a seleção / fecha janelas e menus' },
  { teclas: 'Dois cliques no componente', acao: 'Cria e abre a função do evento dele no código' },
  { teclas: 'Botão direito', acao: 'Menu do componente (ou Colar, no fundo do formulário)' }
]

export interface Novidade {
  titulo: string
  itens: string[]
}

/** Histórico do que mudou, do mais novo para o mais antigo (aparece no manual). */
export const NOVIDADES: Novidade[] = [
  {
    titulo: 'Versão atual',
    itens: [
      'API comum de componentes: show/hide, enable/disable, focus/blur, set_tooltip, set_position, set_size e reset, declaradas no registro por tipo.',
      'Identidade estável: cada componente tem um uid interno; renomear o ID mantém seleção, histórico e a tela. Projetos antigos são atualizados (com cópia .bak).',
      'Component Registry: os componentes (propriedades, eventos, ações e ajuda) vêm de um único arquivo, lido pela IDE e pelo Python.',
      'Segurança: caminhos e links validados, limites no protocolo com o Python, prazo de carregamento e aviso de confiança.',
      'Validação do projeto e dos formulários ao abrir e antes de executar; base para migrações de versão.',
      'Várias telas: criar, trocar, remover e navegar pelo código com app.open_form.',
      'F2 e botão direito para editar o texto de um componente.',
      'Aba Logs, dicionário (F1) e este manual.',
      'Prévia ao passar o cursor sobre os componentes da lista.',
      'Pré-visualização ao vivo encaixada ao lado da IDE.',
      'Janela do formulário que pode ser movida; abertura do código bem mais rápida.',
      'Renomear um ID atualiza o código.'
    ]
  },
  {
    titulo: 'Versões anteriores',
    itens: [
      'Editor de código com autocompletar e avisos.',
      'Executar formulários com Python.',
      'Propriedades editáveis, auto-layout, tema escuro, réguas, alinhar, copiar e colar.'
    ]
  }
]

/** Entrada do índice do dicionário. */
export type Topic = { kind: 'component'; type: string } | { kind: 'term'; index: number } | { kind: 'guide'; id: string }
