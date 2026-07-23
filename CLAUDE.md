# Contexto do Projeto: Dashboard Financeiro (Nubank)

Este arquivo serve como base de conhecimento e diretrizes arquiteturais para agentes de IA (como o Claude Code) atuarem neste repositório.

## 1. Visão Geral e Filosofia do Projeto
O objetivo deste sistema é ingerir dados transacionais do Nubank (via CSV/OFX ou automação com `pynubank`) e do Itaú (extrato de conta em PDF) e fornecer um ambiente de análise de dados robusto. O foco central é a **avaliação objetiva e lógica** dos gastos, fugindo de dashboards superficiais e priorizando métricas que auxiliem em decisões complexas de compra e planejamento de longo prazo.

## 2. Stack Tecnológica (WSL + Docker)
- **Backend:** Python com FastAPI (focado em performance e tipagem com Pydantic).
- **Frontend:** Next.js com App Router e TypeScript.
- **Banco de Dados:** SQLite (com persistência garantida via mapeamento de volumes no Docker).
- **Visualização:** Bibliotecas focadas em densidade de dados (ex: Recharts, Chart.js).
- **Processamento de Dados:** Pandas para higienização de CSV, `pdfplumber` para extração de texto de extratos em PDF (Itaú), e integração com LLMs para categorização de transações desconhecidas.

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
7. ✅ Desenvolver os gráficos de pizza de porcentagem de gastos mensais por categoria (substituído no passo 8 por gráfico de tendência).
8. ✅ Identificar transferências internas (fatura própria, RDB, aportes em corretoras) via `is_internal_transfer` e substituir a pizza por gráfico de tendência de estilo de vida.
9. ✅ Permitir excluir transações individuais na listagem.
10. ✅ Módulo "Simulador de Projetos": planejamento financeiro futuro (viagens, compras grandes) com orçamento, timeline de provisionamento mensal e barra de progresso — CRUD completo de projetos e provisionamentos.
11. ✅ Suporte a upload de extrato do Itaú em PDF (`pdfplumber`), com motor de regras próprio para identificar salário e transferências internas via Pix.

## 6. Estado Atual do Sistema

### Como rodar
- `docker compose up -d --build` — backend em `:8000` (Swagger em `/docs`), frontend em `:3000`.
- Hot-reload nos dois serviços (código montado por volume). SQLite persiste em `./backend/data/finance.db`.
- Seed de categorias/regras/projetos de exemplo: `docker exec money-turret-backend python seed.py` (idempotente).
- Categorização via LLM requer `ANTHROPIC_API_KEY` exportada no host (repassada pelo compose).

### Backend (`backend/app/`)
- `models.py`: `Category` (árvore, com `is_fixed` para custo fixo), `Account` (com `institution`: Nubank/Itaú), `Transaction` (com `is_internal_transfer`), `CategoryRule` (regex → categoria; `source`: seed/manual/llm), `Project` e `ProjectProvision` (planejamento financeiro futuro — ver módulo Simulador de Projetos abaixo).
- `ingestion.py`: parser dos extratos do Nubank (CSV: conta e fatura, detecção automática pelas colunas) e do Itaú (PDF: conta corrente, via `pdfplumber`). Limpeza de descrição, dedup por `external_id` (fatura e PDF usam hash determinístico com contador de ocorrência) e inversão de sinal da fatura (convenção: negativo = saída).
  - `is_internal_transfer()` (Nubank): marca movimentações entre contas do próprio titular — pagamento da própria fatura, aplicação/resgate em RDB e transferências (Pix/TED) para corretoras/plataformas de investimento conhecidas (`INTERNAL_TRANSFER_COUNTERPARTIES`). `main.py` faz backfill automático desse flag em transações já importadas na primeira subida após a migração.
  - `parse_itau_pdf()`: extrai o texto do PDF por página e casa cada linha com o regex `data | lançamentos | valor (R$)`, descartando linhas "SALDO DO DIA" (saldo do dia, não transação — o número ali é a 4ª coluna, não a 3ª). Motor de regras embutido (`_itau_classification`): descrição com "REMUNERACAO/SALARIO" vira operação canônica "Remuneração/Salário" (receita, pelo sinal positivo do valor); descrição com "PIX TRANSF Ricardo" (nome do titular, em `ITAU_SELF_TRANSFER_MARKERS`) marca `is_internal_transfer=True` — Pix para outra conta do próprio titular, não é despesa real.
  - Em ambos os casos, o valor real que entra no banco já vem com o sinal correto (negativo = saída) direto da fonte — não há necessidade de inversão para o extrato do Itaú, diferente da fatura de cartão do Nubank.
