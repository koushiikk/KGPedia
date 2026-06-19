"""
Tool definitions for the Profession Chat AI.

Two tools are available:
  save_portfolio_item  — saves debrief insights to the user's portfolio (debrief phase only)
  end_session          — gracefully ends the session when user signals goodbye
"""
import logging
from utils.firebase_utils import save_portfolio_item as _save_portfolio_item

logger = logging.getLogger("tools")

# ── OpenAI function schemas ────────────────────────────────────────────────────

PROFCHAT_FUNCTIONS = [
    {
        "name": "save_portfolio_item",
        "description": (
            "Save a debrief and key insights from this scenario session to the user's "
            "Career Insights Portfolio. Call this ONLY during the debrief phase, after "
            "the user has completed at least one reflection question."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "module_name": {
                    "type": "string",
                    "description": "The profession role title (e.g. 'Software Engineer')",
                },
                "summary_content": {
                    "type": "string",
                    "description": "A concise summary of what happened in the scenario and how the user engaged.",
                },
                "skills_identified": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of key skills or qualities the user demonstrated.",
                },
                "student_reflections": {
                    "type": "object",
                    "description": "Structured reflection answers from the debrief.",
                    "properties": {
                        "what_was_hardest": {"type": "string"},
                        "what_they_prioritized": {"type": "string"},
                        "career_fit_reflection": {"type": "string"},
                    },
                },
            },
            "required": ["module_name", "summary_content", "skills_identified"],
        },
    },
    {
        "name": "end_session",
        "description": (
            "End the current scenario session. Call this when the user explicitly says "
            "goodbye, that they're done, or clearly signals they want to stop."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Brief reason for ending (e.g. 'user_requested', 'scenario_complete')",
                }
            },
            "required": [],
        },
    },
]


# ── Python callables ────────────────────────────────────────────────────────────

async def save_portfolio_item_fn(
    module_name: str,
    summary_content: str,
    skills_identified: list,
    user_id: str = "",
    session_id: str = "",
    student_reflections: dict = None,
    **kwargs,
) -> dict:
    if not user_id or not session_id:
        logger.warning("save_portfolio_item called without user_id or session_id")
        return {"status": "error", "message": "Missing user_id or session_id"}
    return _save_portfolio_item(
        user_id=user_id,
        session_id=session_id,
        module_name=module_name,
        summary_content=summary_content,
        skills_identified=skills_identified,
        student_reflections=student_reflections,
    )


async def end_session_fn(reason: str = "user_requested", **kwargs) -> dict:
    return {"status": "end_session", "reason": reason}


AVAILABLE_FUNCTIONS: dict = {
    "save_portfolio_item": save_portfolio_item_fn,
    "end_session": end_session_fn,
}
