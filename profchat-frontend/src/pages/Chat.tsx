import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import { useChat } from "@/hooks/useChat";
import { socketService } from "@/services/socketService";
import ChatWindow from "@/components/ChatWindow";
import SessionSettingsModal from "@/components/SessionSettingsModal";

export default function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const activeProfession = useChatStore((s) => s.activeProfession);
  const session = useChatStore((s) => s.session);
  const messages = useChatStore((s) => s.messages);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const isAiTyping = useChatStore((s) => s.isAiTyping);
  const resetChat = useChatStore((s) => s.resetChat);
  const intakeData = useChatStore((s) => s.intakeData);
  const [showSettings, setShowSettings] = useState(false);

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

  function handleSettingsStart(nextIntake: NonNullable<typeof intakeData>, options?: { resetContext?: boolean }) {
    if (!activeProfession) return;
    setShowSettings(false);
    socketService.reset();
    startSession(activeProfession, nextIntake, options);
  }

  return (
    <>
      <ChatWindow
        profession={activeProfession}
        messages={messages}
        connectionStatus={connectionStatus}
        isAiTyping={isAiTyping}
        onSendMessage={sendMessage}
        onEndSession={endSession}
        onBack={handleBack}
        onRetry={handleRetry}
        onOpenSettings={() => setShowSettings(true)}
      />

      {showSettings && intakeData && (
        <SessionSettingsModal
          profession={activeProfession}
          userId={session.userId}
          intake={intakeData}
          startLabel="Apply and restart session"
          onStart={handleSettingsStart}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
