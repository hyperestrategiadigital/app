# Identidade visual Hyper

Guia para tudo que for construído neste repositório. Os arquivos originais da marca estão em `docs/marca/` (1 a 43). Os tokens prontos para o código estão no topo de `public/css/style.css`.

## Logo

| Arquivo (`public/img/`) | Quando usar |
|---|---|
| `logo-branco.png` | Wordmark "hyper" sobre fundo roxo, petróleo, cinza ou preto |
| `logo-roxo.png` | Wordmark sobre fundo branco ou claro |
| `simbolo-branco.png` / `simbolo-roxo.png` | Só o símbolo (h + seta), para espaços pequenos e ícones |
| `favicon.png`, `apple-touch-icon.png` | Ícone do site e atalho no celular |

Todos têm fundo transparente. Variações oficiais em outras cores (petróleo, cinza, amarelo, gelo, preto) estão em `docs/marca/`.

Regras:
- Não distorcer, girar, recolorir fora da paleta nem aplicar sombra ou contorno no logo.
- Manter uma área de respiro em volta do logo de pelo menos a altura da letra "e".
- A assinatura "TRÁFEGO PAGO" acompanha o logo em contextos institucionais: caixa alta, peso fino, espaçamento largo.
- Logo branco sobre amarelo não funciona. Sobre amarelo, use o preto (`docs/marca/28` a `30`).

## Cores

| Nome | Hex | Variável CSS | Uso |
|---|---|---|---|
| Roxo Hyper | `#4E2CA3` | `--hyper-roxo` | Cor principal: cabeçalho, botões, títulos, links |
| Roxo escuro | `#592C85` | `--hyper-roxo-escuro` | Hover e estados ativos, fundos alternativos |
| Petróleo | `#16626A` | `--hyper-petroleo` | Cor secundária: seções, gráficos, selos |
| Cinza | `#606060` | `--hyper-cinza` | Textos secundários e legendas |
| Amarelo | `#FFC130` | `--hyper-amarelo` | Destaque e chamada para ação. Usar com moderação |
| Gelo | `#C9D5E3` | `--hyper-gelo` | Bordas, divisórias, fundos suaves |
| Preto | `#000000` | `--hyper-preto` | Texto sobre amarelo e versões monocromáticas |
| Branco | `#FFFFFF` | `--hyper-branco` | Fundos e texto sobre cores escuras |

Combinações de contraste:
- Texto branco sobre roxo, roxo escuro, petróleo ou preto.
- Texto preto sobre amarelo ou gelo. Nunca texto branco sobre amarelo ou gelo.
- O amarelo é o botão principal da página (uma chamada por tela). O roxo é o botão padrão.

## Tipografia

O wordmark usa uma letra própria, condensada, pesada e inclinada. A assinatura usa uma sans geométrica fina. No site usamos fontes do Google Fonts que seguem esse espírito:

- **Títulos:** Barlow Condensed, peso 800, itálico (`--fonte-titulo`).
- **Texto:** Montserrat 300/400/600/700 (`--fonte-texto`). Use o peso 300 em caixa alta com espaçamento largo para assinaturas no estilo "TRÁFEGO PAGO".

Essas fontes são uma aproximação escolhida para o site, não as fontes oficiais da marca. Se a Hyper tiver as fontes oficiais, troque as variáveis.

## Componentes

- Cantos arredondados: `--raio` (12px) para cartões, `--raio-pequeno` (8px) para botões e campos.
- Sombra suave puxada para o roxo: `--sombra`.
- Foco de teclado com contorno amarelo.
- Itens de lista e destaques com barra lateral amarela.
