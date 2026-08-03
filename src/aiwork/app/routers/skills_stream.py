# -*- coding: utf-8 -*-
# flake8: noqa: E501
"""Streaming AI skill optimization / generation API."""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from aiwork.exceptions import AppBaseException, SkillsError

from ...agents.model_factory import create_model_and_formatter
from ...agents.skill_system.store import (
    normalize_skill_dir_name,
    render_skill_md,
    validate_skill_content,
)


logger = logging.getLogger(__name__)


def get_model():
    """Get the active chat model instance.

    Returns:
        Chat model instance or None if not configured
    """
    try:
        model, _ = create_model_and_formatter()
        return model
    except (ValueError, AppBaseException) as e:
        logger.warning("Failed to get model: %s", e)
        return None


# Shared SKILL.md format contract — must stay aligned with
# ``validate_skill_content`` / console frontmatter checks.
_FORMAT_CONTRACT_EN = """
## SKILL.md format contract (MUST follow exactly)

Output ONE complete skill document and NOTHING else.

### Hard rules
1. Start with a YAML frontmatter block delimited by `---` on its own line.
2. Frontmatter MUST include non-empty `name` and `description`.
3. After the closing `---`, write a Markdown body (instructions for the agent).
4. Do NOT wrap the whole document in markdown code fences (no ```).
5. Do NOT add preface, epilogue, or explanations outside the skill document.
6. `name`: use lowercase ASCII letters, digits, underscore or hyphen only
   (e.g. `weather_query` or `weather-query`). No spaces or path separators.
7. `description`: one line, clear trigger ("Use when…"), typically ≤ 200 chars.
8. If you include `metadata`, it MUST be a YAML mapping/object (never a string).
9. Keep YAML valid: quote description if it contains `:`, `#`, or leading `{`.

### Canonical shape
---
name: example_skill
description: "Use when the user needs X. Produces Y."
metadata:
  version: "1.0"
---

# Example Skill

## When to use
...

## Steps
1. ...
2. ...

## Output
...
""".strip()

_FORMAT_CONTRACT_ZH = """
## SKILL.md 格式契约（必须严格遵守）

只输出一份完整技能文档，不要输出任何其它内容。

### 硬性规则
1. 必须以单独一行的 `---` 开始 YAML frontmatter，并以单独一行的 `---` 结束 frontmatter。
2. frontmatter 必须包含非空字段 `name` 与 `description`。
3. 第二个 `---` 之后是 Markdown 正文（给智能体执行的说明）。
4. 禁止用 markdown 代码块包裹整份文档（禁止 ```）。
5. 禁止在文档外添加前言、后记或解释。
6. `name`：仅使用小写英文字母、数字、下划线或连字符（如 `weather_query` 或 `weather-query`），禁止空格和路径分隔符。
7. `description`：一行触发说明（建议“在…时使用”），通常 ≤ 200 字。
8. 若包含 `metadata`，必须是 YAML 映射/对象，不能是字符串。
9. YAML 必须合法：若 description 含 `:`、`#` 或以 `{` 开头，请加引号。

### 标准形状
---
name: example_skill
description: "在用户需要 X 时使用。产出 Y。"
metadata:
  version: "1.0"
---

# 示例技能

## 适用场景
...

## 步骤
1. ...
2. ...

## 输出
...
""".strip()

_FORMAT_CONTRACT_RU = """
## Контракт формата SKILL.md (обязательно)

Выведите ОДИН полный документ навыка и ничего больше.

### Жёсткие правила
1. Начните с YAML frontmatter, ограниченного строками `---`.
2. Frontmatter ОБЯЗАН содержать непустые `name` и `description`.
3. После закрывающего `---` — тело Markdown.
4. НЕ оборачивайте документ в markdown-ограждения (```).
5. НЕ добавляйте пояснения вне документа.
6. `name`: только строчные ASCII буквы/цифры/`_`/`-`.
7. `description`: одна строка-триггер, обычно ≤ 200 символов.
8. Если есть `metadata`, это должен быть YAML object.
9. YAML должен быть валидным.

### Каноническая форма
---
name: example_skill
description: "Use when the user needs X. Produces Y."
metadata:
  version: "1.0"
---

# Example Skill

## When to use
...
""".strip()


