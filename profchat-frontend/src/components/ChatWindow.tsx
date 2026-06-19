import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, X, AlertCircle, RefreshCw } from "lucide-react";
import type { ChatMessage, ConnectionStatus } from "@/types/chat";
import type { Profession } from "@/config/professions";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

interface ChatWindowProps {
  profession: Profession;
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  isAiTyping: boolean;
  onSendMessage: (content: string) => void;
  onEndSession: () => void;
  onBack: () => void;
  onRetry?: () => void;
}

export default function ChatWindow({
  profession,
  messages,
  connectionStatus,
  isAiTyping,
  onSendMessage,
  onEndSession,
  onBack,
  onRetry,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAiTyping]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || connectionStatus !== "connected") return;
    onSendMessage(trimmed);
    setInput("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = input.trim().length > 0 && connectionStatus === "connected";

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white truncate">{profession.title}</h2>
            <ConnectionDot status={connectionStatus} />
          </div>
          <p className="text-xs text-slate-400 truncate">{profession.scenario}</p>
        </div>

        <button
          onClick={() => setShowEndConfirm(true)}
          className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-slate-800"
          title="End session"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {connectionStatus === "connecting" && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Connecting to your mentor…</p>
          </div>
        )}

        {connectionStatus === "error" && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center">
              <AlertCircle size={22} className="text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium mb-1">Could not connect</p>
              <p className="text-slate-400 text-sm">Make sure the backend server is running and your API keys are set up.</p>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <RefreshCw size={14} />
                Try again
              </button>
            )}
            <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              ← Back to scenarios
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isAiTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <div className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl focus-within:border-blue-500 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response…"
              rows={1}
              className="w-full bg-transparent px-4 pt-3 pb-3 text-sm text-white placeholder-slate-500 focus:outline-none resize-none max-h-40 overflow-y-auto"
              style={{ lineHeight: "1.5" }}
              disabled={connectionStatus !== "connected"}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-2xl flex items-center justify-center transition-colors"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
        <p className="text-xs text-slate-600 text-center mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* Ending session overlay */}
      {isEndingSession && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm gap-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300 text-sm">Generating your session summary…</p>
        </div>
      )}

      {/* End session confirm dialog */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">End this session?</h3>
            <p className="text-slate-400 text-sm mb-6">
              Your session will be saved and a summary will be generated.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  setIsEndingSession(true);
                  onEndSession();
                }}
                className="flex-1 bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/30 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                End session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />;
  }
  if (status === "connecting") {
    return <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />;
  }
  if (status === "error") {
    return <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />;
  }
  return <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" />;
}
