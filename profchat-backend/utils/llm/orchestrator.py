"""
LLM Orchestrator for Profession Chat.

Architecture:
  Generator — OpenAI gpt-4o, streaming  (main chat, welcome messages)
  Router    — OpenAI gpt-4o-mini, tools ON, non-streaming (tool-call detection)

Gemini is kept available but is NOT used in the primary path.
"""
import json
import re
import inspect
import asyncio
import logging
from openai import AsyncOpenAI, APIStatusError, RateLimitError, AuthenticationError
from google import genai
from google.genai import errors as genai_errors
from config.settings import LLM_MAIN_MODEL, LLM_MODEL, OPENAI_API_KEY, GEMINI_API_KEY, GEMINI_GENERATOR_MODEL
from utils.llm.tools import PROFCHAT_FUNCTIONS, AVAILABLE_FUNCTIONS

logger = logging.getLogger("orchestrator")

_openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# Gemini client — used as automatic fallback when OpenAI key is missing/invalid
_gemini_client = None


def _get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()
    return _gemini_client


def _openai_key_valid() -> bool:
    """Returns False if the key is clearly a placeholder."""
    key = OPENAI_API_KEY or ""
    return bool(key) and key not in ("sk-...", "your-openai-key") and not key.endswith("...")

# ── Retry config ──────────────────────────────────────────────────────────────
_RETRY_ATTEMPTS = 3
_RETRY_BASE_DELAY = 1.5  # seconds


async def _openai_with_retry(coro_fn, *args, **kwargs):
    """Call an OpenAI coroutine with exponential backoff on transient errors."""
    last_exc = None
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            return await coro_fn(*args, **kwargs)
        except (RateLimitError, APIStatusError) as e:
            status = getattr(e, "status_code", 0)
            if status in (429, 500, 502, 503, 529):
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(f"OpenAI {status} on attempt {attempt + 1}/{_RETRY_ATTEMPTS} — retrying in {delay:.1f}s")
                await asyncio.sleep(delay)
                last_exc = e
            else:
                raise
    raise last_exc


# ── Intent detection regexes ──────────────────────────────────────────────────

END_INTENT_RE = re.compile(
    r"\b("
    r"goodbye|bye(?:\b|!|\.|$| then| now| for now)"
    r"|that'?s (all|it)( for (today|now))?"
    r"|(we are|we'?re) done( here| for (today|now))?"
    r"|nothing else"
    r"|i'?m good( for (today|now))?"
    r"|let'?s (end|stop|finish|wrap (this |it )?up|call (it|this) (here|done|a day))"
    r"|time to wrap (it |this )?up"
    r"|(end|stop|wrap up|wrap it up|finish) (the )?(session|chat|conversation|this|here|now|today|for today)"
    r"|(end|wrap|stop|finish)( it| this) (here|now|up|for today)"
    r"|i (have to|need to|gotta|got to|gotta go) (go|leave|head out|wrap up|stop)"
    r"|that wraps (it|us|things) up"
    r"|(see|talk to) you (later|next time|next week|tomorrow)"
    r")\b",
    re.IGNORECASE,
)

_SHORT_END_RE = re.compile(r"\b(stop|end|finish|done|quit)\b", re.IGNORECASE)

# Gate for portfolio save tool
PORTFOLIO_SAVE_RE = re.compile(r"\b(save|portfolio|takeaway|takeaways|keepsake)\b", re.IGNORECASE)

# Token caps for scenario sessions
MAX_HISTORY_TURNS = 10
MAX_TOKENS = 600

# Sentence boundary for streaming chunking
_SENTENCE_END_RE = re.compile(r"[.!?]\s")


def looks_like_manual_end(text: str) -> bool:
    if not text:
        return False
    if END_INTENT_RE.search(text):
        return True
    if len(text.split()) <= 4 and _SHORT_END_RE.search(text):
        return True
    return False


# ── Router step (gpt-4o-mini, tools ON) ──────────────────────────────────────

