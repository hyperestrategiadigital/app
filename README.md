# Hyper Studio

O Hyper Studio é a central de trabalho da Hyper Estratégia Digital, e no futuro também dos clientes: tarefas, clientes, calendário de conteúdo, tráfego pago e financeiro. Roda no Firebase (projeto `hyper-9e023`) e está publicado em https://hyper-9e023.web.app.

## Telas

Menu: **Hoje, Tarefas, Calendário, Clientes, Tráfego pago, Financeiro** e o grupo **Administração** (Rotinas, Relatórios, Usuários e equipe, Ajustes). **Ctrl+K** (⌘K no Mac) abre a busca rápida: clientes, marcas, posts, tarefas, compromissos e telas.

| Tela | O que faz |
|---|---|
| Hoje | **Minhas / Equipe**: cada pessoa vê primeiro o que é dela. Atrasadas, tarefas do dia e da semana (cada dia abre e fecha), conteúdos, valores a receber, **primeiros passos** (administrador) e dicas rápidas |
| Tarefas | Quadro A fazer / Em andamento / Concluído (arrastar e soltar) ou lista, com busca e filtros. Tipos: Conteúdo, Produção, Projeto, Tráfego pago, Financeiro / Comercial, Planejamento, Organização e Outro ("Reunião" abre como compromisso). Tarefas que não são post têm o campo **Texto** com **✨ Criar texto** (apresentação, e-book, página, mensagem). Posts e tarefas podem ser de uma **campanha**. Concluir e excluir têm **Desfazer**. **Produzir semana**: os posts planejados da semana ficam dentro dessa tarefa, como checklist (marcar = produzido; clicar abre o post); soltos ficam só os posts extras e as sugestões dos clientes. No post, **✨ Criar copy** junta o briefing com a identidade da marca. Vídeo: o **roteiro** entra no Produzir semana da semana anterior. O card avisa posts perto da data e tem **Mandar para aprovação**, **Copiar legendas** e **Copiar para outra semana**. No post: prazo automático pelo formato, **pilar de conteúdo**, **Montar briefing** e **Duplicar** |
| Calendário | Camadas **Tudo / Conteúdo / Compromissos**, filtro por cliente e por marca. Com um cliente filtrado, a aba **Planejar mês** abre o planejamento (grade do mês ou tabela, "Formato \| Tema" no dia, arrastar entre dias). PDF por cliente (ou marca) e mês para aprovação. Compromissos podem ir para a Google Agenda pessoal (posts nunca vão) |
| Post | Tarefa do tipo **Conteúdo** com marca, formato, rede, data/hora, **etapa** (ideia → publicado; o status de tarefa sai da etapa), objetivo (etapa do funil), campanha, copy e criativos (o criativo final, feito no Canva, é anexado ao post). Vídeo já gravado: a copy sai da transcrição. **★ Usar como exemplo**: a copy entra como exemplo da marca nos pedidos |
| Clientes | A ficha é a configuração do cliente (as tarefas dele ficam em Tarefas, pelo botão "Tarefas" da ficha). Editar = cadastro, contato e contrato. Abas: **marca** (identidade do cliente e de cada **marca** dele, e "Juntar outros clientes como marcas"), **campanhas** (agrupam peças de um objetivo; briefing, mensagem e condições vão para a copy), **escopo** (o que é entregue, frequência e quem faz: Hyper, cliente ou terceiro), **contas** (redes sociais e atalhos de agendamento), **resultados**, **tráfego pago** (contas de anúncio e manutenções) e financeiro |
| Tráfego pago | Contas de anúncio e verba por cliente, alerta de manutenção atrasada (mais de 7 dias) e diário de manutenções |
| Financeiro | Receitas e despesas do mês, mensalidades a partir dos contratos e orçamentos. A rotina de cobrança cria a receita pendente e concluir a tarefa de cobrança marca como paga |
| Menus e listas | Ajustes → Menus e listas: tipos de tarefa, formatos (com os dias de antecedência da produção) e redes. O que sair da lista continua nos itens que já usam |
| Rotinas | Tarefas automáticas: produzir a semana seguinte, planejar o mês seguinte, cobrar a mensalidade no vencimento e rotinas livres |
| Relatórios | Por cliente ou geral, por mês ou período: posts publicados, outras entregas, manutenções, reuniões e financeiro. Exporta PDF. Meses antigos leem o arquivo de tarefas |
| Usuários e equipe | Três tipos: **Administrador** (tudo, inclusive Financeiro), **Equipe** (áreas Conteúdo e/ou Tráfego pago, todos ou alguns clientes) e **Cliente** (portal do cliente). **+ Adicionar usuário** por e-mail (convite: a pessoa entra já liberada), pedidos de acesso e de mais acesso para qualquer administrador aprovar, áreas e **clientes que cada um pode ver**, e pessoas da equipe sem conta |
| IA (Criar copy) | A IA na plataforma é só para a copy, e cada pessoa usa a própria IA (Claude ou ChatGPT). O botão **✨ Criar copy** (no post e no Sugerir do portal) monta um pedido completo, conforme o formato (legenda; roteiro ou, se o vídeo já foi gravado, legenda da transcrição; lâminas; stories; anúncio com variações; artigo/blog; e-mail com assunto; WhatsApp): manual da Hyper, identidade da marca (diretrizes marcadas com [Formato] só no formato delas), exemplos, campanha, o post (com datas comemorativas e o objetivo), regras do formato e da rede. A pessoa cola na IA e cola a resposta de volta: o app distribui legenda e roteiro/texto da arte. O app não chama nenhuma IA nem gera imagem. Na aba Marca: **medidor** da ficha e o que os clientes pediram para ajustar (vira regra sempre, só num formato ou só na campanha). Em Ajustes: **Manual de escrita da Hyper** |
| Portal do cliente | Quem tem acesso de **cliente** (de um cliente ou só de algumas marcas) vê um Hyper Studio simplificado: **Início** (posts para aprovar com imagem e legenda, "Aprovar" e "Pedir ajuste", próximas publicações; pelo link de aprovação as ideias chegam como **tema para aprovar** e, aprovadas, vão para a produção), **Calendário**, **Marca** (identidade e redes, só leitura), **Resultados** e **Sugerir um post** (entra como ideia; "✨ Criar copy" usa o tom de voz da marca). Não vê tarefas internas, outros clientes, valores nem a equipe |
| Minha conta | Clique no seu nome no menu: foto, nome, seu acesso, pedir mais acesso (áreas ou clientes) e suas conexões (Google Agenda) |
| Lixeira | O que foi excluído nos últimos 30 dias, com restaurar (administrador) |
| Ajustes | E-mails e automações (resumo diário, backup semanal), relatórios da Meta (App ID), manual de escrita, menus e listas, **datas comemorativas** (da Hyper e de cada marca), modelos de checklist, erros recentes, importação de definições de marca (.json ou texto colado), backup, banco em uso e **espaço dos criativos** (quanto ocupam e limpeza dos antigos) |