- `categorization.py`: motor de regras (primeira regra que casa, por prioridade, case-insensitive); `uncategorized_descriptions` já filtra `is_internal_transfer`.
- `llm.py`: categorização via Claude API (`claude-opus-4-7`, structured outputs, prompt caching na árvore de categorias). Sugestões viram `CategoryRule` com `source=llm` — uploads futuros não chamam o modelo.
- Endpoints principais:
  - `POST /statements/upload` — importa CSV do Nubank (conta ou fatura) ou PDF do Itaú (conta corrente); o formato é roteado pelo `content_type`/extensão do arquivo em `statements.py`.
  - `POST /categorization/run` | `POST /categorization/llm` | CRUD em `/categorization/rules`.
  - `GET /transactions` (filtros: datas, categoria com subárvore, busca, sem categoria, excluir internas via `is_internal_transfer`, `expenses_only`/`incomes_only`; paginado) | `GET /categories` | `POST /transactions/{id}/categorize` (categorização manual; palavra-chave vira regra `source=manual` e o motor reaplica nas demais pendentes) | `DELETE /transactions/{id}`.
  - `GET /analytics/fixed-vs-variable` (barras empilhadas custo fixo vs variável) | `/analytics/category-cohort` (matriz mês × categoria-raiz) | `/analytics/lifestyle-trend` (série mensal por categoria de estilo de vida — Boardgames, Outdoor / Trilhas, Restaurantes, Churrascarias, Cantinas Italianas, Fast-food — sem herdar de subcategorias, para detectar inflação do padrão de vida) — agregações mensais, sempre no backend, sempre excluindo `is_internal_transfer`.
  - `routers/projects.py` (módulo **Simulador de Projetos**, prospectivo — não deriva do extrato): `GET/POST /projects` | `GET/PUT/DELETE /projects/{id}` | `POST /projects/{id}/provisions` | `PUT/DELETE /projects/{id}/provisions/{provision_id}`. `ProjectProvision.expected_month` é sempre normalizado para o dia 1 do mês. O backend calcula e retorna prontos: `total_estimated`, `total_provisioned` (soma dos provisionamentos com `is_paid=True`), `progress_percentage` (provisionado / orçamento) e a `timeline` (provisionamentos agrupados por mês, com total estimado e pago por mês) — o frontend só renderiza.

### Frontend (`frontend/app/`)
- `/` — dashboard: barras empilhadas custo fixo vs variável e gráfico de linha de tendência de estilo de vida (Recharts). Sem gráfico de pizza.
- `/projects` — **Simulador de Projetos**: cards expansíveis por projeto com barra de progresso ("R$ X de R$ Y provisionados — Z%"), alerta se o total estimado excede o orçamento, e timeline de provisionamento agrupada por mês. Formulários inline (sem modal) para criar/editar/excluir projetos e provisionamentos; toggle rápido de pago/pendente por item.
- `/transactions` — listagem com filtros de data, tipo (Gastos por padrão / Entradas / Todas), categoria e descrição, paginada; botão de exclusão por linha (com confirmação).
- `/upload` — envio de extrato (CSV do Nubank ou PDF do Itaú) com resumo da importação e botão para rodar a categorização.
- `/categorize` — categorização manual das pendentes (só saídas, sem movimentações internas): categoria + palavra-chave que vira regra reutilizável.