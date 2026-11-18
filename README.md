# Hyper App

Central de trabalho da Hyper: tarefas, clientes, calendário de conteúdo, tráfego pago e financeiro. Roda no Firebase (projeto `hyper-9e023`) e está publicado em https://hyper-9e023.web.app.

## Telas

Menu: **Hoje, Tarefas, Calendário, Clientes, Tráfego pago, Financeiro** e o grupo **Administração** (Rotinas, Relatórios, Usuários e equipe, Ajustes). **Ctrl+K** (⌘K no Mac) abre a busca rápida: clientes, marcas, posts, tarefas, compromissos e telas.

| Tela | O que faz |
|---|---|
| Hoje | Atrasadas, tarefas do dia e da semana, conteúdos programados e valores a receber |
| Tarefas | Quadro A fazer / Em andamento / Concluído (arrastar e soltar) ou lista, com busca e filtros. Tipos: Conteúdo, Produção, Vídeo / Roteiro, Tráfego pago, Financeiro / Comercial, Planejamento, Organização e Outro ("Reunião" abre como compromisso). Concluir e excluir têm **Desfazer** |
| Calendário | Camadas **Tudo / Conteúdo / Compromissos**, filtro por cliente e por marca. Com um cliente filtrado, a aba **Planejar mês** abre o planejamento (grade do mês ou tabela, "Formato \| Tema" no dia, arrastar entre dias). PDF por cliente (ou marca) e mês para aprovação. Compromissos podem ir para a Google Agenda pessoal (posts nunca vão) |
| Post | Tarefa do tipo **Conteúdo** com marca, formato, rede, data/hora, **etapa** (ideia → publicado; o status de tarefa sai da etapa), copy e criativos. **Criar arte** abre dentro do post: gera a imagem com a OpenAI na identidade da marca e "Levar ao Canva" copia o pedido para o Claude montar o design |
| Clientes | Editar = cadastro, contato e contrato. Abas: tarefas, conteúdo, **marca** (identidade do cliente e de cada **marca** dele, com "Sugerir melhoria" e "Juntar outros clientes como marcas"), **contas** (redes sociais e atalhos de agendamento), **tráfego pago** (contas de anúncio e manutenções) e financeiro |
| Tráfego pago | Contas de anúncio e verba por cliente, alerta de manutenção atrasada (mais de 7 dias) e diário de manutenções |
| Financeiro | Receitas e despesas do mês, mensalidades a partir dos contratos e orçamentos. A rotina de cobrança cria a receita pendente e concluir a tarefa de cobrança marca como paga |
| Rotinas | Tarefas automáticas: produzir a semana seguinte, planejar o mês seguinte, cobrar a mensalidade no vencimento e rotinas livres |
| Relatórios | Por cliente ou geral, por mês ou período: posts publicados, outras entregas, manutenções, reuniões e financeiro. Exporta PDF. Meses antigos leem o arquivo de tarefas |
| Usuários e equipe | **+ Adicionar usuário** por e-mail (convite: a pessoa entra já liberada), pedidos de acesso e de mais acesso para qualquer administrador aprovar, áreas e **clientes que cada um pode ver**, e pessoas da equipe sem conta |
| Minha conta | Clique no seu nome no menu: foto, nome, seu acesso, pedir mais acesso (áreas ou clientes) e suas conexões (Google Agenda) |
| Ajustes | E-mails automáticos (Gmail da Hyper via Apps Script), chave da OpenAI, importação de definições de marca (.json, com marcas), importação da planilha e backup |

### Marcas

Um cliente pode ter várias marcas com identidades diferentes (ex.: um grupo com várias empresas). A identidade do próprio cliente é a "marca principal"; cada marca extra fica em `marcas` com `clienteId`, nome e os mesmos campos de identidade (campo vazio = usa o do cliente). O post guarda `marcaId`; a copy, a imagem, o pedido do Canva e o PDF usam a identidade da marca (`identidade()` em `db.js`).

## Estrutura