### Marcas e grupos

Clientes com várias marcas funcionam como grupo (ex.: um grupo de academias com uma marca para cada modalidade). Cada marca tem logo, cores, fontes, tom de voz, persona, público e estilo próprios; o grupo tem só a identidade institucional. As redes sociais (Instagram, Facebook, TikTok, YouTube, LinkedIn, Google Meu Negócio, WhatsApp Business, Pinterest, Threads, X, site; lista em `CAMPOS_REDES`) também são de cada marca e não passam do grupo para a marca. Ao abrir um grupo, primeiro se escolhe a marca (ou o "geral" do grupo); depois a ficha é igual à de um cliente comum (Marca, Contas, Resultados). Contrato, tráfego pago e financeiro ficam no geral do grupo. Na aba Marca do cliente, "Juntar outros clientes como marcas" transforma clientes soltos em marcas do grupo, e "Separar em cliente próprio" faz o contrário.

Um cliente pode ter várias marcas com identidades diferentes (ex.: um grupo com várias empresas). A identidade do próprio cliente é a "marca principal"; cada marca extra fica em `marcas` com `clienteId`, nome e os mesmos campos de identidade (campo vazio = usa o do cliente). O post guarda `marcaId`; o pedido de copy e o PDF usam a identidade da marca (`identidade()` em `db.js`).

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

Cada pessoa entra com o próprio Google e pede acesso; o administrador libera em **Usuários**. Áreas: **Conteúdo** (posts, planejamento, copy, marca), **Tráfego pago** (contas, verbas, manutenções) e **Financeiro** (mensalidades, cobranças, orçamentos e valores). Sem áreas = acesso básico (Hoje, Tarefas, compromissos, lista de clientes). As regras do Firestore (`firestore.rules`) protegem os dados sensíveis.

## Dados no Firestore

Tudo fica no espaço compartilhado `espacos/hyper/<coleção>` (o antigo `users/{uid}` ficou só no console, sem acesso pelo app): `membros`, `contratos` (mensalidade e vencimento, só financeiro), `pessoal/{uid}` (coisas de cada usuário) e `clientes` (com `escopo` e `servicos`), `marcas`, `campanhas`, `tarefas`, `tarefasArquivo` (concluídas há mais de 90 dias, lidas só quando preciso), `recorrencias`, `financeiro`, `orcamentos`, `contasAds`, `manutencoes`, `config` (docs `equipe` com `pessoas: [{nome, email}]`, `listas`, `manual`, `datas`, `modelos`, `meta`, `email`, `comercial`), `compromissos`. Datas são texto `AAAA-MM-DD`.

- Posts são tarefas com `tipo: "Conteúdo"` e os campos `marcaId`, `formato`, `rede`, `dataPublicacao`, `hora`, `statusConteudo`, `objetivo` (reconhecimento, consideracao, conversao, relacionamento), `roteiro`, `copy`, `textoArte`, `campanhaId`, `videoGravado`, `transcricao`, `exemplo`. O `status` do post sai da etapa (`statusDaEtapa`).
- Tarefas de cobrança têm `lancamentoId` (`mens-<cliente>-<AAAA-MM>`), a receita do mês no Financeiro.
- O navegador guarda uma cópia local dos dados (cache do Firestore): o app abre rápido e funciona sem internet por um tempo.
- Arquivos da marca ficam na pasta do Drive do cliente (`linkDrive`), não no app.
- Criativos anexados aos posts ficam em `clientes/{id}/artes` (base64 comprimido, `tarefaId`, `marcaId`), lidos sob demanda. Links de aprovação vencidos há mais de 7 dias são apagados sozinhos (com as cópias das imagens). A tarefa guarda `qtdArtes`. O PDF usa o criativo final quando existe.
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
