import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import { useChat } from "@/hooks/useChat";
import { socketService } from "@/services/socketService";
import ChatWindow from "@/components/ChatWindow";

export default function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const activeProfession = useChatStore((s) => s.activeProfession);
  const session = useChatStore((s) => s.session);
  const messages = useChatStore((s) => s.messages);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const isAiTyping = useChatStore((s) => s.isAiTyping);
  const resetChat = useChatStore((s) => s.resetChat);

  const { sendMessage, endSession, startSession } = useChat();

  // If navigated here directly without a session in store, go back to dashboard.
  useEffect(() => {
    if (!session || session.sessionId !== sessionId) {
      if (connectionStatus === "disconnected") {
        navigate("/", { replace: true });
      }
    }
  }, [session, sessionId, connectionStatus, navigate]);

  if (!activeProfession || !session) {
    return null;
  }

  function handleBack() {
    socketService.reset();
    resetChat();
    navigate("/");
  }

  function handleRetry() {
    const store = useChatStore.getState();
    const profession = store.activeProfession;
    const intake = store.intakeData;
    if (profession && intake) {
      socketService.reset();
      store.clearMessages();
      store.setConnectionStatus("connecting");
      startSession(profession, intake);
    }
  }

  return (
    <ChatWindow
      profession={activeProfession}
      messages={messages}
      connectionStatus={connectionStatus}
      isAiTyping={isAiTyping}
      onSendMessage={sendMessage}
      onEndSession={endSession}
      onBack={handleBack}
      onRetry={handleRetry}
    />
  );
}
