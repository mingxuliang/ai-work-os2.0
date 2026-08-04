# -*- coding: utf-8 -*-
# flake8: noqa: E501
"""Streaming AI skill optimization / generation API."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from typing import Any, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
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


def get_model(model_slot_override: Any = None):
    """Get the active chat model instance.

    Returns:
        Chat model instance or None if not configured
    """
    try:
        model, _ = create_model_and_formatter(
            model_slot_override=model_slot_override,
        )
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
  "body": "# 标题\\n\\n## 适用场景\\n...",
  "recommended_skills": ["skill_a"],
  "recommended_tools": ["browser_use", "web_search"],
  "dependency_rationale": "选择这些依赖的原因"
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
- recommended_skills / recommended_tools：只能从用户提供的目录中选择；需要上网时优先 browser_use、web_search 及 browser_* 类 skill；无需依赖时返回空数组。
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


class CatalogSkillItem(BaseModel):
    name: str
    description: Optional[str] = None


class CatalogToolItem(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: Optional[bool] = True


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
    sop_text: Optional[str] = Field(
        default=None,
        description="Extracted SOP document text to ground the skill",
    )
    available_skills: list[CatalogSkillItem] = Field(default_factory=list)
    available_tools: list[CatalogToolItem] = Field(default_factory=list)


class AIGenerateSkillResponse(BaseModel):
    content: str
    name: str
    description: str
    recommended_skills: list[str] = Field(default_factory=list)
    recommended_tools: list[str] = Field(default_factory=list)
    dependency_rationale: str = ""


class ParseSopResponse(BaseModel):
    text: str
    summary: str = ""
    process_steps: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)


class DebugRunRequest(BaseModel):
    skill_content: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    model_slot: Optional[str] = Field(
        default=None,
        description="Optional provider:model override",
    )
    language: str = Field(default="zh")


router = APIRouter(tags=["skills"])


def _normalize_language(language: str | None) -> str:
    lang = (language or "en").strip().lower().replace("_", "-")
    if lang.startswith("zh"):
        return "zh"
    if lang.startswith("ru"):
        return "ru"
    return "en"


def _extract_text_from_chunk(chunk) -> str:
    """Extract text content from a response chunk.

    Delegates to ``extract_response_text`` so ChatResponse / TextBlock /
    dict-like provider chunks are all handled (DeepSeek etc. often omit a
    plain ``content`` string and only expose ``.text``).
    """
    from ...utils.model_response import extract_response_text

    return extract_response_text(chunk) or ""


def _extract_text_from_response(response) -> str:
    """Extract text from a non-streaming response."""
    from ...utils.model_response import extract_response_text

    return extract_response_text(response) or ""


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
    model_slot_override: Any = None,
):
    """Call the active model; optionally yield text deltas."""
    model = get_model(model_slot_override=model_slot_override)
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


ProgressCallback = Callable[[str, str], Awaitable[None]]


async def _emit_progress(
    on_progress: ProgressCallback | None,
    stage: str,
    message: str,
) -> None:
    if on_progress is None:
        return
    await on_progress(stage, message)


async def _finalize_skill(
    *,
    brief: str,
    name: str,
    description: str,
    body: str,
    language: str,
    on_progress: ProgressCallback | None = None,
) -> tuple[str, str, str]:
    """Expand thin bodies, then assemble a validated SKILL.md."""
    final_body = body
    if _body_is_thin(final_body):
        lang = _normalize_language(language)
        await _emit_progress(
            on_progress,
            "expand",
            "正在扩写 Skill 正文…" if lang == "zh" else "Expanding skill body…",
        )
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
    available_skills: list | None = None,
    available_tools: list | None = None,
    on_progress: ProgressCallback | None = None,
) -> tuple[str, str, str, dict]:
    """Generate a skill via structured JSON, then assemble SKILL.md in code.

    Returns (content, name, description, meta) where meta may include
    recommended_skills / recommended_tools / dependency_rationale.
    """
    lang = _normalize_language(language)
    system_prompt = GENERATE_SYSTEM_PROMPTS.get(
        lang,
        GENERATE_SYSTEM_PROMPTS["en"],
    )

    await _emit_progress(
        on_progress,
        "catalog",
        "正在匹配 Skills / 工具目录…"
        if lang == "zh"
        else "Building skills/tools catalog…",
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
    skill_lines = []
    for item in available_skills or []:
        nm = getattr(item, "name", None) or (
            item.get("name") if isinstance(item, dict) else None
        )
        if not nm:
            continue
        desc = getattr(item, "description", None) or (
            item.get("description") if isinstance(item, dict) else ""
        )
        skill_lines.append(f"- {nm}: {(desc or '')[:120]}")
    tool_lines = []
    for item in available_tools or []:
        nm = getattr(item, "name", None) or (
            item.get("name") if isinstance(item, dict) else None
        )
        if not nm:
            continue
        desc = getattr(item, "description", None) or (
            item.get("description") if isinstance(item, dict) else ""
        )
        tool_lines.append(f"- {nm}: {(desc or '')[:120]}")
    catalog_block = (
        "\n可用 Skills 目录（只能从中选择 recommended_skills）:\n"
        + ("\n".join(skill_lines) if skill_lines else "(空)")
        + "\n\n可用内置工具目录（只能从中选择 recommended_tools）:\n"
        + ("\n".join(tool_lines) if tool_lines else "(空)")
        + "\n"
    )

    if lang == "zh":
        user_prompt = (
            "根据需求生成【详细】skill JSON（仅 JSON）。\n"
            "body 必须是可执行手册，不要空泛 3 步模板。\n"
            f"preferred_name: {normalized_name or '(可自拟合适名称)'}\n"
            f"brief:\n{brief.strip()}\n"
            f"{catalog_block}"
        )
    else:
        user_prompt = (
            "Generate a DETAILED skill JSON only.\n"
            "body must be an actionable playbook, not a 3-bullet stub.\n"
            f"preferred_name: {normalized_name or '(invent a good name)'}\n"
            f"brief:\n{brief.strip()}\n"
            f"{catalog_block}"
        )

    await _emit_progress(
        on_progress,
        "drafting",
        "正在调用模型生成 Skill…"
        if lang == "zh"
        else "Calling model to draft skill…",
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
            content, vname, vdesc = await _finalize_skill(
                brief=brief,
                name=name,
                description=description,
                body=body,
                language=lang,
                on_progress=on_progress,
            )
            meta = {
                "recommended_skills": list(data.get("recommended_skills") or []),
                "recommended_tools": list(data.get("recommended_tools") or []),
                "dependency_rationale": str(
                    data.get("dependency_rationale") or ""
                ),
            }
            return content, vname, vdesc, meta
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
        content, vname, vdesc = await _finalize_skill(
            brief=brief,
            name=normalized_name or name,
            description=description,
            body=body,
            language=lang,
            on_progress=on_progress,
        )
        return content, vname, vdesc, {}
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
    content, vname, vdesc = await _finalize_skill(
        brief=brief,
        name=fallback_name,
        description=description,
        body=seed_body,
        language=lang,
        on_progress=on_progress,
    )
    return content, vname, vdesc, {}




def _filter_catalog_names(names: list, catalog: list[str]) -> list[str]:
    """Keep only names that exist in catalog (case-insensitive)."""
    allowed = {n.lower(): n for n in catalog}
    out: list[str] = []
    for raw in names or []:
        key = str(raw or "").strip().lower()
        if key and key in allowed and allowed[key] not in out:
            out.append(allowed[key])
    return out


_WEB_BRIEF_KEYS = (
    "上网",
    "互联网",
    "搜索",
    "网页",
    "browser",
    "web",
    "搜索引擎",
    "查网",
    "资讯",
    "新闻",
    "招标",
    "标讯",
    "投标",
    "采购",
    "爬取",
    "抓取",
    "采集",
    "官网",
    "网站",
    "外网",
)


def _heuristic_tool_recs(brief: str, tool_names: list[str]) -> list[str]:
    """Fallback recommendations when the model omits deps."""
    text = (brief or "").lower()
    picks: list[str] = []
    if any(k in text for k in _WEB_BRIEF_KEYS):
        for candidate in ("browser_use", "web_search", "web_fetch"):
            if candidate in tool_names and candidate not in picks:
                picks.append(candidate)
    return picks


def _heuristic_skill_recs(brief: str, skill_names: list[str]) -> list[str]:
    text = (brief or "").lower()
    picks: list[str] = []
    if any(k in text for k in _WEB_BRIEF_KEYS):
        for sn in skill_names:
            low = sn.lower()
            if (
                low.startswith("browser")
                or "web_search" in low
                or "web-search" in low
            ) and sn not in picks:
                picks.append(sn)
    return picks[:5]


def _extract_catalog_mentions(text: str, catalog: list[str]) -> list[str]:
    """Find catalog names mentioned in markdown/body (backticks or bare)."""
    if not text or not catalog:
        return []
    allowed = {n.lower(): n for n in catalog}
    found: list[str] = []
    # Prefer backtick mentions: `browser_use`
    for m in re.finditer(r"`([A-Za-z0-9_./-]+)`", text):
        key = m.group(1).strip().lower()
        if key in allowed and allowed[key] not in found:
            found.append(allowed[key])
    # Then whole-word-ish bare mentions for remaining catalog entries
    lower_text = text.lower()
    for key, canon in allowed.items():
        if canon in found:
            continue
        if re.search(rf"(?<![A-Za-z0-9_]){re.escape(key)}(?![A-Za-z0-9_])", lower_text):
            found.append(canon)
    return found


def _inject_dependency_sections(
    body: str,
    *,
    skills: list[str],
    tools: list[str],
    language: str,
) -> str:
    """Append dependency sections if missing."""
    text = (body or "").rstrip()
    lang = _normalize_language(language)
    skill_title = "## 依赖 Skills" if lang == "zh" else "## Required Skills"
    tool_title = "## 推荐内置工具" if lang == "zh" else "## Recommended Builtin Tools"
    if skills and skill_title not in text:
        lines = "\n".join(f"- `{n}`" for n in skills)
        text = f"{text}\n\n{skill_title}\n{lines}\n"
    if tools and tool_title not in text:
        lines = "\n".join(f"- `{n}`" for n in tools)
        text = f"{text}\n\n{tool_title}\n{lines}\n"
    return text


def _extract_file_text(filename: str, data: bytes) -> str:
    """Extract plain text from uploaded SOP bytes."""
    name = (filename or "").lower()
    if name.endswith((".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".csv")):
        for enc in ("utf-8", "utf-8-sig", "gbk", "latin-1"):
            try:
                return data.decode(enc)
            except UnicodeDecodeError:
                continue
        return data.decode("utf-8", errors="ignore")

    if name.endswith(".pdf"):
        try:
            from io import BytesIO
            from pypdf import PdfReader

            reader = PdfReader(BytesIO(data))
            parts = []
            for page in reader.pages[:40]:
                parts.append(page.extract_text() or "")
            return "\n".join(parts).strip()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse PDF: {exc}",
            ) from exc

    if name.endswith(".docx"):
        try:
            from io import BytesIO
            from docx import Document

            doc = Document(BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs if p.text).strip()
        except ImportError as exc:
            raise HTTPException(
                status_code=400,
                detail="python-docx is required to parse .docx SOP files",
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse DOCX: {exc}",
            ) from exc

    if name.endswith(".doc"):
        raise HTTPException(
            status_code=400,
            detail="Legacy .doc is not supported; please upload .docx/.pdf/.md/.txt",
        )

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported SOP file type: {filename}",
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
    return await _run_generate_skill(request)


@router.post("/skills/ai/generate/stream")
async def ai_generate_skill_stream(request: AIGenerateSkillRequest):
    """Stream real generation stages, then the final skill payload."""

    async def generate():
        queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(stage: str, message: str) -> None:
            await queue.put({"stage": stage, "message": message})

        async def worker() -> None:
            try:
                result = await _run_generate_skill(
                    request,
                    on_progress=on_progress,
                )
                await queue.put(
                    {
                        "done": True,
                        "content": result.content,
                        "name": result.name,
                        "description": result.description,
                        "recommended_skills": result.recommended_skills,
                        "recommended_tools": result.recommended_tools,
                        "dependency_rationale": result.dependency_rationale,
                    },
                )
            except HTTPException as exc:
                detail = exc.detail
                if not isinstance(detail, str):
                    detail = json.dumps(detail, ensure_ascii=False)
                await queue.put({"error": detail})
            except Exception as exc:  # noqa: BLE001
                logger.exception("AI skill generate stream failed")
                await queue.put({"error": f"Failed to generate skill: {exc}"})
            finally:
                await queue.put(None)

        task = asyncio.create_task(worker())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield (
                    "data: "
                    + json.dumps(item, ensure_ascii=False)
                    + "\n\n"
                )
        finally:
            await task

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _run_generate_skill(
    request: AIGenerateSkillRequest,
    on_progress: ProgressCallback | None = None,
) -> AIGenerateSkillResponse:
    """Shared generate pipeline used by JSON and SSE endpoints."""
    lang = _normalize_language(request.language)
    brief = (request.brief or "").strip()
    if not brief:
        raise HTTPException(status_code=400, detail="brief is required")

    await _emit_progress(
        on_progress,
        "prepare",
        "正在分析需求与 SOP…" if lang == "zh" else "Analyzing brief and SOP…",
    )

    sop = (request.sop_text or "").strip()
    if sop:
        brief = f"{brief}\n\n--- SOP 文档提炼 ---\n{sop[:12000]}"

    skill_catalog = [s.name for s in (request.available_skills or []) if s.name]
    tool_catalog = [t.name for t in (request.available_tools or []) if t.name]

    try:
        content, name, description, meta = await _generate_valid_skill_md(
            brief=brief,
            preferred_name=request.name,
            language=request.language,
            available_skills=request.available_skills or [],
            available_tools=request.available_tools or [],
            on_progress=on_progress,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("AI skill generation failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate skill: {exc}",
        ) from exc

    await _emit_progress(
        on_progress,
        "assemble",
        "正在组装 SKILL.md 并推荐依赖…"
        if lang == "zh"
        else "Assembling SKILL.md and dependencies…",
    )

    rec_skills = _filter_catalog_names(
        meta.get("recommended_skills") or [],
        skill_catalog,
    )
    rec_tools = _filter_catalog_names(
        meta.get("recommended_tools") or [],
        tool_catalog,
    )
    # Model often writes tools into body but leaves recommended_* empty —
    # recover mentions + heuristics so UI can echo dependencies.
    for name in _extract_catalog_mentions(content, tool_catalog):
        if name not in rec_tools:
            rec_tools.append(name)
    for name in _extract_catalog_mentions(content, skill_catalog):
        if name not in rec_skills:
            rec_skills.append(name)
    if not rec_tools:
        rec_tools = _heuristic_tool_recs(brief, tool_catalog)
    if not rec_skills:
        rec_skills = _heuristic_skill_recs(brief, skill_catalog)

    # Ensure dependency sections exist in content body
    if rec_skills or rec_tools:
        try:
            body = content
            fm_end = -1
            if body.startswith("---"):
                fm_end = body.find("\n---", 3)
            if fm_end >= 0:
                head = body[: fm_end + len("\n---")]
                body_part = body[fm_end + len("\n---") :].lstrip("\n")
                body_part = _inject_dependency_sections(
                    body_part,
                    skills=rec_skills,
                    tools=rec_tools,
                    language=request.language,
                )
                content = f"{head}\n\n{body_part}".rstrip() + "\n"
                validate_skill_content(content)
        except Exception as exc:  # noqa: BLE001
            logger.warning("dependency section inject skipped: %s", exc)

    return AIGenerateSkillResponse(
        content=content,
        name=name,
        description=description,
        recommended_skills=rec_skills,
        recommended_tools=rec_tools,
        dependency_rationale=str(meta.get("dependency_rationale") or ""),
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


@router.post(
    "/skills/ai/parse-sop",
    response_model=ParseSopResponse,
    summary="Parse an uploaded SOP document into process steps",
)
async def ai_parse_sop(
    file: UploadFile = File(...),
    language: str = "zh",
) -> ParseSopResponse:
    """Extract text from SOP upload and distill a process outline."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="file too large (max 10MB)")

    text = _extract_file_text(file.filename or "sop.txt", raw)
    if not text.strip():
        raise HTTPException(status_code=400, detail="no text extracted from SOP")

    lang = _normalize_language(language)
    clipped = text.strip()[:14000]
    if lang == "zh":
        system = (
            "你是流程分析专家。根据 SOP 原文提炼结构化流程。"
            "只输出 JSON：{\"summary\":\"...\",\"process_steps\":[\"步骤1\",...],"
            "\"entities\":[\"实体\"]}。process_steps 5～15 条，具体可执行。"
        )
        user = f"SOP 原文：\n{clipped}"
    else:
        system = (
            "You extract process flows from SOP documents. "
            "Return JSON only: {\"summary\":\"...\",\"process_steps\":[...],"
            "\"entities\":[...]}. 5-15 concrete steps."
        )
        user = f"SOP text:\n{clipped}"

    try:
        raw_model = await _call_model_text(
            system_prompt=system,
            user_prompt=user,
            stream=False,
        )
        data = _extract_json_object(str(raw_model or "")) or {}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("SOP parse failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse SOP: {exc}",
        ) from exc

    steps = [
        str(s).strip()
        for s in (data.get("process_steps") or [])
        if str(s).strip()
    ]
    entities = [
        str(s).strip()
        for s in (data.get("entities") or [])
        if str(s).strip()
    ]
    summary = str(data.get("summary") or "").strip()
    if not steps:
        # naive fallback: split paragraphs
        steps = [
            ln.strip(" -•\t")
            for ln in clipped.splitlines()
            if len(ln.strip()) > 8
        ][:10]
    if not summary:
        summary = clipped[:180].replace("\n", " ")

    return ParseSopResponse(
        text=clipped,
        summary=summary,
        process_steps=steps,
        entities=entities,
    )