OPTIMIZE_SYSTEM_PROMPTS = {
    "en": f"""You are an AI skill optimization expert.
Rewrite the given skill so it better matches the contract below, while keeping the user's intent.

{_FORMAT_CONTRACT_EN}

Optimize the skill content the user provides next.""",
    "zh": f"""你是 AI 技能优化专家。
在保留用户意图的前提下，把给定技能改写成完全符合下方契约的 SKILL.md。

{_FORMAT_CONTRACT_ZH}

请优化用户接下来提供的技能内容。""",
    "ru": f"""Вы эксперт по оптимизации AI-навыков.
Перепишите навык так, чтобы он строго соответствовал контракту ниже, сохраняя замысел пользователя.

{_FORMAT_CONTRACT_RU}

Оптимизируйте навык, который пользователь предоставит далее.""",
}

# Structured generation: model fills fields; server assembles SKILL.md so
# frontmatter can never be malformed.
GENERATE_SYSTEM_PROMPTS = {
    "en": """You author production-quality AI agent Skills. Return ONLY one JSON object (no markdown fences, no prose).

Schema:
{
  "name": "skill_id",
  "description": "Use when ... Produce ...",
  "body": "# Title\\n\\n## When to use\\n...\\n\\n## Workflow\\n...\\n\\n## Steps\\n...\\n\\n## Tools\\n...\\n\\n## Output format\\n...\\n\\n## Quality checks\\n..."
}

Rules:
- name: lowercase ASCII letters/digits/underscore/hyphen preferred; if the user gave a Chinese name, you MAY keep that exact name.
- description: one line, non-empty, 40–200 chars, trigger-oriented ("Use when...").
- body: DETAILED Markdown for the agent. Minimum ~600 Chinese chars / ~450 English words is expected.
  MUST include these sections (adapt titles to language):
  1) When to use / 适用场景 — concrete triggers and non-triggers
  2) Inputs to collect — required fields before acting
  3) Workflow / Steps — 5–10 actionable steps (not 3 generic bullets)
  4) Tools & sources — which tools/sites/APIs to prefer; how to search/verify
  5) Output format — exact markdown/table template the agent should return
  6) Quality checks / pitfalls — verify freshness, cite sources, avoid hallucination
- body MUST be domain-specific to the user's brief (e.g. bid/tender news ≠ generic web search).
- Do NOT include YAML frontmatter inside body.
- Do not invent unavailable private APIs or secrets.
- Output raw JSON only.
""",
    "zh": """你是资深 AI Agent Skill 编写专家。只输出一个 JSON 对象（不要 markdown 代码块，不要解释）。

Schema:
{
  "name": "skill_id",
  "description": "在…时使用。产出…",
  "body": "# 标题\\n\\n## 适用场景\\n...\\n\\n## 需收集信息\\n...\\n\\n## 执行流程\\n...\\n\\n## 工具与来源\\n...\\n\\n## 输出模板\\n...\\n\\n## 质检要点\\n..."
}

规则：
- name：优先小写英文/数字/下划线/连字符；若用户给了中文名称，可原样使用。
- description：一行非空，40～200 字，写清触发场景与产出。
- body：给智能体的【详细】Markdown 执行手册，目标长度不少于约 600 字。
  必须包含以下章节（可微调标题）：
  1) 适用场景 — 何时触发 / 何时不触发
  2) 需收集信息 — 行动前要问清的字段
  3) 执行流程 — 5～10 条可操作步骤（禁止只有 3 条空泛步骤）
  4) 工具与来源 — 优先用哪些工具/网站/检索策略，如何交叉验证
  5) 输出模板 — 智能体最终回复必须遵循的 Markdown/表格结构
  6) 质检要点 — 时效性、来源标注、避免编造
- body 必须紧贴用户需求领域（例如“标讯/招标信息”不能写成泛泛网页搜索）。
- body 内禁止再写 YAML frontmatter。
- 不要编造不存在的私有 API 或密钥。
- 只输出原始 JSON。
""",
    "ru": """Вы создаёте production-quality AI agent Skills. Верните ТОЛЬКО один JSON-объект.

Schema:
{"name":"...","description":"...","body":"...detailed markdown..."}

Rules:
- description: one non-empty line.
- body: detailed Markdown (≥450 words), with when-to-use, inputs, 5–10 steps, tools/sources, output template, quality checks.
- Domain-specific to the brief. No YAML frontmatter in body. Raw JSON only.
""",
}

