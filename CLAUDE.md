# Hyper App

App web da Hyper Estratégia Digital (agência de estratégia digital: conteúdo, social media, tráfego pago e mais) com Firebase: projeto `hyper-9e023`, Auth, Firestore e Hosting. HTML, CSS e JavaScript puros, sem build. O SDK do Firebase vem do CDN (gstatic).

## Identidade visual: obrigatória

Toda interface deste repositório segue `docs/identidade-visual.md`.
- Use sempre as variáveis CSS do topo de `public/css/style.css` (`--hyper-roxo`, `--cor-primaria`, `--fonte-titulo` etc.). Não escreva cores ou fontes soltas no código.
- Logos e ícones ficam em `public/img/`. Não recrie o logo em SVG ou texto.
- Os originais da marca estão em `docs/marca/` e não são publicados.

## Código

- Estrutura e coleções do Firestore descritas no `README.md`. Uma tela por arquivo em `public/js/views/`.
- Todos os dados ficam no espaço compartilhado `espacos/hyper/<coleção>` e são lidos da memória (`dados` em `db.js`). Não faça consultas com `where`/`orderBy` no Firestore: filtre em memória. `users/{uid}` é só o backup antigo.
- Usuários e permissões: `espacos/hyper/membros/{uid}` com `papel` (`admin`/`basico`/`cliente`), `permissoes` (`conteudo`, `trafego`) e `status` (`pendente`/`ativo`). O Financeiro (valores, contratos, orçamentos, comercial) é só de administrador, também nas regras. `cliente` = pessoa do cliente: usa o portal (`views/portal.js`: Início para aprovar, Calendário, Marca, Resultados, Sugerir post), com `clientes` e, opcionalmente, `marcas` (só essas marcas). Nas regras, `ativo()` é só a equipe; o que o cliente pode fica em `cliente()`/`postDoCliente()`. Use `ehCliente()`/`marcasRestritas()` de `permissoes.js`. Cliente nunca entra nas listas da equipe (responsáveis, menções, resumo diário, agenda). Criativos guardam `marcaId` (o cliente de uma marca só lê os dela). O dono do espaço (conta da Hyper) é sempre admin. Use `pode(area)`, `ehAdmin()` e `tarefaVisivel()` de `permissoes.js` nas telas, e mantenha `firestore.rules` coerente: dados sensíveis (financeiro, contratos, orçamentos, contas de anúncio, manutenções, chave da OpenAI) são protegidos nas regras, não só escondidos na tela.
- Acesso por cliente: `acessoClientes: "alguns"` + `clientes` no membro. Para essas pessoas, `db.js` lê as coleções por cliente (`ouvirColecao`, consultas `where("clienteId", "in", …)` em lotes de 30; `clientes`/`contratos` documento a documento). É a única exceção à regra de não usar `where`, porque as regras exigem a consulta filtrada. Todo documento ligado a cliente precisa ter `clienteId` (use `""` quando não tiver cliente).
- Convites em `convites/{email em minúsculas}`; pedidos em `membros/{uid}.pedido`. A própria pessoa só muda `nome`, `foto` e `pedido` (Minha conta, `views/conta.js`).
- E-mails: `emails.js` + Apps Script (`docs/email/Codigo.gs`). Só administradores enviam (precisam do segredo em `config/email`); sem segredo o script só avisa os administradores. As cores da marca vão escritas em `emails.js` porque e-mail não aceita variáveis de CSS.
- Conexões pessoais (e-mail da agenda, Facebook/Instagram) ficam em Minha conta, não em Ajustes. Tokens (Google, Meta) nunca vão para o banco.
- Excluir sempre por `excluir()` de `db.js`: nas coleções de `COM_LIXEIRA` guarda uma cópia na `lixeira` (30 dias). Para mover dados (não é exclusão de verdade), use `{ lixeira: false }`. O desfazer usa `desfazerExclusao()`.
- Mudanças relevantes em tarefas entram no histórico (`registrarAtividade`); comentários ficam em `tarefas/{id}/atividade`.
- Erros mostrados com `avisar(..., "erro")` e erros não tratados vão para `erros` (Ajustes → Erros recentes).
- Aprovação do cliente: `aprovacoes/{token}` (público por token, expira) e `aprovar.html` + `js/aprovar.js` (sem login). Nunca coloque valores de contrato ou dados internos na fotografia do link.
- Relatórios da Meta: `meta.js` (Graph API pelo navegador, App ID em `config/meta`). Peça cada métrica separada: a Meta aposenta métricas com frequência.
- Automações (resumo diário, backup) rodam só no Apps Script da conta da Hyper (`docs/email/Codigo.gs`, lendo o Firestore pela API REST como dona do projeto). Backup sempre compacto e sem imagens.
- Valores de contrato (mensalidade, dia de vencimento) ficam em `contratos/{clienteId}`, nunca na ficha do cliente. Use `contrato(clienteId)` de `db.js`.
- Coisas pessoais de cada usuário (Google Agenda conectada) ficam em `espacos/hyper/pessoal/{uid}/...`.
- Datas são texto `AAAA-MM-DD`; use as funções de data de `ui.js`.
- Formulários usam `formulario()` de `ui.js` (campos podem ter `mostrarSe(valores)` e selects podem ter `opcoesDe(valores)`).
- Post = tarefa com `tipo: "Conteúdo"` (`TIPO_CONTEUDO`). Não recrie uma coleção separada de conteúdos. O post tem um status só: a etapa (`statusConteudo`); o `status` de tarefa sai dela (`statusDaEtapa`/`etapaDoStatus` em `constantes.js`).
- Grupos: cliente com marcas é um grupo (guarda-chuva, `ehGrupo()`); a identidade de cada negócio (logo, cores, tom de voz…) fica na marca, e a do cliente vale só para os posts institucionais do grupo (sem marca) e completa o que estiver vazio nas marcas. A marca `principal` vem primeiro (`marcasDo`). Para reorganizar use a aba Marca: "Juntar outros clientes como marcas" (`juntarUm`) e "Separar em cliente próprio" (`separarMarca`), em `views/marca.js`.
- Importação: um lugar só, Ajustes → Importar arquivo do Claude, que reconhece o `tipo` do .json (`planejamento-hyper`, `financeiro-hyper` ou lista de marcas). Os .json ficam fora do repositório.
- Marcas: um cliente pode ter várias marcas (`marcas`, com `clienteId`). Post/tarefa guarda `marcaId`. Para copy, imagem, Canva e PDF use `identidade(clienteId, marcaId)` de `db.js` (marca com o que faltar vindo do cliente). Identidade (sobre a marca, cores, fontes, tom de voz, público, persona, diretrizes de conteúdo…) só se edita na aba Marca; as diretrizes (pilares, estrutura, rodapé, hashtags, o que evitar) entram no texto pedido à IA; o "Editar" do cliente é só cadastro, contato e contrato. Ficha de grupo: primeiro a tela de escolha da marca (`#/clientes/<id>`), depois a ficha igual à de um cliente comum (`#/clientes/<id>/marca/<marcaId>`, ou `/marca/grupo` para o geral, que tem contrato, tráfego e financeiro); use `marcaEscolhida()` de `views/marca.js`. Redes sociais (`CAMPOS_REDES` em `constantes.js`) ficam na aba Contas, da conta aberta; para um post use `redesDe(clienteId, marcaId)` de `views/contas.js`. A ficha do cliente não tem tarefas nem conteúdo: o botão leva para `#/tarefas/<cliente>[/<marca>]`.
- Tipos de tarefa: os 8 de `TIPOS_TAREFA` (+ "Reunião", que vira compromisso). Tipos antigos são convertidos por `migrarTipos()`.
- Tarefas concluídas há mais de 90 dias vão para `tarefasArquivo` (`arquivarAntigas()`, só admin). Telas que olham meses antigos usam `todasTarefas()` e `garantirArquivo(data)`/`carregarArquivo()`.
- Ações que apagam ou concluem oferecem desfazer: `avisar(msg, "ok", { desfazer })`.
- Planejamento é um modo do Calendário (`#/calendario/<cliente>/<mês>/planejar`) e o Criar abre dentro do post (`abrirCriarArte`). As rotas `#/planejamento` e `#/criar` só redirecionam.
- Rotina de cobrança cria a receita `mens-<cliente>-<mês>` (`garantirMensalidade`) e concluir a tarefa marca como paga (`quitarCobranca`).
- Arquivos da marca (logos, fontes, referências) ficam na pasta do Drive do cliente (`linkDrive`). Criativos dos posts ficam em base64 em `clientes/{id}/artes` (`arquivos.js`), não no Firebase Storage (plano Spark).
- Rotinas (`recorrencias`) têm `modelo`: `livre`, `producao` (semana seguinte), `planejamento` (mês seguinte) ou `cobranca` (vencimento do cliente). A lógica fica em `recorrencias.js`.
- Compromissos (`compromissos`, `agenda.js`, `compromissos.js`) são a única coisa que vai para a Google Agenda. Quem cria os eventos é o Apps Script da Hyper (`sincronizarAgenda` em `docs/email/Codigo.gs`, a cada 5 min ou quando o app pede `agenda-agora`): agenda "Hyper · Compromissos" da conta da Hyper, com convite para `emailAgenda || email` de cada participante. Usa o serviço avançado Calendar do Apps Script e atualiza o MESMO evento (`Events.patch` com `sendUpdates: "all"`), para todos receberem a mudança. O app pede a sincronização sozinho ao salvar/excluir (`sincronizar()` em `agenda.js`). O app não chama a API do Google Calendar. Posts nunca vão para a agenda.
- Cor principal do cliente = `paleta[0]` (também gravada em `cor`); use `corCliente()` de `views/componentes.js`. Campos de cor usam `campoCor()` de `ui.js` (sempre mostram a cor, não só o código).
- Tarefas têm `responsavel` (equipe = membros do espaço + pessoas sem conta em `config/equipe`). Tarefa do tipo "Reunião" vira compromisso.
- Exportação para o cliente é só PDF. Arte final é feita no Canva (pedido para o Claude em `promptCanva`), não dentro do app.
- A chave da OpenAI fica em `espacos/hyper/config/openai` (só admin grava; só quem tem Conteúdo lê). Nunca coloque chaves no código: o repositório é público.

## Publicação

- Um push no `main` roda os testes e publica o Hosting pelo GitHub Actions (`.github/workflows/deploy.yml`, secret `FIREBASE_SERVICE_ACCOUNT`). Pull requests rodam só os testes.
- Testes: `testes/regras.test.mjs` (regras no emulador) e `testes/telas.spec.mjs` (Playwright com o Firebase em memória de `testes/mocks`). Ao mudar `firestore.rules` ou uma tela, atualize os testes. Os dados de teste são fictícios: nunca coloque dados de clientes no repositório.
- A conta de serviço não publica regras do Firestore. Quando `firestore.rules` mudar, avise o usuário para colar as regras em Firestore → Segurança no console.
- Evite consultas que exijam índice composto, ou avise o usuário para criar o índice.

## Idioma

Interface, textos e mensagens de commit em português do Brasil.
