import type { ChatMessage } from "@/types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[78%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3 px-4 py-1.5">
      <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 mb-0.5">
        <span className="text-blue-400 text-xs font-bold">AI</span>
      </div>
      <div className="max-w-[78%] bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-sm">
        <span
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />
        {message.isStreaming && (
          <span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 animate-pulse align-text-bottom" />
        )}
      </div>
    </div>
  );
}
