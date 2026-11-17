# Hyper App

App web da Hyper (agência de tráfego pago) com Firebase: projeto `hyper-9e023`, Auth, Firestore e Hosting. HTML, CSS e JavaScript puros, sem build. O SDK do Firebase vem do CDN (gstatic).

## Identidade visual: obrigatória

Toda interface deste repositório segue `docs/identidade-visual.md`.
- Use sempre as variáveis CSS do topo de `public/css/style.css` (`--hyper-roxo`, `--cor-primaria`, `--fonte-titulo` etc.). Não escreva cores ou fontes soltas no código.
- Logos e ícones ficam em `public/img/`. Não recrie o logo em SVG ou texto.
- Os originais da marca estão em `docs/marca/` e não são publicados.

## Código

- Estrutura e coleções do Firestore descritas no `README.md`. Uma tela por arquivo em `public/js/views/`.
- Todos os dados ficam no espaço compartilhado `espacos/hyper/<coleção>` e são lidos da memória (`dados` em `db.js`). Não faça consultas com `where`/`orderBy` no Firestore: filtre em memória. `users/{uid}` é só o backup antigo.
- Usuários e permissões: `espacos/hyper/membros/{uid}` com `papel` (`admin`/`basico`), `permissoes` (`conteudo`, `trafego`, `financeiro`) e `status` (`pendente`/`ativo`). O dono do espaço (conta da Hyper) é sempre admin. Use `pode(area)`, `ehAdmin()` e `tarefaVisivel()` de `permissoes.js` nas telas, e mantenha `firestore.rules` coerente: dados sensíveis (financeiro, contratos, orçamentos, contas de anúncio, manutenções, chave da OpenAI) são protegidos nas regras, não só escondidos na tela.
- Valores de contrato (mensalidade, dia de vencimento) ficam em `contratos/{clienteId}`, nunca na ficha do cliente. Use `contrato(clienteId)` de `db.js`.
- Coisas pessoais de cada usuário (Google Agenda conectada) ficam em `espacos/hyper/pessoal/{uid}/...`.
- Datas são texto `AAAA-MM-DD`; use as funções de data de `ui.js`.
- Formulários usam `formulario()` de `ui.js` (campos podem ter `mostrarSe(valores)`).
- Post = tarefa com `tipo: "Conteúdo"` (`TIPO_CONTEUDO`). Não recrie uma coleção separada de conteúdos.
- Arquivos da marca (logos, fontes, referências) ficam na pasta do Drive do cliente (`linkDrive`). Criativos dos posts ficam em base64 em `clientes/{id}/artes` (`arquivos.js`), não no Firebase Storage (plano Spark).
- Rotinas (`recorrencias`) têm `modelo`: `livre`, `producao` (semana seguinte), `planejamento` (mês seguinte) ou `cobranca` (vencimento do cliente). A lógica fica em `recorrencias.js`.
- Compromissos (`compromissos`, `agenda.js`, `compromissos.js`) são a única coisa que vai para a Google Agenda. A conexão usa um app Firebase secundário ("agenda") para permitir outra conta Google; o token dura ~1 h e não é salvo no banco. Posts nunca vão para a agenda.
- Cor principal do cliente = `paleta[0]` (também gravada em `cor`); use `corCliente()` de `views/componentes.js`. Campos de cor usam `campoCor()` de `ui.js` (sempre mostram a cor, não só o código).
- Tarefas têm `responsavel` (equipe = membros do espaço + pessoas sem conta em `config/equipe`). Tarefa do tipo "Reunião" vira compromisso.
- Exportação para o cliente é só PDF. Arte final é feita no Canva (pedido para o Claude em `promptCanva`), não dentro do app.
- A chave da OpenAI fica em `espacos/hyper/config/openai` (só admin grava; só quem tem Conteúdo lê). Nunca coloque chaves no código: o repositório é público.

## Publicação

- Um push no `main` publica o Hosting pelo GitHub Actions (`.github/workflows/deploy.yml`, secret `FIREBASE_SERVICE_ACCOUNT`).
- A conta de serviço não publica regras do Firestore. Quando `firestore.rules` mudar, avise o usuário para colar as regras em Firestore → Segurança no console.
- Evite consultas que exijam índice composto, ou avise o usuário para criar o índice.

## Idioma

Interface, textos e mensagens de commit em português do Brasil.
