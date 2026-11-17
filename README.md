# Hyper App

Central de trabalho da Hyper: tarefas, clientes, calendário de conteúdo, tráfego pago e financeiro. Roda no Firebase (projeto `hyper-9e023`) e está publicado em https://hyper-9e023.web.app.

## Telas

| Tela | O que faz |
|---|---|
| Hoje | Atrasadas, tarefas do dia e da semana, conteúdos programados e valores a receber |
| Tarefas | Quadro A fazer / Em andamento / Concluído (arrastar e soltar) ou lista, com busca e filtros por cliente e tipo. Cada tarefa tem checklist de entregas e links do Canva e do Drive. O atraso é calculado pelo prazo |
| Conteúdo | Calendário do mês por cliente, status de produção (ideia → publicado), data e hora de agendamento e botão que monta o prompt de copy para o Claude com o tom de voz do cliente |
| Clientes | Ficha com serviços, contato, links, mensalidade, tom de voz e público, e abas de tarefas, conteúdo, tráfego e financeiro |
| Tráfego pago | Contas de anúncio e verba por cliente, alerta de manutenção atrasada (mais de 7 dias) e diário de manutenções |
| Financeiro | Receitas e despesas do mês, mensalidades geradas a partir das fichas dos clientes e orçamentos |
| Ajustes | Tarefas recorrentes (ex.: Manutenção TP toda sexta), importação da planilha e backup |

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

Tudo fica em `users/{uid}/<coleção>`: `clientes`, `tarefas`, `recorrencias`, `conteudos`, `financeiro`, `orcamentos`, `contasAds`, `manutencoes`. Datas são texto `AAAA-MM-DD`.

## Publicação

Um push no `main` publica o site pelo GitHub Actions. As regras do Firestore (`firestore.rules`) precisam ser coladas à mão em Firestore → Segurança no console do Firebase sempre que mudarem.