EXPAND_BODY_SYSTEM_PROMPTS = {
    "en": """You expand an AI agent Skill body into a production-ready playbook.
Return ONLY the expanded Markdown body (no YAML frontmatter, no JSON, no fences).
Keep the same language as the brief. Include: when to use, inputs, 5–10 steps,
tools/sources, output template, quality checks. Make it domain-specific and actionable.""",
    "zh": """你负责把 Skill 正文集写成可落地的执行手册。
只输出扩写后的 Markdown 正文（不要 YAML frontmatter，不要 JSON，不要代码块围栏）。
语言与需求一致。必须包含：适用场景、需收集信息、5～10 步执行流程、工具与来源、
输出模板、质检要点。内容要贴合领域（如标讯/招标），具体可执行，避免空泛套话。""",
    "ru": """Expand the skill body into a detailed actionable Markdown playbook.
Return ONLY markdown body. No YAML frontmatter, no JSON, no fences.""",
}

_MIN_BODY_CHARS = 420

# Backward-compatible alias used by older imports/tests.
SYSTEM_PROMPTS = OPTIMIZE_SYSTEM_PROMPTS


class AIOptimizeSkillRequest(BaseModel):
    content: str = Field(..., description="Current skill content to optimize")
    language: str = Field(
        default="en",
        description="Language for optimization (en, zh, ru)",
    )


class AIGenerateSkillRequest(BaseModel):
    brief: str = Field(
        ...,
        min_length=1,
        description="Natural-language requirement for the new skill",
    )
    name: Optional[str] = Field(
        default=None,
        description="Optional preferred skill directory / frontmatter name",
    )
    language: str = Field(
        default="zh",
        description="Language for generation (en, zh, ru)",
    )


class AIGenerateSkillResponse(BaseModel):
    content: str
    name: str
    description: str


router = APIRouter(tags=["skills"])


def _normalize_language(language: str | None) -> str:
    lang = (language or "en").strip().lower().replace("_", "-")
    if lang.startswith("zh"):
        return "zh"
    if lang.startswith("ru"):
        return "ru"
    return "en"


def _extract_text_from_chunk(chunk) -> str:
    """Extract text content from a response chunk."""
    if not hasattr(chunk, "content"):
        return ""

    if isinstance(chunk.content, str):
        return chunk.content

    if isinstance(chunk.content, list):
        for item in chunk.content:
            if isinstance(item, dict) and "text" in item:
                return item["text"]

    return ""


def _extract_text_from_response(response) -> str:
    """Extract text from a non-streaming response."""
    if hasattr(response, "text"):
        return response.text
    if isinstance(response, str):
        return response
    return ""


def _strip_code_fences(content: str) -> str:
    """Remove wrapping markdown fences if the model ignored instructions."""
    text = (content or "").strip().lstrip("\ufeff")
    if not text:
        return text

    # Prefer extracting the first fenced block (```yaml / ```markdown / ```).
    fenced = re.search(
        r"```(?:[\w+-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```",
        text,
    )
    if fenced:
        text = fenced.group(1).strip()
    elif text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # If the model still added prose, keep from the first frontmatter fence.
    if not text.startswith("---"):
        idx = text.find("\n---\n")
        if text.startswith("---\n"):
            pass
        elif idx >= 0:
            text = text[idx + 1 :].strip()
        else:
            idx0 = text.find("---\n")
            if idx0 >= 0:
                text = text[idx0:].strip()
    return text


def _force_frontmatter_name(content: str, preferred_name: str) -> str:
    """Ensure frontmatter name matches the preferred directory name."""
    text = content.lstrip("\ufeff")
    if not text.startswith("---"):
        return content
    end = text.find("\n---", 3)
    if end < 0:
        return content
    fm = text[3:end]
    body = text[end + len("\n---") :]
    # Quote names that are unsafe as bare YAML scalars.
    safe_name = preferred_name
    if re.search(r"[:#{}[\],*&!|>%@`]|^\s|\s$", preferred_name):
        safe_name = json.dumps(preferred_name, ensure_ascii=False)
    if re.search(r"(?m)^name\s*:", fm):
        fm = re.sub(
            r"(?m)^name\s*:.*$",
            f"name: {safe_name}",
            fm,
            count=1,
        )
    else:
        fm = f"\nname: {safe_name}" + fm
    return f"---{fm}\n---{body}"