async def _run_router_step(messages: list, session_context: dict, *, max_chains: int = 3) -> dict:
    chains = 0
    last_tool = None
    final_text = None
    router_msgs = list(messages)

    resp = await _openai_client.chat.completions.create(
        model=LLM_MODEL,
        messages=router_msgs,
        temperature=0.1,
        functions=PROFCHAT_FUNCTIONS,
        function_call="auto",
        stream=False,
    )
    msg = resp.choices[0].message
    function_call = getattr(msg, "function_call", None)
    final_text = msg.content

    while function_call and chains < max_chains:
        name = function_call.name
        args = json.loads(function_call.arguments or "{}")
        last_tool = name

        py_fn = AVAILABLE_FUNCTIONS.get(name)
        if not py_fn:
            tool_result = {"error": f"Unknown function '{name}'"}
        else:
            if name == "save_portfolio_item":
                args.setdefault("user_id", session_context.get("user_id", ""))
                args.setdefault("session_id", session_context.get("session_id", ""))

            tool_result = await py_fn(**args) if inspect.iscoroutinefunction(py_fn) else py_fn(**args)

        router_msgs.extend([
            {"role": "assistant", "content": None, "function_call": {"name": name, "arguments": json.dumps(args)}},
            {"role": "function", "name": name, "content": json.dumps(tool_result)},
        ])

        follow = await _openai_client.chat.completions.create(
            model=LLM_MODEL,
            messages=router_msgs,
            temperature=0.1,
            functions=PROFCHAT_FUNCTIONS,
            function_call="auto",
            stream=False,
        )
        msg = follow.choices[0].message
        function_call = getattr(msg, "function_call", None)
        final_text = msg.content
        chains += 1

    return {"last_tool": last_tool, "final_text": final_text, "messages": router_msgs}


# ── Gemini fallback generator (used when OpenAI key is unavailable) ──────────

async def _run_gemini_fallback(
    *,
    system_msg: dict,
    history: list,
    user_turn: dict,
    temperature: float,
    streaming: bool = True,
    websocket=None,
    ai_name: str = "AI Mentor",
    message_id: str = None,
) -> str:
    """Gemini-based generator used as fallback when OpenAI is not configured."""
    prompt_parts = []
    for m in [system_msg] + history + [user_turn]:
        role = m.get("role", "user")
        content = m.get("content") or ""
        if role == "system":
            prompt_parts.append(f"[System Instructions]\n{content}")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}")
        else:
            prompt_parts.append(f"User: {content}")
    prompt_parts.append("Assistant:")
    full_prompt = "\n\n".join(prompt_parts)

    gemini = _get_gemini_client()
    gen_config = genai.types.GenerateContentConfig(temperature=temperature, max_output_tokens=MAX_TOKENS)

    if not streaming or not websocket:
        for attempt in range(_RETRY_ATTEMPTS):
            try:
                response = await gemini.aio.models.generate_content(
                    model=GEMINI_GENERATOR_MODEL, contents=full_prompt, config=gen_config
                )
                return (response.text or "").strip()
            except (genai_errors.ServerError, genai_errors.ClientError) as e:
                status = getattr(e, "status_code", 0)
                if status in (429, 503) and attempt < _RETRY_ATTEMPTS - 1:
                    delay = _RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(f"[GEMINI] {status} on attempt {attempt+1}, retrying in {delay:.1f}s")
                    await asyncio.sleep(delay)
                    continue
                raise
        return ""

    for attempt in range(_RETRY_ATTEMPTS):
        try:
            buf: list[str] = []
            full_text_parts: list[str] = []
            async for chunk in await gemini.aio.models.generate_content_stream(
                model=GEMINI_GENERATOR_MODEL, contents=full_prompt, config=gen_config
            ):
                token = chunk.text
                if not token:
                    continue
                buf.append(token)
                accumulated = "".join(buf)
                match = _SENTENCE_END_RE.search(accumulated)
                if match:
                    split_pos = match.end()
                    sentence = accumulated[:split_pos].strip()
                    remainder = accumulated[split_pos:]
                    if sentence:
                        full_text_parts.append(sentence)
                        try:
                            await websocket.send_text(json.dumps({
                                "type": "response_streaming",
                                "content": sentence,
                                "avatar_name": ai_name,
                                "is_complete": False,
                                "message_id": message_id,
                            }))
                        except Exception as e:
                            logger.warning(f"Failed to send Gemini chunk: {e}")
                    buf = [remainder] if remainder else []

            remaining = "".join(buf).strip()
            if remaining:
                full_text_parts.append(remaining)
                try:
                    await websocket.send_text(json.dumps({
                        "type": "response_streaming",
                        "content": remaining,
                        "avatar_name": ai_name,
                        "is_complete": False,
                        "message_id": message_id,
                    }))
                except Exception as e:
                    logger.warning(f"Failed to send final Gemini chunk: {e}")

            return " ".join(full_text_parts)

        except (genai_errors.ServerError, genai_errors.ClientError) as e:
            status = getattr(e, "status_code", 0)
            if status in (429, 503) and attempt < _RETRY_ATTEMPTS - 1:
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(f"[GEMINI] {status} on attempt {attempt+1}, retrying in {delay:.1f}s")
                await asyncio.sleep(delay)
                continue
            raise

    return ""


