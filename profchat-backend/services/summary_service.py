"""
End-of-session summary generator.
Uses OpenAI gpt-4o with JSON response mode for reliable structured output.
"""
import json
import asyncio
import logging
from openai import AsyncOpenAI, APIStatusError, RateLimitError, AuthenticationError
from google import genai
from config.settings import LLM_MAIN_MODEL, OPENAI_API_KEY, GEMINI_API_KEY, GEMINI_GENERATOR_MODEL

logger = logging.getLogger("summary_service")

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
_gemini_client = None


def _get_gemini() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()
    return _gemini_client


def _openai_key_valid() -> bool:
    key = OPENAI_API_KEY or ""
    return bool(key) and key not in ("sk-...", "your-openai-key") and not key.endswith("...")

_RETRY_ATTEMPTS = 3
_RETRY_BASE_DELAY = 1.5


async def _with_retry(coro_fn, *args, **kwargs):
    last_exc = None
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            return await coro_fn(*args, **kwargs)
        except (RateLimitError, APIStatusError) as e:
            status = getattr(e, "status_code", 0)
            if status in (429, 500, 502, 503, 529):
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(f"OpenAI {status} on summary attempt {attempt + 1}/{_RETRY_ATTEMPTS} — retrying in {delay:.1f}s")
                await asyncio.sleep(delay)
                last_exc = e
            else:
                raise
    raise last_exc


async def generate_session_summary(chat_session) -> dict:
    """
    Generate a structured session summary from chat history using gpt-4o.

    Returns:
        {
            "profession_id": str,
            "role_title": str,
            "debrief": str,
            "key_moments": [str],
            "skills_identified": [str],
            "career_fit_reflection": str,
        }
    """
    messages = chat_session.get_messages()
    profession_id = chat_session.profession_id

    if not messages:
        return _empty_summary(profession_id)

    from utils.prompts.profession_prompt_builder import PROFESSION_ALIASES, PROFESSION_SCENARIOS
    profession_key = profession_id.replace("-", " ").lower()
    canonical = PROFESSION_ALIASES.get(profession_key, profession_key)
    scenario_data = PROFESSION_SCENARIOS.get(canonical)
    role_title = scenario_data["role_title"] if scenario_data else profession_id.replace("-", " ").title()

    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages[-20:]
    )

    system_prompt = (
        "You are an expert career coach writing post-session debriefs. "
        "Always respond with valid JSON only — no markdown, no preamble, no explanation."
    )

    user_prompt = f"""Analyze this {role_title} scenario simulation and return a JSON summary.

Conversation (last 20 messages):
{history_text}

Return this exact JSON structure:
{{
  "profession_id": "{profession_id}",
  "role_title": "{role_title}",
  "debrief": "<2-3 sentence narrative of what happened and how the user engaged>",
  "key_moments": ["<moment 1>", "<moment 2>", "<moment 3>"],
  "skills_identified": ["<skill 1>", "<skill 2>", "<skill 3>"],
  "career_fit_reflection": "<1-2 sentences on whether this career suits the user>"
}}"""

    async def _parse_summary(raw: str) -> dict:
        raw = raw.strip()
        brace_start = raw.find("{")
        brace_end = raw.rfind("}")
        if brace_start != -1 and brace_end > brace_start:
            raw = raw[brace_start: brace_end + 1]
        s = json.loads(raw)
        s.setdefault("profession_id", profession_id)
        s.setdefault("role_title", role_title)
        s.setdefault("debrief", "Session completed.")
        s.setdefault("key_moments", [])
        s.setdefault("skills_identified", [])
        s.setdefault("career_fit_reflection", "")
        return s

    async def _gemini_summary() -> dict:
        gemini = _get_gemini()
        response = await gemini.aio.models.generate_content(
            model=GEMINI_GENERATOR_MODEL,
            contents=f"{system_prompt}\n\n{user_prompt}",
            config=genai.types.GenerateContentConfig(temperature=0.3, max_output_tokens=800),
        )
        return await _parse_summary(response.text or "{}")

    # Use Gemini directly when OpenAI is not configured
    if not _openai_key_valid():
        logger.warning("[FALLBACK] OpenAI key not set — using Gemini for summary")
        try:
            summary = await _gemini_summary()
            logger.info(f"Summary (Gemini) generated for session {chat_session.session_id}")
            return summary
        except Exception as e:
            logger.error(f"Gemini summary error: {e}", exc_info=True)
            return _empty_summary(profession_id, role_title)

    try:
        response = await _with_retry(
            _client.chat.completions.create,
            model=LLM_MAIN_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=800,
        )
        raw = (response.choices[0].message.content or "{}").strip()
        summary = await _parse_summary(raw)
        logger.info(f"Summary generated for session {chat_session.session_id}")
        return summary

    except AuthenticationError:
        logger.warning("[FALLBACK] OpenAI auth failed — using Gemini for summary")
        try:
            return await _gemini_summary()
        except Exception as e2:
            logger.error(f"Gemini summary fallback error: {e2}", exc_info=True)
            return _empty_summary(profession_id, role_title)
    except Exception as e:
        logger.error(f"Error generating summary: {e}", exc_info=True)
        return _empty_summary(profession_id, role_title)


def _empty_summary(profession_id: str, role_title: str = "") -> dict:
    return {
        "profession_id": profession_id,
        "role_title": role_title or profession_id.replace("-", " ").title(),
        "debrief": "Session completed.",
        "key_moments": [],
        "skills_identified": [],
        "career_fit_reflection": "",
    }