def _slug_skill_name(text: str) -> str:
    """Derive a directory-safe skill name from free text."""
    raw = (text or "").strip()
    if not raw:
        return "generated_skill"
    # Keep CJK / letters / digits; turn other runs into hyphen.
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", raw, flags=re.UNICODE)
    slug = slug.strip("-_")
    if not slug:
        return "generated_skill"
    try:
        return normalize_skill_dir_name(slug[:64])
    except SkillsError:
        return "generated_skill"


def _extract_json_object(text: str) -> dict | None:
    """Best-effort extract of a JSON object from model output."""
    cleaned = _strip_code_fences(text)
    candidates = [cleaned]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        candidates.append(cleaned[start : end + 1])
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            return data
    return None


def _assemble_skill_md(
    *,
    name: str,
    description: str,
    body: str,
) -> tuple[str, str, str]:
    """Assemble and validate SKILL.md via the canonical renderer."""
    skill_name = normalize_skill_dir_name(name)
    desc = (description or "").strip() or f"Use when working on {skill_name}"
    content = render_skill_md(
        proposed_name=skill_name,
        description=desc,
        body=(body or "").strip() or f"# {skill_name}\n",
    )
    validated_name, validated_desc = validate_skill_content(content)
    return content, validated_name, validated_desc


async def _call_model_text(
    *,
    system_prompt: str,
    user_prompt: str,
    stream: bool = False,
):
    """Call the active model; optionally yield text deltas."""
    model = get_model()
    if not model:
        raise HTTPException(
            status_code=400,
            detail=(
                "No AI model configured. "
                "Please set an active model in Settings."
            ),
        )

    from agentscope.message import Msg, TextBlock

    from ...utils.model_response import consume_model_response

    messages = [
        Msg(
            name="system",
            role="system",
            content=[TextBlock(type="text", text=system_prompt)],
        ),
        Msg(
            name="user",
            role="user",
            content=[TextBlock(type="text", text=user_prompt)],
        ),
    ]

    if stream:
        response = await model(messages, disable_thinking=True)

        async def _gen():
            accumulated = ""
            if hasattr(response, "__aiter__"):
                async for chunk in response:
                    text = _extract_text_from_chunk(chunk)
                    if text and len(text) > len(accumulated):
                        delta = text[len(accumulated) :]
                        accumulated = text
                        yield delta
            else:
                text = _extract_text_from_response(response)
                if text:
                    yield text

        return _gen()

    # Non-stream path: use shared consumer (handles providers more reliably).
    try:
        text = await consume_model_response(
            model,
            messages,
            disable_thinking=True,
        )
    except TypeError:
        # Some model wrappers reject disable_thinking.
        text = await consume_model_response(model, messages)
    return text or ""


def _body_is_thin(body: str) -> bool:
    """Return True when the skill body is too short / generic."""
    text = (body or "").strip()
    if len(text) < _MIN_BODY_CHARS:
        return True
    # Detect the old 3-bullet generic fallback pattern.
    generic_markers = (
        "理解用户目标与约束",
        "通过可靠来源检索信息",
        "汇总为简洁、可核对的结果",
        "Clarify the goal",
        "Research from reliable sources",
        "Summarize a verifiable result",
    )
    hits = sum(1 for m in generic_markers if m in text)
    return hits >= 2


async def _expand_skill_body(
    *,
    brief: str,
    name: str,
    description: str,
    body: str,
    language: str,
) -> str:
    """Ask the model to expand a thin body into a detailed playbook."""
    lang = _normalize_language(language)
    system_prompt = EXPAND_BODY_SYSTEM_PROMPTS.get(
        lang,
        EXPAND_BODY_SYSTEM_PROMPTS["en"],
    )
    if lang == "zh":
        user_prompt = (
            f"技能名：{name}\n"
            f"描述：{description}\n"
            f"用户需求：{brief.strip()}\n\n"
            f"当前正文（过短，请大幅扩写）：\n{body.strip() or '(空)'}\n"
        )
    else:
        user_prompt = (
            f"skill name: {name}\n"
            f"description: {description}\n"
            f"brief: {brief.strip()}\n\n"
            f"current body (too thin, expand substantially):\n"
            f"{body.strip() or '(empty)'}\n"
        )
    expanded = await _call_model_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        stream=False,
    )
    expanded = _strip_code_fences(str(expanded or "")).strip()
    # If model still wrapped frontmatter, drop it.
    if expanded.startswith("---"):
        end = expanded.find("\n---", 3)
        if end >= 0:
            expanded = expanded[end + len("\n---") :].strip()
    return expanded if len(expanded) > len((body or "").strip()) else body


