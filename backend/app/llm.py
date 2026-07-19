"""Categorização assistida por LLM (Claude API) para descrições desconhecidas.

Para cada descrição sem categoria, o modelo sugere a categoria existente mais
adequada e um padrão regex reutilizável, que vira uma `CategoryRule` com
source="llm" — assim uploads futuros são categorizados sem novas chamadas.
"""

import os

import anthropic
from pydantic import BaseModel

from app.models import Category

MODEL = "claude-opus-4-7"


class LlmSuggestion(BaseModel):
    description: str
    category_id: int | None
    regex: str | None


class LlmSuggestions(BaseModel):
    suggestions: list[LlmSuggestion]


class LlmNotConfiguredError(RuntimeError):
    pass


def _client() -> anthropic.Anthropic:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise LlmNotConfiguredError(
            "ANTHROPIC_API_KEY não configurada no ambiente do backend."
        )
    return anthropic.Anthropic()


def _render_category_tree(categories: list[Category]) -> str:
    by_parent: dict[int | None, list[Category]] = {}
    for c in categories:
        by_parent.setdefault(c.parent_id, []).append(c)

    lines: list[str] = []

    def walk(parent_id: int | None, depth: int) -> None:
        for c in sorted(by_parent.get(parent_id, []), key=lambda x: x.name):
            lines.append(f"{'  ' * depth}- id={c.id} {c.name}")
            walk(c.id, depth + 1)

    walk(None, 0)
    return "\n".join(lines)


SYSTEM_PROMPT = """\
Você categoriza transações bancárias brasileiras (extratos do Nubank).
Receberá uma lista de descrições de estabelecimentos/contrapartes e a árvore
de categorias disponível (com ids).

Para cada descrição:
- Escolha o category_id da categoria MAIS ESPECÍFICA que se aplique
  (prefira folhas da árvore a categorias-pai).
- Se nenhuma categoria se aplicar com confiança, use category_id null.
- Proponha um regex curto (sintaxe Python, case-insensitive) que capture o
  estabelecimento de forma reutilizável em extratos futuros — generalize
  sufixos numéricos e de cidade (ex: "PADARIA STELLA 042 SAO PAULO" ->
  "padaria stella"). Se category_id for null, use regex null.
- Nunca proponha regex genérico demais (ex: ".*", "\\d+").
- Transferências Pix para pessoas físicas geralmente não são categorizáveis:
  use null.

Categorias disponíveis:
"""


def suggest_categories(
    descriptions: list[str], categories: list[Category]
) -> list[LlmSuggestion]:
    client = _client()

    response = client.messages.parse(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT + _render_category_tree(categories),
                # A árvore de categorias é estável entre chamadas.
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": "Descrições a categorizar:\n"
                + "\n".join(f"- {d}" for d in descriptions),
            }
        ],
        output_format=LlmSuggestions,
    )

    parsed = response.parsed_output
    if parsed is None:
        return []
    return parsed.suggestions
