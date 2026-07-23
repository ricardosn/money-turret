# 🎯 Money Turret

**Um motor lógico e analítico para gestão patrimonial e provisionamento de projetos futuros.**

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat&logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)
![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow?style=flat)

---

## Sumário

- [A Filosofia](#-a-filosofia)
- [Features Principais](#-features-principais)
- [Stack Tecnológica](#-stack-tecnológica)
- [Como Rodar Localmente](#-como-rodar-localmente)
- [Estrutura do Projeto](#-estrutura-do-projeto)

---

## 🧭 A Filosofia

A maioria dos apps financeiros para de entregar valor exatamente no ponto onde a decisão fica difícil: eles mostram um gráfico de pizza bonito, um total gasto no mês, e param por aí. Isso é retrato, não análise.

O **Money Turret** parte de uma premissa diferente: dinheiro é um problema de séries temporais e classificação, não de infográfico. Por isso o sistema é construído em cima de três princípios:

- **Sem gráficos de pizza.** Percentual de gasto por categoria em um mês isolado não diz nada sobre tendência. O que importa é **análise de cohort** — como cada categoria evolui mês a mês — para enxergar inflação de padrão de vida antes que ela vire hábito.
- **Separação estrita entre custo fixo e flexível.** Aluguel e assinatura não competem pela mesma decisão que happy hour ou hobby. Misturá-los no mesmo número esconde exatamente a alavanca que você pode puxar.
- **Matemática pura, sem viés de UX bonito.** Toda agregação, projeção e média é calculada no backend, de forma determinística e testável — o frontend só renderiza o que o motor de análise já resolveu.

O resultado é um sistema pensado para apoiar decisões de compra complexas e planejamento de longo prazo, não para gerar uma tela de resumo satisfatória no fim do mês.

## ⚙️ Features Principais

### 📥 Ingestão Multi-Fonte

Cada banco exporta dados do seu jeito, e o motor de ingestão foi desenhado para absorver essa bagunça sem propagá-la para o resto do sistema:

- **Nubank** — CSV de conta corrente e fatura de cartão, com detecção automática de formato, limpeza de descrição e extração do prefixo de operação (`Transferência enviada pelo Pix`, `Aplicação RDB`, etc.).
- **Itaú** — o app do banco não exporta CSV/OFX, só PDF. Em vez de pedir para o usuário digitar o extrato à mão, o sistema faz engenharia reversa do layout do PDF com `pdfplumber`: extrai o texto por página, reconhece linhas de lançamento por regex (`data | descrição | valor`) e descarta corretamente as linhas de "saldo do dia", que não são transações.

Em ambos os casos, a deduplicação é determinística — reenviar o mesmo extrato duas vezes nunca duplica lançamentos.

### 🧠 Categorização via LLM

Descrições de extrato bancário são sujas por natureza (`PADARIA STELLA 042 SAO PAULO`, `PIX QRS AIBR INSTIT18/07`). Um motor de regras regex resolve o caso feliz, mas não escala para o volume de estabelecimentos novos que aparecem todo mês.

Para isso, a Claude API entra como camada de **micro-categorização cirúrgica**: em vez de jogar tudo em "Lazer" ou "Alimentação", o modelo distingue a compra de um manual de boardgame de uma expansão do mesmo jogo, separa uma cantina italiana de um supermercado genérico, e propõe uma regex reutilizável para a próxima vez que aquele estabelecimento aparecer — de forma que uploads futuros não precisem chamar o modelo de novo para o mesmo padrão.

### 🗓️ Simulador de Projetos (Provisionamento)

O extrato bancário é, por definição, retrospectivo. O **Simulador de Projetos** inverte essa lógica: em vez de analisar o que já aconteceu, ele estrutura o que ainda vai acontecer.

Um projeto (uma viagem de 15 a 20 dias pela Ásia, um fim de semana no litoral para uma prova de natação em águas abertas) recebe um orçamento total e uma data-alvo, e cada custo — passagem, seguro viagem, hospedagem, inscrição — vira um provisionamento com um mês de aporte esperado. O sistema então dilui o impacto financeiro em uma timeline mensal, mostrando exatamente quanto precisa ser guardado em cada mês e o progresso real (R$ provisionado vs. R$ orçado) até a data do evento.

### 🔇 Filtro de Ruído

Nem tudo que sai da conta é despesa. Pagar a própria fatura do cartão, aplicar em RDB, resgatar um investimento ou fazer um Pix para outra conta de mesma titularidade são **transferências internas** — e contá-las como gasto infla artificialmente as despesas e distorce a taxa real de poupança do mês.

O motor de ingestão marca essas movimentações com uma flag (`is_internal_transfer`) a partir de heurísticas específicas de cada banco (contrapartes conhecidas de corretoras no Nubank, nome do titular nos Pix do Itaú), e todas as análises — despesa mensal, custo fixo vs. variável, tendência de categoria — excluem essa flag por padrão.

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Backend | ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white) ![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=flat&logo=python&logoColor=white) |
| ORM / Banco | ![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat&logo=sqlalchemy&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white) |
| Frontend | ![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black) |
| Estilo | ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white) |
| Visualização | ![Recharts](https://img.shields.io/badge/Recharts-22B5BF?style=flat) |
| Processamento de dados | ![Pandas](https://img.shields.io/badge/Pandas-150458?style=flat&logo=pandas&logoColor=white) `pdfplumber` |
| Categorização inteligente | ![Anthropic](https://img.shields.io/badge/Claude_API-D97757?style=flat&logo=anthropic&logoColor=white) |
| Infraestrutura | ![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat&logo=docker&logoColor=white) |

## 🚀 Como Rodar Localmente

Pré-requisitos: Docker e Docker Compose instalados (recomendado rodar dentro do WSL, se estiver no Windows).

```bash
# 1. Clone o repositório
git clone git@github.com:ricardosn/money-turret.git
cd money-turret

# 2. (Opcional) exporte a chave da Anthropic para habilitar a
#    categorização via LLM — sem ela, o resto do sistema funciona
#    normalmente, só a categorização assistida por IA fica desligada.
export ANTHROPIC_API_KEY="sk-ant-..."

# 3. Suba os containers (hot-reload ativo em ambos os serviços)
docker compose up -d --build

# 4. Popule categorias, regras de categorização e projetos de exemplo
#    (idempotente — pode rodar quantas vezes quiser)
docker exec money-turret-backend python seed.py
```

Depois disso:

| Serviço | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend / Swagger | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

O banco SQLite persiste em `./backend/data/finance.db`, fora do container — os dados sobrevivem a rebuilds e restarts.

## 📂 Estrutura do Projeto

```
money-turret/
├── backend/
│   ├── app/
│   │   ├── models.py          # Category, Account, Transaction, Project, ProjectProvision
│   │   ├── ingestion.py       # Parsers Nubank (CSV) e Itaú (PDF)
│   │   ├── categorization.py  # Motor de regras regex
│   │   ├── llm.py             # Categorização via Claude API
│   │   └── routers/           # statements, transactions, categorization, analytics, projects
│   └── seed.py                # Seed idempotente de categorias/regras/projetos de exemplo
├── frontend/
│   └── app/
│       ├── page.tsx           # Dashboard: custo fixo vs. variável, tendência de estilo de vida
│       ├── projects/          # Simulador de Projetos
│       ├── transactions/      # Listagem, filtros e exclusão de lançamentos
│       ├── upload/            # Upload de extratos
│       └── categorize/        # Categorização manual das pendentes
├── docker-compose.yml
└── CLAUDE.md                  # Base de conhecimento arquitetural do projeto
```