def _validate_or_raise(content: str) -> tuple[str, str]:
    try:
        return validate_skill_content(content)
    except SkillsError as exc:
        raise HTTPException(status_code=502, detail=str(exc.message)) from exc


async def _finalize_skill(
    *,
    brief: str,
    name: str,
    description: str,
    body: str,
    language: str,
) -> tuple[str, str, str]:
    """Expand thin bodies, then assemble a validated SKILL.md."""
    final_body = body
    if _body_is_thin(final_body):
        try:
            final_body = await _expand_skill_body(
                brief=brief,
                name=name,
                description=description,
                body=final_body,
                language=language,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skill body expand failed: %s", exc)
    return _assemble_skill_md(
        name=name,
        description=description,
        body=final_body,
    )


async def _generate_valid_skill_md(
    *,
    brief: str,
    preferred_name: str | None,
    language: str,
) -> tuple[str, str, str]:
    """Generate a skill via structured JSON, then assemble SKILL.md in code."""
    lang = _normalize_language(language)
    system_prompt = GENERATE_SYSTEM_PROMPTS.get(
        lang,
        GENERATE_SYSTEM_PROMPTS["en"],
    )

    normalized_name = None
    if preferred_name and preferred_name.strip():
        try:
            normalized_name = normalize_skill_dir_name(preferred_name.strip())
        except SkillsError as exc:
            raise HTTPException(
                status_code=400,
                detail=str(exc.message),
            ) from exc

    fallback_name = normalized_name or _slug_skill_name(brief)
    if lang == "zh":
        user_prompt = (
            "根据需求生成【详细】skill JSON（仅 JSON）。\n"
            "body 必须是可执行手册，不要空泛 3 步模板。\n"
            f"preferred_name: {normalized_name or '(可自拟合适名称)'}\n"
            f"brief:\n{brief.strip()}\n"
        )
    else:
        user_prompt = (
            "Generate a DETAILED skill JSON only.\n"
            "body must be an actionable playbook, not a 3-bullet stub.\n"
            f"preferred_name: {normalized_name or '(invent a good name)'}\n"
            f"brief:\n{brief.strip()}\n"
        )

    raw = await _call_model_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        stream=False,
    )
    raw_text = str(raw or "")
    logger.info(
        "AI skill generate raw length=%s json=%s",
        len(raw_text),
        bool(_extract_json_object(raw_text)),
    )
    data = _extract_json_object(raw_text)

    # Path A: structured JSON → assemble with renderer (always valid YAML).
    if data is not None:
        name = str(data.get("name") or fallback_name).strip() or fallback_name
        if normalized_name:
            name = normalized_name
        description = str(data.get("description") or "").strip()
        body = str(data.get("body") or data.get("content") or "").strip()
        if not description:
            description = (
                f"在用户需要获取/整理「{brief.strip()[:80]}」相关信息时使用。"
                if lang == "zh"
                else f"Use when the user needs help with: {brief.strip()[:80]}"
            )
        try:
            return await _finalize_skill(
                brief=brief,
                name=name,
                description=description,
                body=body,
                language=lang,
            )
        except SkillsError as exc:
            logger.warning(
                "Structured skill assemble failed, falling back: %s",
                exc.message,
            )

    # Path B: model returned freeform SKILL.md — accept if valid, else expand.
    content = _strip_code_fences(raw_text)
    if normalized_name:
        content = _force_frontmatter_name(content, normalized_name)
    try:
        name, description = validate_skill_content(content)
        # Extract body after frontmatter for possible expansion.
        body = content
        if body.startswith("---"):
            end = body.find("\n---", 3)
            body = body[end + len("\n---") :].strip() if end >= 0 else body
        return await _finalize_skill(
            brief=brief,
            name=normalized_name or name,
            description=description,
            body=body,
            language=lang,
        )
    except SkillsError as exc:
        validation_error = str(exc.message or exc)
        logger.warning(
            "Freeform skill failed validation, expanding from brief: %s",
            validation_error,
        )

    # Path C: model output unusable — still expand from brief (not a stub).
    description = (
        f"在用户需要「{brief.strip()[:80]}」时使用，产出结构化、可核对的结果。"
        if lang == "zh"
        else (
            f"Use when the user needs: {brief.strip()[:80]}. "
            "Produce a structured, verifiable result."
        )
    )
    seed_body = (
        f"# {fallback_name}\n\n## 适用场景\n{brief.strip()}\n"
        if lang == "zh"
        else f"# {fallback_name}\n\n## When to use\n{brief.strip()}\n"
    )
    return await _finalize_skill(
        brief=brief,
        name=fallback_name,
        description=description,
        body=seed_body,
        language=lang,
    )


