"""
ProSim Backend — Profession Scenario Chat API
FastAPI + WebSocket + Gemini + OpenAI
"""
import json
import logging
import uuid
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config.settings import CORS_ORIGINS
from routers.session_router import router as session_router
from routers.professions_router import router as professions_router
from services.chat_service import ChatSession, register_session, deregister_session
from services.session_service import fetch_session, fetch_last_summary, end_session
from services.summary_service import generate_session_summary
from utils.llm.orchestrator import handle_chat_turn, generate_welcome_message

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("main")

app = FastAPI(
    title="ProSim API",
    version="1.0.0",
    description="Profession Scenario Chat — AI-powered career simulation chatbot",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session_router)
app.include_router(professions_router)


@app.get("/")
async def root():
    return {"message": "ProSim API is running", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ── WebSocket chat endpoint ────────────────────────────────────────────────────

@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket):
    await websocket.accept()
    chat_session: ChatSession | None = None
    session_initialized = False
    ai_name = "AI Mentor"

    logger.info("[WS] New connection accepted")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Invalid JSON"}))
                continue

            message_type = body.get("type", "")

            # ── PING ──────────────────────────────────────────────────────────
            if message_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "timestamp": datetime.utcnow().isoformat()}))
                continue

            # ── INITIALIZE ────────────────────────────────────────────────────
            if message_type == "initialize":
                session_id = body.get("session_id", "")
                user_id = body.get("user_id", "")
                profession_id = body.get("profession_id", "")

                if not all([session_id, user_id, profession_id]):
                    await websocket.send_text(json.dumps({"error": "initialize requires session_id, user_id, and profession_id"}))
                    continue

                # Reject obviously fake / anonymous user IDs — every user must
                # have a real Firebase UID so session data is properly isolated.
                if len(user_id) < 8 or user_id in ("anonymous", "guest", "undefined", "null"):
                    await websocket.send_text(json.dumps({"error": "A valid authenticated user_id is required"}))
                    continue

                # Validate session exists in Firestore (created via POST /api/session)
                session_data = fetch_session(session_id)
                if not session_data:
                    # If session doesn't exist in Firestore (e.g. offline/dev), create it in-memory
                    logger.warning(f"[WS] Session {session_id} not in Firestore — proceeding in-memory only")

                # Build ChatSession
                chat_session = ChatSession(session_id=session_id, user_id=user_id)
                chat_session.profession_id = profession_id
                chat_session.experience_level = body.get("experience_level", "in_training")
                chat_session.user_background = body.get("user_background", "")
                chat_session.career_goals = body.get("career_goals", "")
                chat_session.user_first_name = body.get("user_first_name", "")
                reset_context = bool(body.get("reset_context", False))

                # Load last session summary for returning user context.
                # Frontend passes a cached summary (from localStorage) which
                # takes priority — this keeps context even if the backend
                # restarted and lost its in-memory fallback store.
                client_last_summary = body.get("last_session_summary", "").strip()
                if reset_context:
                    chat_session.last_session_summary = ""
                    logger.info(f"[WS] Context reset requested for session {session_id}")
                elif client_last_summary:
                    chat_session.last_session_summary = client_last_summary
                else:
                    try:
                        last_summary = fetch_last_summary(user_id=user_id, profession_id=profession_id)
                        chat_session.last_session_summary = last_summary
                    except Exception:
                        pass

                register_session(chat_session)
                session_initialized = True

                # Send connection_established
                await websocket.send_text(json.dumps({
                    "type": "connection_established",
                    "session_id": session_id,
                    "ai_name": ai_name,
                    "timestamp": datetime.utcnow().isoformat(),
                    "message": "Session initialized successfully",
                }))

                # Generate and send welcome message
                session_context = chat_session.get_session_context()
                welcome_text = await generate_welcome_message(session_context, ai_name)
                chat_session.add_message("assistant", welcome_text)

                welcome_msg_id = f"welcome_{uuid.uuid4().hex[:8]}"
                await websocket.send_text(json.dumps({
                    "type": "complete_response",
                    "content": "",
                    "avatar_name": ai_name,
                    "function_called": None,
                    "is_complete": True,
                    "total_content": welcome_text,
                    "is_welcome": True,
                    "message_id": welcome_msg_id,
                }))
                logger.info(f"[WS] Session {session_id} initialized for profession '{profession_id}'")
                continue

            # ── END ────────────────────────────────────────────────────────────
            if message_type == "end":
                if not session_initialized or not chat_session:
                    await websocket.close()
                    break

                summary = await generate_session_summary(chat_session)
                try:
                    end_session(session_id=chat_session.session_id, user_id=chat_session.user_id, summary=summary)
                except Exception as e:
                    logger.warning(f"Failed to save end session summary: {e}")

                await websocket.send_text(json.dumps({
                    "type": "session_ended",
                    "session_id": chat_session.session_id,
                    "summary": summary,
                }))
                deregister_session(chat_session.session_id)
                break

            # ── CHAT ────────────────────────────────────────────────────────────
            if message_type == "chat":
                if not session_initialized or not chat_session:
                    await websocket.send_text(json.dumps({"error": "Session not initialized. Send 'initialize' message first."}))
                    continue

                # Guard: reject messages from a different user than the one who
                # initialized this session — prevents cross-user context injection.
                sender_id = body.get("user_id", "")
                if sender_id and sender_id != chat_session.user_id:
                    logger.warning(
                        f"[SECURITY] user_id mismatch on session {chat_session.session_id}: "
                        f"expected {chat_session.user_id!r}, got {sender_id!r}"
                    )
                    await websocket.send_text(json.dumps({"error": "Session user mismatch"}))
                    continue

                messages = body.get("messages", [])
                message_id = body.get("message_id") or f"msg_{uuid.uuid4().hex[:8]}"

                if not messages:
                    continue

                last_user_msg = next(
                    (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), ""
                )
                if not last_user_msg:
                    continue

                # Add user message to session history
                chat_session.add_message("user", last_user_msg)

                convo_messages = chat_session.build_convo_messages(last_user_msg)

                await handle_chat_turn(
                    websocket=websocket,
                    chat_session=chat_session,
                    convo_messages=convo_messages,
                    session_context=chat_session.get_session_context(),
                    ai_name=ai_name,
                    message_id=message_id,
                )
                continue

            # Unknown message type
            await websocket.send_text(json.dumps({"error": f"Unknown message type: {message_type}"}))

    except WebSocketDisconnect:
        logger.info(f"[WS] Client disconnected")
        if chat_session:
            # Generate and save summary on disconnect
            try:
                summary = await generate_session_summary(chat_session)
                end_session(session_id=chat_session.session_id, user_id=chat_session.user_id, summary=summary)
            except Exception as e:
                logger.warning(f"Failed to save disconnect summary: {e}")
            deregister_session(chat_session.session_id)
    except Exception as e:
        logger.error(f"[WS] Unexpected error: {e}", exc_info=True)
        try:
            await websocket.send_text(json.dumps({"error": "Internal server error"}))
            await websocket.close()
        except Exception:
            pass
        if chat_session:
            deregister_session(chat_session.session_id)