```
public/
  index.html            login e estrutura (menu lateral + conteúdo)
  css/style.css         identidade visual (tokens no topo) e componentes
  js/firebase.js        configuração do Firebase
  js/app.js             login, navegação (#/rota) e inicialização
  js/db.js              dados em memória sincronizados com o Firestore (espacos/hyper/...), arquivo e identidade das marcas
  js/ui.js              elementos, modais, formulários, datas e moeda
  js/constantes.js      listas fixas (status, tipos, formatos...)
  js/recorrencias.js    geração automática das tarefas recorrentes
  js/importacao.js      leitura do CSV da planilha Fluxo de Trabalho
  js/busca.js           busca rápida (Ctrl+K)
  js/views/*.js         uma tela por arquivo
firestore.rules         permissões por área (ver "Usuários e permissões")
testes/                 testes das regras (emulador) e das telas (Playwright com o Firebase em memória)
```

Não precisa de build: o SDK do Firebase vem do CDN.

## Usuários e permissões

Duas formas de entrar: o administrador adiciona o e-mail em Usuários (vira `convites/{email}`; no primeiro login a pessoa entra liberada com aquele acesso) ou a pessoa entra e pede acesso (fica `pendente` com o `pedido`, e qualquer administrador aprova). Cada membro pode ter `acessoClientes: "alguns"` com a lista `clientes`: as regras só deixam ler os itens desses clientes (e os sem cliente), e o app lê essas coleções com consultas por `clienteId`.

E-mails: `docs/email/Codigo.gs` roda no Google Apps Script da conta da Hyper (instruções em Ajustes). O app guarda `config/email` (URL e segredo, só administradores) e a URL em `espacos/hyper.emailUrl` (para quem ainda não tem acesso avisar os administradores).

Cada pessoa entra com o próprio Google e pede acesso; o administrador libera em **Usuários**. Áreas: **Conteúdo** (posts, planejamento, criar arte, marca), **Tráfego pago** (contas, verbas, manutenções) e **Financeiro** (mensalidades, cobranças, orçamentos e valores). Sem áreas = acesso básico (Hoje, Tarefas, compromissos, lista de clientes). As regras do Firestore (`firestore.rules`) protegem os dados sensíveis.

## Dados no Firestore

Tudo fica no espaço compartilhado `espacos/hyper/<coleção>` (antes era `users/{uid}`, que ficou como backup): `membros`, `contratos` (mensalidade e vencimento, só financeiro), `pessoal/{uid}` (coisas de cada usuário) e `clientes`, `marcas`, `tarefas`, `tarefasArquivo` (concluídas há mais de 90 dias, lidas só quando preciso), `recorrencias`, `financeiro`, `orcamentos`, `contasAds`, `manutencoes`, `config` (docs `openai`, `agenda` com o e-mail da Google Agenda conectada, `equipe` com `pessoas: [{nome, email}]`), `compromissos`. Datas são texto `AAAA-MM-DD`.

- Posts são tarefas com `tipo: "Conteúdo"` e os campos `marcaId`, `formato`, `rede`, `dataPublicacao`, `hora`, `statusConteudo`, `objetivo`, `roteiro`, `copy`. O `status` do post sai da etapa (`statusDaEtapa`).
- Tarefas de cobrança têm `lancamentoId` (`mens-<cliente>-<AAAA-MM>`), a receita do mês no Financeiro.
- O navegador guarda uma cópia local dos dados (cache do Firestore): o app abre rápido e funciona sem internet por um tempo.
- Arquivos da marca ficam na pasta do Drive do cliente (`linkDrive`), não no app.
- Criativos anexados aos posts ficam em `clientes/{id}/artes` (base64 comprimido, `tarefaId`, `origem: gerada|final`), lidos sob demanda. A tarefa guarda `qtdArtes`. O PDF usa o criativo final quando existe.
- O banco pode ter id `(default)` ou `default`; o app descobre sozinho.

## Testes

```
npm install
npx playwright install chromium
npm test            # regras do Firestore no emulador (precisa de Java) + telas
```

No GitHub os testes rodam em todo pull request e antes de publicar.

## Publicação

Um push no `main` roda os testes e, se passarem, publica o site pelo GitHub Actions. As regras do Firestore (`firestore.rules`) precisam ser coladas à mão em Firestore → Segurança no console do Firebase sempre que mudarem.