# ── Generator step (gpt-4o primary, Gemini fallback) ─────────────────────────

async def _run_generator_step(
    *,
    system_msg: dict,
    history: list,
    user_turn: dict,
    temperature: float,
    streaming: bool = True,
    websocket=None,
    ai_name: str = "AI Mentor",
    message_id: str = None,
) -> str:
    # Route to Gemini fallback immediately if OpenAI key is not configured
    if not _openai_key_valid():
        logger.warning("[FALLBACK] OpenAI key not set — using Gemini for generation")
        return await _run_gemini_fallback(
            system_msg=system_msg, history=history, user_turn=user_turn,
            temperature=temperature, streaming=streaming, websocket=websocket,
            ai_name=ai_name, message_id=message_id,
        )

    # Build proper OpenAI chat messages (much better quality than flat prompt)
    msgs = [{"role": "system", "content": system_msg.get("content", "")}]
    for m in history:
        role = m.get("role", "user")
        content = m.get("content") or ""
        if role in ("user", "assistant"):
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": user_turn.get("content", "")})

    if not streaming or not websocket:
        response = await _openai_with_retry(
            _openai_client.chat.completions.create,
            model=LLM_MAIN_MODEL,
            messages=msgs,
            temperature=temperature,
            max_tokens=MAX_TOKENS,
        )
        return (response.choices[0].message.content or "").strip()

    # Streaming mode: send sentence-boundary chunks over WebSocket
    buf: list[str] = []
    full_text_parts: list[str] = []

    for attempt in range(_RETRY_ATTEMPTS):
        buf = []
        full_text_parts = []
        try:
            stream = await _openai_client.chat.completions.create(
                model=LLM_MAIN_MODEL,
                messages=msgs,
                temperature=temperature,
                max_tokens=MAX_TOKENS,
                stream=True,
            )
            async for chunk in stream:
                token = chunk.choices[0].delta.content
                if not token:
                    continue
                buf.append(token)
                accumulated = "".join(buf)

                match = _SENTENCE_END_RE.search(accumulated)
                if match:
                    split_pos = match.end()
                    sentence = accumulated[:split_pos].strip()
                    remainder = accumulated[split_pos:]

                    if sentence:
                        full_text_parts.append(sentence)
                        try:
                            await websocket.send_text(json.dumps({
                                "type": "response_streaming",
                                "content": sentence,
                                "avatar_name": ai_name,
                                "is_complete": False,
                                "message_id": message_id,
                            }))
                        except Exception as e:
                            logger.warning(f"Failed to send streaming chunk: {e}")

                    buf = [remainder] if remainder else []
            break  # success

        except AuthenticationError:
            logger.warning("[FALLBACK] OpenAI auth failed mid-stream — switching to Gemini")
            return await _run_gemini_fallback(
                system_msg=system_msg, history=history, user_turn=user_turn,
                temperature=temperature, streaming=streaming, websocket=websocket,
                ai_name=ai_name, message_id=message_id,
            )
        except (RateLimitError, APIStatusError) as e:
            status = getattr(e, "status_code", 0)
            if status in (429, 500, 502, 503, 529) and attempt < _RETRY_ATTEMPTS - 1:
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(f"OpenAI stream {status} attempt {attempt + 1}/{_RETRY_ATTEMPTS} — retrying in {delay:.1f}s")
                await asyncio.sleep(delay)
            else:
                raise

    # Flush any remainder that didn't end with punctuation
    remaining = "".join(buf).strip()
    if remaining:
        full_text_parts.append(remaining)
        try:
            await websocket.send_text(json.dumps({
                "type": "response_streaming",
                "content": remaining,
                "avatar_name": ai_name,
                "is_complete": False,
                "message_id": message_id,
            }))
        except Exception as e:
            logger.warning(f"Failed to send final streaming chunk: {e}")

    return " ".join(full_text_parts)


