import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import type { IntakeData } from "@/store/chatStore";
import { socketService } from "@/services/socketService";
import { createSession } from "@/services/sessionService";
import type { Profession } from "@/config/professions";
import type { WSCompleteResponse, WSStreamingResponse, WSConnectionEstablished, SessionSummary } from "@/types/chat";
import { useAuth } from "./useAuth";
import {
  appendSessionToCache,
  saveLastSummary,
  loadLastSummary,
  clearLastSummary,
} from "@/utils/sessionCache";

let msgCounter = 0;
const newId = () => `msg_${Date.now()}_${++msgCounter}`;

// How long to wait for session_ended before force-navigating to dashboard.
const END_SESSION_TIMEOUT_MS = 8_000;

export function useChat() {
  const {
    session, setSession,
    activeProfession, setActiveProfession,
    setIntakeData,
    addMessage, updateLastMessage, clearMessages,
    connectionStatus, setConnectionStatus,
    setSessionSummary,
    setIsAiTyping,
    messages,
  } = useChatStore();

  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const streamingIdRef = useRef<string | null>(null);
  const endSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── WebSocket message handler ──────────────────────────────────────────────
  const handleWsMessage = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    if (type === "connection_established") {
      const msg = data as unknown as WSConnectionEstablished;
      console.log("[WS] Connected, session:", msg.session_id);
      return;
    }

    if (type === "response_streaming") {
      const chunk = data as unknown as WSStreamingResponse;
      if (!streamingIdRef.current) {
        const id = newId();
        streamingIdRef.current = id;
        setIsAiTyping(false);
        addMessage({
          id,
          role: "assistant",
          content: chunk.content,
          timestamp: Date.now(),
          isStreaming: true,
        });
      } else {
        const currentId = streamingIdRef.current;
        useChatStore.setState((state) => {
          const msgs = [...state.messages];
          const idx = msgs.findIndex((m) => m.id === currentId);
          if (idx !== -1) {
            msgs[idx] = { ...msgs[idx], content: msgs[idx].content + " " + chunk.content };
          }
          return { messages: msgs };
        });
      }
      return;
    }

    if (type === "complete_response") {
      const resp = data as unknown as WSCompleteResponse;
      setIsAiTyping(false);

      if (resp.session_ended) {
        if (endSessionTimerRef.current) {
          clearTimeout(endSessionTimerRef.current);
          endSessionTimerRef.current = null;
        }
        const summaryData = resp.summary ?? null;
        if (summaryData) setSessionSummary(summaryData);

        // Persist session to localStorage so history survives logout/restart
        const { session: currentSession, activeProfession } = useChatStore.getState();
        if (currentSession && summaryData) {
          const s = summaryData as SessionSummary;
          // Cache the full session entry for the history panel
          appendSessionToCache(currentSession.userId, {
            session_id: currentSession.sessionId,
            profession_id: currentSession.professionId,
            role_title: s.role_title || activeProfession?.title || "",
            ended_at: Date.now(),
            summary: {
              debrief: s.debrief ?? "",
              skills_identified: s.skills_identified ?? [],
              career_fit_reflection: s.career_fit_reflection ?? "",
            },
          });
          // Cache the debrief as "last summary" for this profession so the
          // backend can reference it even if in-memory session store was reset.
          if (s.debrief) {
            saveLastSummary(currentSession.userId, currentSession.professionId, s.debrief);
          }
        }

        socketService.removeListener("chat_handler");
        socketService.reset();
        setConnectionStatus("disconnected");
        streamingIdRef.current = null;

        if (summaryData && currentSession) {
          navigate(`/summary/${currentSession.sessionId}`);
        } else {
          navigate("/");
        }
        return;
      }

      if (streamingIdRef.current) {
        updateLastMessage(resp.total_content || "");
        streamingIdRef.current = null;
      } else {
        addMessage({
          id: newId(),
          role: "assistant",
          content: resp.total_content || "",
          timestamp: Date.now(),
        });
      }
    }
  }, [addMessage, updateLastMessage, setIsAiTyping, setSessionSummary, setConnectionStatus, navigate]);

  // ── Start a new session ───────────────────────────────────────────────────
  const startSession = useCallback(async (
    profession: Profession,
    intake: IntakeData,
    options: { resetContext?: boolean } = {}
  ) => {
    if (!user) return;

    setActiveProfession(profession);
    setIntakeData(intake);
    clearMessages();
    setConnectionStatus("connecting");

    try {
      const token = await getToken();
      const sessionData = await createSession(
        {
          user_id: user.uid,
          profession_id: profession.id,
          experience_level: intake.experience_level,
          user_background: intake.user_background,
          career_goals: intake.career_goals,
          user_first_name: user.displayName?.split(" ")[0] || "",
        },
        token
      );

      const sess = {
        sessionId: sessionData.session_id,
        userId: user.uid,
        professionId: profession.id,
        startedAt: Date.now(),
      };
      setSession(sess);

      // Navigate to chat page first so the connecting spinner is visible.
      navigate(`/chat/${sessionData.session_id}`);

      // Register message listener BEFORE sending initialize
      socketService.addListener("chat_handler", (raw) => {
        handleWsMessage(raw as Record<string, unknown>);
      });

      // Pass the cached "last session summary" for this user+profession so
      // the backend can generate a returning-user welcome even after a restart.
      // Fresh starts clear local memory and ask the backend to skip persisted context.
      if (options.resetContext) {
        clearLastSummary(user.uid, profession.id);
      }
      const cachedLastSummary = options.resetContext ? "" : loadLastSummary(user.uid, profession.id);

      await socketService.fireAndForget({
        type: "initialize",
        session_id: sessionData.session_id,
        user_id: user.uid,
        profession_id: profession.id,
        experience_level: intake.experience_level,
        user_background: intake.user_background,
        career_goals: intake.career_goals,
        user_first_name: user.displayName?.split(" ")[0] || "",
        last_session_summary: cachedLastSummary,
        reset_context: Boolean(options.resetContext),
      });

      setConnectionStatus("connected");
    } catch (err) {
      console.error("Failed to start session:", err);
      setConnectionStatus("error");
    }
  }, [user, setSession, setActiveProfession, setIntakeData, clearMessages, setConnectionStatus, getToken, navigate, handleWsMessage]);

  // ── Send a message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content: string) => {
    if (!session || !content.trim()) return;

    addMessage({
      id: newId(),
      role: "user",
      content: content.trim(),
      timestamp: Date.now(),
    });
    setIsAiTyping(true);

    try {
      const allMessages = useChatStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      await socketService.fireAndForget({
        type: "chat",
        message_id: `msg_${Date.now()}`,
        messages: allMessages,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setIsAiTyping(false);
    }
  }, [session, addMessage, setIsAiTyping]);

  // ── End the session ───────────────────────────────────────────────────────
  const endSession = useCallback(async () => {
    try {
      await socketService.fireAndForget({ type: "end" });
    } catch {
      // WS might already be closed; force navigation below.
    }

    // Fallback: if session_ended never arrives, force-navigate after timeout.
    if (endSessionTimerRef.current) clearTimeout(endSessionTimerRef.current);
    endSessionTimerRef.current = setTimeout(() => {
      endSessionTimerRef.current = null;
      socketService.removeListener("chat_handler");
      socketService.reset();
      setConnectionStatus("disconnected");
      navigate("/");
    }, END_SESSION_TIMEOUT_MS);
  }, [setConnectionStatus, navigate]);

  return {
    session,
    messages,
    connectionStatus,
    activeProfession,
    startSession,
    sendMessage,
    endSession,
  };
}