@router.post(
    "/skills/ai/generate",
    response_model=AIGenerateSkillResponse,
    summary="AI-generate a new SKILL.md from a brief",
)
async def ai_generate_skill(
    request: AIGenerateSkillRequest,
) -> AIGenerateSkillResponse:
    """Generate a valid SKILL.md from a natural-language brief."""
    brief = (request.brief or "").strip()
    if not brief:
        raise HTTPException(status_code=400, detail="brief is required")

    try:
        content, name, description = await _generate_valid_skill_md(
            brief=brief,
            preferred_name=request.name,
            language=request.language,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("AI skill generation failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate skill: {exc}",
        ) from exc

    return AIGenerateSkillResponse(
        content=content,
        name=name,
        description=description,
    )


@router.post("/skills/ai/optimize/stream")
async def ai_optimize_skill_stream(request: AIOptimizeSkillRequest):
    """Use AI to optimize an existing skill with streaming response."""

    async def generate():
        try:
            lang = _normalize_language(request.language)
            system_prompt = OPTIMIZE_SYSTEM_PROMPTS.get(
                lang,
                OPTIMIZE_SYSTEM_PROMPTS["en"],
            )
            if not (request.content or "").strip():
                yield (
                    "data: "
                    + json.dumps({"error": "content is required"})
                    + "\n\n"
                )
                return

            stream = await _call_model_text(
                system_prompt=system_prompt,
                user_prompt=request.content,
                stream=True,
            )
            accumulated = ""
            async for delta in stream:
                if not delta:
                    continue
                accumulated += delta
                data = json.dumps({"text": delta}, ensure_ascii=False)
                yield f"data: {data}\n\n"

            cleaned = _strip_code_fences(accumulated)
            if cleaned != accumulated:
                # Replace stream buffer on the client with the cleaned doc.
                yield (
                    "data: "
                    + json.dumps(
                        {"replace": cleaned},
                        ensure_ascii=False,
                    )
                    + "\n\n"
                )
                accumulated = cleaned

            try:
                validate_skill_content(accumulated)
            except SkillsError as exc:
                # Best-effort repair once, then push replacement.
                lang = _normalize_language(request.language)
                system_prompt = OPTIMIZE_SYSTEM_PROMPTS.get(
                    lang,
                    OPTIMIZE_SYSTEM_PROMPTS["en"],
                )
                if lang == "zh":
                    repair_prompt = (
                        "下面技能未通过格式校验，请输出修正后的完整 "
                        f"SKILL.md。错误：{exc.message}\n\n{accumulated}"
                    )
                else:
                    repair_prompt = (
                        "This skill failed validation. Output a corrected "
                        f"complete SKILL.md. Error: {exc.message}\n\n"
                        f"{accumulated}"
                    )
                repaired = await _call_model_text(
                    system_prompt=system_prompt,
                    user_prompt=repair_prompt,
                    stream=False,
                )
                repaired = _strip_code_fences(str(repaired or ""))
                validate_skill_content(repaired)
                yield (
                    "data: "
                    + json.dumps(
                        {"replace": repaired},
                        ensure_ascii=False,
                    )
                    + "\n\n"
                )

            yield f"data: {json.dumps({'done': True})}\n\n"

        except HTTPException as exc:
            error_msg = json.dumps(
                {"error": exc.detail},
                ensure_ascii=False,
            )
            yield f"data: {error_msg}\n\n"
        except Exception as e:
            logger.exception("AI skill optimization failed: %s", e)
            error_msg = json.dumps(
                {"error": f"Failed to optimize skill: {str(e)}"},
                ensure_ascii=False,
            )
            yield f"data: {error_msg}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
