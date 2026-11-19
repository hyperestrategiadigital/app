# Hyper App

Central de trabalho da Hyper Estratégia Digital: tarefas, clientes, calendário de conteúdo, tráfego pago e financeiro. Roda no Firebase (projeto `hyper-9e023`) e está publicado em https://hyper-9e023.web.app.

## Telas

Menu: **Hoje, Tarefas, Calendário, Clientes, Tráfego pago, Financeiro** e o grupo **Administração** (Rotinas, Relatórios, Usuários e equipe, Ajustes). **Ctrl+K** (⌘K no Mac) abre a busca rápida: clientes, marcas, posts, tarefas, compromissos e telas.

| Tela | O que faz |
|---|---|
| Hoje | **Minhas / Equipe**: cada pessoa vê primeiro o que é dela. Atrasadas, tarefas do dia e da semana, conteúdos, valores a receber, **primeiros passos** (administrador) e dicas rápidas |
| Tarefas | Quadro A fazer / Em andamento / Concluído (arrastar e soltar) ou lista, com busca e filtros. Tipos: Conteúdo, Produção, Vídeo / Roteiro, Tráfego pago, Financeiro / Comercial, Planejamento, Organização e Outro ("Reunião" abre como compromisso). Concluir e excluir têm **Desfazer** |
| Calendário | Camadas **Tudo / Conteúdo / Compromissos**, filtro por cliente e por marca. Com um cliente filtrado, a aba **Planejar mês** abre o planejamento (grade do mês ou tabela, "Formato \| Tema" no dia, arrastar entre dias). PDF por cliente (ou marca) e mês para aprovação. Compromissos podem ir para a Google Agenda pessoal (posts nunca vão) |
| Post | Tarefa do tipo **Conteúdo** com marca, formato, rede, data/hora, **etapa** (ideia → publicado; o status de tarefa sai da etapa), copy e criativos. **Criar arte** abre dentro do post: gera a imagem com a OpenAI na identidade da marca e "Levar ao Canva" copia o pedido para o Claude montar o design |
| Clientes | A ficha é a configuração do cliente (as tarefas dele ficam em Tarefas, pelo botão "Tarefas" da ficha). Editar = cadastro, contato e contrato. Abas: **marca** (identidade do cliente e de cada **marca** dele, com "Sugerir melhoria" e "Juntar outros clientes como marcas"), **contas** (redes sociais e atalhos de agendamento), **resultados**, **tráfego pago** (contas de anúncio e manutenções) e financeiro |
| Tráfego pago | Contas de anúncio e verba por cliente, alerta de manutenção atrasada (mais de 7 dias) e diário de manutenções |
| Financeiro | Receitas e despesas do mês, mensalidades a partir dos contratos e orçamentos. A rotina de cobrança cria a receita pendente e concluir a tarefa de cobrança marca como paga |
| Rotinas | Tarefas automáticas: produzir a semana seguinte, planejar o mês seguinte, cobrar a mensalidade no vencimento e rotinas livres |
| Relatórios | Por cliente ou geral, por mês ou período: posts publicados, outras entregas, manutenções, reuniões e financeiro. Exporta PDF. Meses antigos leem o arquivo de tarefas |
| Usuários e equipe | Três tipos: **Administrador** (tudo, inclusive Financeiro), **Equipe** (áreas Conteúdo e/ou Tráfego pago, todos ou alguns clientes) e **Cliente** (portal do cliente). **+ Adicionar usuário** por e-mail (convite: a pessoa entra já liberada), pedidos de acesso e de mais acesso para qualquer administrador aprovar, áreas e **clientes que cada um pode ver**, e pessoas da equipe sem conta |
| Studio (beta) | Para a equipe e para o cliente: escolhe a marca e depois **Studio fotográfico** (direção de fotos da marca, dicas e roteiro da sessão), **Studio de conteúdo** (legenda com o Claude e pedido de arte para o Canva com o tom, as cores e as fontes da marca) ou **Ideias** (pauta na linha editorial da marca; cole as ideias do Claude e cada uma vira post). A equipe salva como post; o cliente envia como sugestão. Quem tem a chave da OpenAI também gera aqui dentro |
| Portal do cliente | Quem tem acesso de **cliente** (de um cliente ou só de algumas marcas) vê um Hyper Studio simplificado: **Início** (posts para aprovar com imagem e legenda, "Aprovar" e "Pedir ajuste", próximas publicações), **Calendário**, **Marca** (identidade e redes, só leitura), **Resultados** e **Sugerir um post** (entra como ideia; "Legenda com o Claude" usa o tom de voz da marca). Não vê tarefas internas, outros clientes, valores nem a equipe |
| Minha conta | Clique no seu nome no menu: foto, nome, seu acesso, pedir mais acesso (áreas ou clientes) e suas conexões (Google Agenda) |
| Creators | Em breve: cadastro de influenciadoras (perfil, público, clientes atendidos) |
| Lixeira | O que foi excluído nos últimos 30 dias, com restaurar (administrador) |
| Ajustes | E-mails e automações (resumo diário, backup semanal), relatórios da Meta (App ID), modelos de checklist, erros recentes,  (Gmail da Hyper via Apps Script), chave da OpenAI, importação de definições de marca (.json, com marcas), importação da planilha e backup |

