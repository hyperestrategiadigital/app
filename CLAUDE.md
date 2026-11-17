# Hyper App

App web da Hyper (agência de tráfego pago) com Firebase: projeto `hyper-9e023`, Auth, Firestore e Hosting. HTML, CSS e JavaScript puros, sem build. O SDK do Firebase vem do CDN (gstatic).

## Identidade visual: obrigatória

Toda interface deste repositório segue `docs/identidade-visual.md`.
- Use sempre as variáveis CSS do topo de `public/css/style.css` (`--hyper-roxo`, `--cor-primaria`, `--fonte-titulo` etc.). Não escreva cores ou fontes soltas no código.
- Logos e ícones ficam em `public/img/`. Não recrie o logo em SVG ou texto.
- Os originais da marca estão em `docs/marca/` e não são publicados.

## Publicação

- Um push no `main` publica o Hosting pelo GitHub Actions (`.github/workflows/deploy.yml`, secret `FIREBASE_SERVICE_ACCOUNT`).
- A conta de serviço não publica regras do Firestore. Quando `firestore.rules` mudar, avise o usuário para colar as regras em Firestore → Segurança no console.
- Evite consultas que exijam índice composto, ou avise o usuário para criar o índice.

## Idioma

Interface, textos e mensagens de commit em português do Brasil.
