# Hyper App

App web da Hyper (agência de tráfego pago) com Firebase: projeto `hyper-9e023`, Auth, Firestore e Hosting. HTML, CSS e JavaScript puros, sem build. O SDK do Firebase vem do CDN (gstatic).

## Identidade visual: obrigatória

Toda interface deste repositório segue `docs/identidade-visual.md`.
- Use sempre as variáveis CSS do topo de `public/css/style.css` (`--hyper-roxo`, `--cor-primaria`, `--fonte-titulo` etc.). Não escreva cores ou fontes soltas no código.
- Logos e ícones ficam em `public/img/`. Não recrie o logo em SVG ou texto.
- Os originais da marca estão em `docs/marca/` e não são publicados.

## Código

- Estrutura e coleções do Firestore descritas no `README.md`. Uma tela por arquivo em `public/js/views/`.
- Todos os dados ficam em `users/{uid}/<coleção>` e são lidos da memória (`dados` em `db.js`). Não faça consultas com `where`/`orderBy` no Firestore: filtre em memória.
- Datas são texto `AAAA-MM-DD`; use as funções de data de `ui.js`.
- Formulários usam `formulario()` de `ui.js` (campos podem ter `mostrarSe(valores)`).
- Post = tarefa com `tipo: "Conteúdo"` (`TIPO_CONTEUDO`). Não recrie uma coleção separada de conteúdos.
- Arquivos (imagens, fontes) ficam em base64 em subcoleções do cliente (`arquivos.js`), não no Firebase Storage (plano Spark).
- A chave da OpenAI fica em `users/{uid}/config/openai`. Nunca coloque chaves no código: o repositório é público.

## Publicação

- Um push no `main` publica o Hosting pelo GitHub Actions (`.github/workflows/deploy.yml`, secret `FIREBASE_SERVICE_ACCOUNT`).
- A conta de serviço não publica regras do Firestore. Quando `firestore.rules` mudar, avise o usuário para colar as regras em Firestore → Segurança no console.
- Evite consultas que exijam índice composto, ou avise o usuário para criar o índice.

## Idioma

Interface, textos e mensagens de commit em português do Brasil.
