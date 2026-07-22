# Contexto do Projeto: Dashboard Financeiro (Nubank)

Este arquivo serve como base de conhecimento e diretrizes arquiteturais para agentes de IA (como o Claude Code) atuarem neste repositório.

## 1. Visão Geral e Filosofia do Projeto
O objetivo deste sistema é ingerir dados transacionais do Nubank (via CSV/OFX ou automação com `pynubank`) e fornecer um ambiente de análise de dados robusto. O foco central é a **avaliação objetiva e lógica** dos gastos, fugindo de dashboards superficiais e priorizando métricas que auxiliem em decisões complexas de compra e planejamento de longo prazo.

## 2. Stack Tecnológica (WSL + Docker)
- **Backend:** Python com FastAPI (focado em performance e tipagem com Pydantic).
- **Frontend:** Next.js com App Router e TypeScript.
- **Banco de Dados:** SQLite (com persistência garantida via mapeamento de volumes no Docker).
- **Visualização:** Bibliotecas focadas em densidade de dados (ex: Recharts, Chart.js).
- **Processamento de Dados:** Pandas para higienização e integração com LLMs para categorização de transações desconhecidas.

## 3. Diretrizes de Desenvolvimento para a IA
Ao receber comandos para criar ou refatorar código neste projeto, siga estas regras:
- **Clean Code & Tipagem:** Mantenha tipagem estrita no Python (Type Hints) e no TypeScript.
- **Isolamento:** O frontend não deve ter regras de negócio financeiras; todo o cálculo de agregações, médias e projeções deve ser feito no backend (FastAPI).
- **Tratamento de Dados:** Transações bancárias vêm com descrições "sujas". Os scripts de ingestão devem focar em limpar e normalizar essas strings antes da inserção no banco.
- **Banco de Dados:** Use SQLAlchemy (ou SQLModel) para as interações com o SQLite.

## 4. Sugestão de Modelagem Inicial (Categorias)
O sistema deve prever uma árvore de categorias adaptada ao estilo de vida e centros de custo reais. Algumas entidades e tags sugeridas para o script de *seed* do banco:

### Despesas Variáveis & Estilo de Vida
- **Alimentação:** Supermercado, Restaurantes (com sub-tags para churrascarias, cantinas italianas, fast-food, etc.).
- **Lazer & Hobbies:** 
  - *Boardgames* / Jogos de Tabuleiro (compras de manuais, expansões).
  - *Outdoor* / Trilhas (equipamentos de alta performance, custos de deslocamento, passaportes de trilhas).
- **Transporte:** Combustível, pedágios e manutenção veicular (foco em acompanhamento de custos de performance do carro).

### Planejamento e Metas (Projetos Futuros)
O dashboard deve suportar categorias de "reserva" ou "investimento" atreladas a objetivos de curto/médio prazo:
- Viagens internacionais e roteiros complexos (ex: Ásia).
- Troca de veículos (análise de liquidez e aporte).
- Viagens curtas de fim de semana (eventos esportivos, competições).

## 5. Roadmap
1. ✅ Construir os containers Docker (Frontend, Backend).
2. ✅ Criar os modelos SQLAlchemy para `Transaction`, `Category` e `Account`.
3. ✅ Desenvolver o endpoint de *upload* ou sincronização de extratos.
4. ✅ Implementar o motor de regras (Regex) auxiliado por LLM para categorização.
5. ✅ Desenvolver os gráficos de custo fixo vs. variável e corte de gastos.
6. ✅ Desenvolver página de listagem de gastos dos extratos com filtros de data, categoria, e descrição.
7. ✅ Desenvolver os gráficos de pizza de porcentagem de gastos mensais por categoria.

## 6. Estado Atual do Sistema

### Como rodar
- `docker compose up -d --build` — backend em `:8000` (Swagger em `/docs`), frontend em `:3000`.
- Hot-reload nos dois serviços (código montado por volume). SQLite persiste em `./backend/data/finance.db`.
- Seed de categorias/regras: `docker exec money-turret-backend python seed.py` (idempotente).
- Categorização via LLM requer `ANTHROPIC_API_KEY` exportada no host (repassada pelo compose).

### Backend (`backend/app/`)
- `models.py`: `Category` (árvore, com `is_fixed` para custo fixo), `Account`, `Transaction`, `CategoryRule` (regex → categoria; `source`: seed/manual/llm).
- `ingestion.py`: parser dos CSVs do Nubank (conta e fatura, detecção automática), limpeza de descrição, extração do prefixo de operação, dedup por `external_id` (fatura usa hash determinístico com contador de ocorrência) e inversão de sinal da fatura (convenção: negativo = saída).
- `categorization.py`: motor de regras (primeira regra que casa, por prioridade, case-insensitive) e lista de operações internas (RDB, pagamento de fatura) excluídas das análises.
- `llm.py`: categorização via Claude API (`claude-opus-4-7`, structured outputs, prompt caching na árvore de categorias). Sugestões viram `CategoryRule` com `source=llm` — uploads futuros não chamam o modelo.
- Endpoints principais:
  - `POST /statements/upload` — importa CSV (conta ou fatura).
  - `POST /categorization/run` | `POST /categorization/llm` | CRUD em `/categorization/rules`.
  - `GET /transactions` (filtros: datas, categoria com subárvore, busca, sem categoria, excluir internas, `expenses_only`/`incomes_only`; paginado) e `GET /categories`.
  - `POST /transactions/{id}/categorize` — categorização manual; a palavra-chave vira regra (`source=manual`) e o motor reaplica nas demais pendentes.
  - `GET /analytics/fixed-vs-variable` | `/analytics/category-cohort` | `/analytics/category-share` — agregações mensais, sempre no backend.

### Frontend (`frontend/app/`)
- `/` — dashboard: barras empilhadas fixo vs variável, pizza de % por categoria (com seletor de mês) e heatmap de coorte (Recharts).
- `/transactions` — listagem com filtros de data, tipo (Gastos por padrão / Entradas / Todas), categoria e descrição, paginada.
- `/upload` — envio de extrato com resumo da importação e botão para rodar a categorização.
- `/categorize` — categorização manual das pendentes (só saídas, sem movimentações internas): categoria + palavra-chave que vira regra reutilizável.