@router.post("/skills/ai/debug/run")
async def ai_debug_run_skill(request: DebugRunRequest):
    """Stream a real model run of a draft skill playbook."""

    async def generate():
        try:
            skill = (request.skill_content or "").strip()
            msg = (request.message or "").strip()
            if not skill or not msg:
                yield (
                    "data: "
                    + json.dumps({"error": "skill_content and message required"})
                    + "\n\n"
                )
                return

            body = skill
            display = "draft-skill"
            if body.startswith("---"):
                end = body.find("\n---", 3)
                if end >= 0:
                    head = body[:end]
                    for line in head.splitlines():
                        if line.lower().startswith("name:"):
                            display = (
                                line.split(":", 1)[1].strip().strip("\"'")
                            )
                            break
                    body = body[end + len("\n---") :].strip()

            lang = _normalize_language(request.language)
            if lang == "zh":
                system_prompt = (
                    f"你正在执行草稿 Skill「{display}」。严格按下列手册完成用户任务，"
                    "给出可核对的结果；需要工具时在文字中说明你会如何使用"
                    "browser_use/web_search 等工具。\n\n"
                    f"===== SKILL PLAYBOOK =====\n{body}"
                )
            else:
                system_prompt = (
                    f"You are executing draft skill [{display}]. Follow the "
                    "playbook below to fulfill the user task with a verifiable "
                    "result.\n\n"
                    f"===== SKILL PLAYBOOK =====\n{body}"
                )

            stream = await _call_model_text(
                system_prompt=system_prompt,
                user_prompt=msg,
                stream=True,
                model_slot_override=request.model_slot,
            )
            accumulated = ""
            async for delta in stream:
                if not delta:
                    continue
                accumulated += delta
                yield (
                    "data: "
                    + json.dumps({"text": delta}, ensure_ascii=False)
                    + "\n\n"
                )
            # Streaming extract can yield nothing on some providers; fall back.
            if not accumulated.strip():
                logger.warning(
                    "skill debug stream empty; falling back to non-stream call",
                )
                full = await _call_model_text(
                    system_prompt=system_prompt,
                    user_prompt=msg,
                    stream=False,
                    model_slot_override=request.model_slot,
                )
                if full and str(full).strip():
                    yield (
                        "data: "
                        + json.dumps(
                            {"text": str(full)},
                            ensure_ascii=False,
                        )
                        + "\n\n"
                    )
                else:
                    yield (
                        "data: "
                        + json.dumps(
                            {
                                "error": (
                                    "模型未返回内容。请检查模型配置或换一个模型重试。"
                                ),
                            },
                            ensure_ascii=False,
                        )
                        + "\n\n"
                    )
                    return
            yield f"data: {json.dumps({'done': True})}\n\n"
        except HTTPException as exc:
            yield (
                "data: "
                + json.dumps({"error": exc.detail}, ensure_ascii=False)
                + "\n\n"
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("skill debug run failed")
            yield (
                "data: "
                + json.dumps(
                    {"error": f"Failed to debug skill: {exc}"},
                    ensure_ascii=False,
                )
                + "\n\n"
            )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

