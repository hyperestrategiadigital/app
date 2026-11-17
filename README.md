# Hyper App

Central de trabalho da Hyper: tarefas, clientes, calendário de conteúdo, tráfego pago e financeiro. Roda no Firebase (projeto `hyper-9e023`) e está publicado em https://hyper-9e023.web.app.

## Telas

| Tela | O que faz |
|---|---|
| Hoje | Atrasadas, tarefas do dia e da semana, conteúdos programados e valores a receber |
| Tarefas | Quadro A fazer / Em andamento / Concluído (arrastar e soltar) ou lista, com busca e filtros por cliente e tipo. Cada tarefa tem checklist de entregas e links do Canva e do Drive. O atraso é calculado pelo prazo |
| Conteúdo | Calendário do mês. Cada post é uma tarefa do tipo **Conteúdo** (formato, rede, data/hora de publicação, etapa ideia → publicado, copy). Cor e nome do cliente em cada post, legenda clicável, exportação em PDF por cliente e mês para aprovação (1ª página em calendário, depois os detalhes de cada post) |
| Planejamento | Calendário do mês de um cliente (como a planilha de planejamento): digita "Formato \| Tema" no dia, arrasta entre dias, clica para editar. Também há modo tabela. Ao salvar, cada post vira (ou atualiza) uma tarefa e aparece na aba Conteúdo. Depois de salvar, oferece o PDF para o cliente aprovar |
| Rotinas | Tarefas automáticas: produzir os posts da semana seguinte (com a lista ao vivo dos posts), planejar o mês seguinte, cobrar a mensalidade no vencimento e rotinas livres (Manutenção TP etc.) |
| Criar | Escolhe cliente e post e gera a imagem com a OpenAI usando a marca do cliente. "Levar ao Canva" baixa a imagem, salva no post e copia um pedido de arte para o Claude (com o conector do Canva) montar o design e devolver o link. O link do Canva fica salvo no post |
| Clientes | Ficha com serviços, contato, links, mensalidade, tom de voz e público, e abas de tarefas, conteúdo, **marca** (link da pasta do Drive com logos/fontes/referências, paleta, fontes, estilo de imagem, diagramação), tráfego e financeiro |
| Tráfego pago | Contas de anúncio e verba por cliente, alerta de manutenção atrasada (mais de 7 dias) e diário de manutenções |
| Financeiro | Receitas e despesas do mês, mensalidades geradas a partir das fichas dos clientes e orçamentos |
| Ajustes | Chave da OpenAI, importação da planilha e backup |

## Estrutura

```
public/
  index.html            login e estrutura (menu lateral + conteúdo)
  css/style.css         identidade visual (tokens no topo) e componentes
  js/firebase.js        configuração do Firebase
  js/app.js             login, navegação (#/rota) e inicialização
  js/db.js              dados em memória sincronizados com o Firestore (users/{uid}/...)
  js/ui.js              elementos, modais, formulários, datas e moeda
  js/constantes.js      listas fixas (status, tipos, formatos...)
  js/recorrencias.js    geração automática das tarefas recorrentes
  js/importacao.js      leitura do CSV da planilha Fluxo de Trabalho
  js/views/*.js         uma tela por arquivo
firestore.rules         cada usuário só acessa users/{seu uid}/...
```

Não precisa de build: o SDK do Firebase vem do CDN.

## Dados no Firestore

Tudo fica em `users/{uid}/<coleção>`: `clientes`, `tarefas`, `recorrencias`, `financeiro`, `orcamentos`, `contasAds`, `manutencoes`, `config` (doc `openai` com a chave da API). Datas são texto `AAAA-MM-DD`.

- Posts são tarefas com `tipo: "Conteúdo"` e os campos `formato`, `rede`, `dataPublicacao`, `hora`, `statusConteudo`, `objetivo`, `roteiro`, `copy`. A antiga coleção `conteudos` é migrada automaticamente.
- Arquivos da marca ficam na pasta do Drive do cliente (`linkDrive`), não no app.
- Criativos anexados aos posts ficam em `clientes/{id}/artes` (base64 comprimido, `tarefaId`, `origem: gerada|final`), lidos sob demanda. A tarefa guarda `qtdArtes`. O PDF usa o criativo final quando existe.
- O banco pode ter id `(default)` ou `default`; o app descobre sozinho.

## Publicação

Um push no `main` publica o site pelo GitHub Actions. As regras do Firestore (`firestore.rules`) precisam ser coladas à mão em Firestore → Segurança no console do Firebase sempre que mudarem.