# ── Public entry point ────────────────────────────────────────────────────────

async def handle_chat_turn(
    websocket,
    chat_session,
    convo_messages: list,
    session_context: dict,
    ai_name: str = "AI Mentor",
    message_id: str = None,
):
    """
    Process one chat turn:
      1. Check for manual session-end intent
      2. Fast-path: skip router if message is plain conversation
      3. Run router if tool intent detected
      4. Run OpenAI generator (gpt-4o, streaming)
      5. Send complete_response and persist message
    """
    import asyncio as _asyncio

    last_user_text = convo_messages[-1].get("content", "") if convo_messages else ""

    if looks_like_manual_end(last_user_text):
        logger.info(f"[MANUAL_END] Detected end intent: '{last_user_text[:80]}'")
        await _send_session_ended(websocket, chat_session, session_context, ai_name, message_id)
        return

    needs_router = bool(PORTFOLIO_SAVE_RE.search(last_user_text))

    if needs_router:
        router = await _run_router_step(convo_messages, session_context)
    else:
        router = {"last_tool": None, "final_text": None, "messages": convo_messages}
        logger.debug(f"[FAST_PATH] Skipped router for: '{last_user_text[:80]}'")

    if router["last_tool"] == "end_session":
        await _send_session_ended(websocket, chat_session, session_context, ai_name, message_id)
        return

    if router["last_tool"] == "save_portfolio_item" and router["final_text"]:
        logger.info(f"[TOOL] save_portfolio_item → '{router['final_text'][:100]}'")
        await websocket.send_text(json.dumps({
            "type": "complete_response",
            "content": "",
            "avatar_name": ai_name,
            "function_called": "save_portfolio_item",
            "is_complete": True,
            "total_content": router["final_text"],
            "message_id": message_id,
        }))
        chat_session.add_message("assistant", router["final_text"])
        _asyncio.create_task(_persist_messages(chat_session))
        return

    # Build system prompt and call gpt-4o
    if not chat_session._cached_system_prompt:
        from utils.prompts.profession_prompt_builder import build_profession_system_prompt
        chat_session._cached_system_prompt = build_profession_system_prompt(session_context)
    system_msg = chat_session._cached_system_prompt

    history = chat_session.get_messages()
    if len(history) > MAX_HISTORY_TURNS:
        history = history[-MAX_HISTORY_TURNS:]
    user_turn = convo_messages[-1]

    try:
        gen_text = await _run_generator_step(
            system_msg=system_msg,
            history=history,
            user_turn=user_turn,
            temperature=0.7,
            streaming=True,
            websocket=websocket,
            ai_name=ai_name,
            message_id=message_id,
        )

        await websocket.send_text(json.dumps({
            "type": "complete_response",
            "content": "",
            "avatar_name": ai_name,
            "function_called": None,
            "is_complete": True,
            "total_content": gen_text,
            "message_id": message_id,
        }))
        chat_session.add_message("assistant", gen_text)
        _asyncio.create_task(_persist_messages(chat_session))
        logger.info(f"[CHAT] Response sent: '{gen_text[:100]}'")

    except Exception as e:
        logger.error(f"Error in handle_chat_turn: {e}", exc_info=True)
        fallback = "I'm having trouble reaching the AI right now. Please try again in a moment."
        await websocket.send_text(json.dumps({
            "type": "complete_response",
            "content": "",
            "avatar_name": ai_name,
            "function_called": None,
            "is_complete": True,
            "total_content": fallback,
            "message_id": message_id,
            "error": True,
        }))


async def _send_session_ended(websocket, chat_session, session_context, ai_name, message_id):
    from services.summary_service import generate_session_summary
    summary = await generate_session_summary(chat_session)
    await websocket.send_text(json.dumps({
        "type": "complete_response",
        "avatar_name": ai_name,
        "content": "",
        "total_content": "",
        "is_complete": True,
        "session_ended": True,
        "reason": "user_requested",
        "summary": summary,
        "message_id": message_id,
    }))
    from utils.firebase_utils import save_session_summary
    try:
        save_session_summary(chat_session.session_id, chat_session.user_id, summary)
    except Exception as e:
        logger.warning(f"Failed to save session summary: {e}")