### Marcas e grupos

Clientes com várias marcas funcionam como grupo (ex.: um grupo de academias com uma marca para cada modalidade). Cada marca tem logo, cores, fontes, tom de voz, persona, público e estilo próprios; o grupo tem só a identidade institucional. As redes sociais (Instagram, Facebook, TikTok, YouTube, LinkedIn, Google Meu Negócio, WhatsApp Business, Pinterest, Threads, X, site; lista em `CAMPOS_REDES`) também são de cada marca e não passam do grupo para a marca. Ao abrir um grupo, primeiro se escolhe a marca (ou o "geral" do grupo); depois a ficha é igual à de um cliente comum (Marca, Contas, Resultados). Contrato, tráfego pago e financeiro ficam no geral do grupo. Na aba Marca do cliente, "Juntar outros clientes como marcas" transforma clientes soltos em marcas do grupo, e "Separar em cliente próprio" faz o contrário.

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
  js/comercial.js       catálogo de serviços, modelo de contrato, valores por extenso e documentos (contrato e proposta)
  js/busca.js           busca rápida (Ctrl+K)
  js/views/*.js         uma tela por arquivo
firestore.rules         permissões por área (ver "Usuários e permissões")
testes/                 testes das regras (emulador) e das telas (Playwright com o Firebase em memória)
```

Não precisa de build: o SDK do Firebase vem do CDN.

## Usuários e permissões

Duas formas de entrar: o administrador adiciona o e-mail em Usuários (vira `convites/{email}`; no primeiro login a pessoa entra liberada com aquele acesso) ou a pessoa entra e pede acesso (fica `pendente` com o `pedido`, e qualquer administrador aprova). Cada membro pode ter `acessoClientes: "alguns"` com a lista `clientes`: as regras só deixam ler os itens desses clientes (e os sem cliente), e o app lê essas coleções com consultas por `clienteId`.

Comercial: `config/comercial` guarda os dados da Hyper nos contratos, os serviços com preços, as despesas fixas, a reserva (%) e o modelo do contrato (só quem tem Financeiro e vê todos os clientes lê; só administradores gravam). Contrato e orçamento são gerados por administradores (Financeiro → Contratos / Orçamentos); os dados usados no contrato ficam em `contratos/{clienteId}.dadosContrato`. Mensalidades (`mens-<cliente>-<mês>`) e despesas fixas (`fixa-<id>-<mês>`) entram sozinhas do mês atual em diante.

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

## Recursos de colaboração

- **Comentários e histórico** em cada tarefa/post (`tarefas/{id}/atividade`), com @menção que avisa por e-mail.
- **Aprovação do cliente por link** (`aprovar.html?t=<token>`, sem login, 60 dias): o cliente aprova ou pede ajuste em cada post; a resposta muda a etapa do post e entra no histórico (`aprovacoes.js`).
- **Calendário rápido**: arrastar posts entre dias, avançar a etapa no cartão (›) e trocar a etapa na lista.
- **Carga da equipe** (Tarefas → Carga da equipe) e **modelos de checklist** por formato e tipo (`MODELOS_PADRAO`, editáveis em Ajustes).
- **Resultados** (aba do cliente): números do Instagram e do Facebook por marca e por post, pela Graph API da Meta (`meta.js`), com o Facebook de cada pessoa (acesso só no navegador).
- **Automações** no Apps Script da conta da Hyper (`docs/email`): e-mails, resumo diário às 8h, backup semanal compacto (.json.gz, sem imagens, 8 mais recentes) no Drive da Hyper e **Google Agenda**: a cada 5 minutos o script põe os compromissos marcados na agenda "Hyper · Compromissos" da conta da Hyper e convida os participantes (no e-mail de agenda de cada um, em Minha conta). Não usa o Google Cloud Console nem login no navegador.
- **App instalável** (`manifest.webmanifest`, `sw.js`): no celular, "Adicionar à tela de início".
- **Lixeira** (`lixeira`, 30 dias) e **registro de erros** (`erros`, 30 dias).

## Testes

```
npm install
npx playwright install chromium
npm test            # regras do Firestore no emulador (precisa de Java) + telas
```

No GitHub os testes rodam em todo pull request e antes de publicar.

## Publicação

Um push no `main` roda os testes e, se passarem, publica o site pelo GitHub Actions. As regras do Firestore (`firestore.rules`) precisam ser coladas à mão em Firestore → Segurança no console do Firebase sempre que mudarem.