async def _persist_messages(chat_session):
    from utils.firebase_utils import append_message_to_session
    try:
        msgs = chat_session.get_messages()
        if msgs:
            last = msgs[-1]
            append_message_to_session(chat_session.session_id, last["role"], last["content"])
    except Exception as e:
        logger.warning(f"Failed to persist message: {e}")


async def generate_welcome_message(session_context: dict, ai_name: str = "AI Professional Mentor") -> str:
    """
    Generate a profession-specific welcome message.
    Logic ported directly from Therapod Shadow Sessions welcome_message_service.py.
    Branches by (is_returning × today_mode × has_intake).
    """
    from utils.prompts.profession_prompt_builder import (
        PROFESSION_ALIASES, PROFESSION_SCENARIOS, _resolve_session_mode,
        AI_MENTOR_NAME,
    )

    raw = session_context.get("profession_id", "")
    profession_key   = raw.strip().lower().replace("-", " ")
    canonical_key    = PROFESSION_ALIASES.get(profession_key, profession_key)
    scenario_data    = PROFESSION_SCENARIOS.get(canonical_key)
    role_title       = scenario_data["role_title"] if scenario_data else ""

    user_first_name  = (session_context.get("user_first_name") or "").strip()
    experience_level = (session_context.get("experience_level") or "").strip().lower()
    user_background  = (session_context.get("user_background") or "").strip()
    career_goals     = (session_context.get("career_goals") or "").strip()
    last_summary     = (session_context.get("last_session_summary") or "").strip()
    profession_area  = (session_context.get("profession_area") or "").strip()

    today_mode  = _resolve_session_mode(session_context)
    is_returning = bool(last_summary)
    has_intake   = bool(experience_level or user_background or career_goals)

    # Experience-level human descriptors (same as source)
    _exp_descriptors = {
        "exploring":     "is just exploring this field with no prior experience",
        "some_exposure": "has some exposure through study or reading but no hands-on experience",
        "in_training":   "is actively studying or in a training program for this field",
        "early_career":  "has started working in this area in an early-career capacity",
    }

    # ── Unknown profession ────────────────────────────────────────────────────
    if not role_title:
        fallback_role  = profession_key.strip() if profession_key else ""
        role_phrase    = f"a {fallback_role}" if fallback_role else "this profession"
        intake_lines   = []
        if experience_level:
            intake_lines.append(f"- Experience: the student {_exp_descriptors.get(experience_level, experience_level)}.")
        if user_background:
            intake_lines.append(f'- Background they shared: "{user_background}"')
        if career_goals:
            intake_lines.append(f'- Goal: "{career_goals}"')
        intake_block = "\n".join(intake_lines) if intake_lines else "(no intake info provided)"
        recap = (
            f"This student has done a session before. In ONE sentence, reconnect and recap ONE concrete detail "
            f"from this summary (do NOT read verbatim): \"{last_summary}\". ONLY reference details explicitly present. "
            f"Then continue with the onboarding below."
            if last_summary else "This is the student's FIRST session in this area."
        )
        prompt = f"""You are {AI_MENTOR_NAME}, a professional mentor in ProSim Career Scenarios.

{recap}

Student intake (use it, do NOT read it back verbatim):
{intake_block}

Generate a warm, personalised welcome (4-5 sentences) that ONBOARDS them. Tone: direct, mentor-like coaching, not therapy.

STRUCTURE (one flowing message — no bullet points):
1. Greet by first name if available: "{user_first_name or '(no name provided)'}".
2. Acknowledge where they are with this field and briefly reflect their goal or background if shared.
3. Explain what we're going to do: "Together, we're going to step into a real day in the life of {role_phrase}. You'll be the one in the room, making the calls in real time. There are no right or wrong answers. Once the scene is done, we'll step out and reflect on what came up." (Paraphrase — do not read verbatim.)
4. Hand control back naturally — vary phrasing. Acceptable: "When you're ready, let me know and we'll get going."

HARD RULES:
- Do NOT drop them into the scene yet.
- Do NOT say "take a moment", "take a breath", "pause", "ground ourselves".
- No therapy jargon. No emojis. No bullet points.
- Do NOT use their name more than once."""

    # ── Returning student ─────────────────────────────────────────────────────
    elif is_returning:
        if today_mode == "explore":
            area_note = (
                f" The student's persisted area is {profession_area!r} — you MAY mention it in the recap if natural."
                if profession_area else ""
            )
            prompt = f"""You are {AI_MENTOR_NAME}, a professional mentor in ProSim Career Scenarios.

This student has done a {role_title} session before, but TODAY they have chosen an EXPLORATION level. The welcome MUST respect today's level — do NOT promise a live scenario.{area_note}

Generate a warm welcome (3-4 sentences) that:
1. Reconnects: greet by first name ("{user_first_name or '(if available)'}"), acknowledge they're back, and recap ONE concrete detail from the previous session summary below in a single sentence (do NOT read it verbatim — paraphrase one thing they did or wrestled with).
2. PIVOTS to today's framing in ONE sentence: today is for exploring the field broadly — answering questions, building the picture, no test or live scene.
3. Ends with a soft, natural ready-prompt. Acceptable: "When you're ready, let me know and we'll dig in." DO NOT use "say the word" — it sounds stiff.

HARD RULES:
- Tone: direct, mentor-like coaching, not therapy.
- Do NOT re-explain the session format (they already know it).
- Do NOT promise a scene or decision moment.
- ONLY reference details explicitly present in the summary. Never invent names or events.
- Do NOT say "take a moment", "take a breath", "pause".
- Do NOT use their name more than once.

Previous {role_title} session summary:
{last_summary}"""

        else:
            area_line = (
                f"AREA (from prior session): {profession_area!r}. Reference it briefly in the recap if natural."
                if profession_area else "AREA: not yet captured — the system prompt will ask in-session."
            )
            prompt = f"""You are {AI_MENTOR_NAME}, a professional mentor in ProSim Career Scenarios.

This student has done a {role_title} session before and is returning TODAY in SCENARIO mode. Generate a warm welcome (3-4 sentences) that:
1. Reconnects: greet by first name ("{user_first_name or '(if available)'}"), acknowledge they're back, and recap ONE concrete detail from the previous session summary below (do NOT read verbatim).
2. Frames what's coming today in one sentence — a new moment in the {role_title}'s day.
3. Ends with a soft, natural ready-prompt. Acceptable: "When you're ready, let me know and we'll step in." DO NOT use "say the word".

{area_line}

HARD RULES:
- Tone: direct, mentor-like coaching, not therapy.
- Do NOT re-explain the session format.
- Do NOT drop them into the scene yet.
- Do NOT describe specific scenario details.
- ONLY reference details explicitly in the summary below. Never invent.
- Do NOT say "take a moment", "take a breath", "pause".
- Do NOT use their name more than once.

Previous {role_title} session summary:
{last_summary}"""

    # ── First-time student ────────────────────────────────────────────────────
    elif has_intake:
        intake_lines = []
        if experience_level:
            intake_lines.append(f"- Experience level: the student {_exp_descriptors.get(experience_level, experience_level)}.")
        if user_background:
            intake_lines.append(f'- Background they shared: "{user_background}"')
        if career_goals:
            intake_lines.append(f'- What they hope to get out of this session: "{career_goals}"')
        intake_block = "\n".join(intake_lines)

        is_low_experience = experience_level in ("exploring", "some_exposure", "")
        if is_low_experience:
            mode_framing = (
                f"Explain what we're going to do: \"Together, we're going to explore what being a {role_title} actually involves. "
                f"I'll walk you through what the day looks like, and we'll talk through the kinds of moments that come up in this work. "
                f"There's no test, no pressure to perform — just a chance to feel what this role asks for and figure out if it fits you.\" "
                f"(Paraphrase — do not read verbatim. Lean REASSURING — they don't need any background. "
                f"Do NOT promise 'you'll be in the room making calls in real time' — this is a coaching conversation, not a live simulation.)"
            )
        else:
            mode_framing = (
                f"Explain what we're going to do: \"Together, we're going to step into a real day in the life of a {role_title}. "
                f"You'll be the one in the room, making the calls in real time. There are no right or wrong answers. "
                f"Once the scene is done, we'll step out and reflect on what came up.\" "
                f"(Paraphrase — do not read verbatim. Lean CHALLENGING — this will stretch the muscles they're already building.)"
            )

        prompt = f"""You are {AI_MENTOR_NAME}, a professional mentor in ProSim Career Scenarios.

This is the student's FIRST {role_title} session. They shared the following before starting (use it, do NOT read it back verbatim):
{intake_block}

Generate a warm, personalised welcome (4-5 sentences) that ONBOARDS them. Tone: direct, mentor-like coaching, not therapy.

STRUCTURE (one flowing message — no bullet points):
1. Greet by first name if available: "{user_first_name or '(no name provided)'}".
2. In one sentence, acknowledge where they ARE with this field and, if they shared a goal or background, reflect it briefly so they feel heard.
3. {mode_framing}
4. Hand control back naturally — vary phrasing. Acceptable: "When you're ready, let me know and we'll get going." DO NOT say "say the word" — it sounds stiff.

HARD RULES:
- Do NOT drop them into the scene yet.
- Do NOT pre-announce specific scenario details (no character names, no "It's 9:02 AM...").
- Do NOT say "take a moment", "take a breath", "pause".
- No therapy jargon. No emojis. No bullet points.
- Do NOT ask "what drew you to this career" — they already shared why; asking again ignores their intake.
- Do NOT use their name more than once."""

    # ── No intake, first-time ─────────────────────────────────────────────────
    else:
        prompt = f"""You are {AI_MENTOR_NAME}, a professional mentor in ProSim Career Scenarios.

This is the student's FIRST {role_title} session. They did NOT share any intake info — no context on experience level or goals.

Generate a warm welcome (3-4 sentences) that ONBOARDS them. Tone: direct, mentor-like coaching, not therapy.

STRUCTURE (one flowing message — no bullet points):
1. Greet by first name if available ("{user_first_name or '(no name provided)'}") and acknowledge they've chosen to explore the {role_title} path.
2. Explain what we're doing: "Together, we're going to explore what being a {role_title} actually involves. I'll walk you through what the day looks like and we'll talk through the kinds of moments that come up. No test, no pressure to perform — just a way to feel what this role asks for." (Paraphrase — do not read verbatim.)
3. Ask ONE light onboarding question: "Before we go further — in a sentence or two, what drew you to this career?"
4. Signal that once they answer, you'll continue — e.g. "Tell me, and we'll take it from there."

HARD RULES:
- Do NOT drop them into the scene yet.
- Do NOT pre-announce specific scenario details.
- Do NOT say "take a moment", "take a breath", "pause".
- No therapy jargon. No emojis. No bullet points.
- Do NOT use their name more than once."""

    # ── Generate with OpenAI (primary) or Gemini (fallback) ──────────────────
    fallback_msg = (
        f"{'Hi ' + user_first_name + '!' if user_first_name else 'Hey!'} "
        f"I'm your AI Professional Mentor. You're about to step into a {role_title or 'professional'} scenario. "
        f"When you're ready, let me know and we'll get going."
    )
    system_inst = (
        "You write professional mentor welcome messages for career simulation sessions. "
        "Return only the welcome message text — no extra commentary, no preamble."
    )

    if not _openai_key_valid():
        logger.warning("[FALLBACK] OpenAI key not set — using Gemini for welcome message")
        try:
            gemini = _get_gemini_client()
            response = await gemini.aio.models.generate_content(
                model=GEMINI_GENERATOR_MODEL,
                contents=f"{system_inst}\n\n{prompt}",
                config=genai.types.GenerateContentConfig(temperature=0.7, max_output_tokens=250),
            )
            return (response.text or "").strip()
        except Exception as e:
            logger.error(f"Gemini welcome error: {e}")
            return fallback_msg

    try:
        response = await _openai_with_retry(
            _openai_client.chat.completions.create,
            model=LLM_MAIN_MODEL,
            messages=[
                {"role": "system", "content": system_inst},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=250,
        )
        return (response.choices[0].message.content or "").strip()
    except AuthenticationError:
        logger.warning("[FALLBACK] OpenAI auth failed — using Gemini for welcome message")
        try:
            gemini = _get_gemini_client()
            response = await gemini.aio.models.generate_content(
                model=GEMINI_GENERATOR_MODEL,
                contents=f"{system_inst}\n\n{prompt}",
                config=genai.types.GenerateContentConfig(temperature=0.7, max_output_tokens=250),
            )
            return (response.text or "").strip()
        except Exception as e2:
            logger.error(f"Gemini fallback welcome error: {e2}")
            return fallback_msg
    except Exception as e:
        logger.error(f"Error generating welcome message: {e}")
        return fallback_msg
