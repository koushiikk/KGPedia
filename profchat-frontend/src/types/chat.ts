export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface Session {
  sessionId: string;
  userId: string;
  professionId: string;
  startedAt: number;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface WSCompleteResponse {
  type: "complete_response";
  content: string;
  total_content: string;
  avatar_name: string;
  function_called: string | null;
  is_complete: boolean;
  session_ended?: boolean;
  reason?: string;
  summary?: SessionSummary;
  message_id?: string;
  is_welcome?: boolean;
  error?: boolean;
}

export interface WSStreamingResponse {
  type: "response_streaming";
  content: string;
  avatar_name: string;
  is_complete: boolean;
  message_id?: string;
}

export interface WSConnectionEstablished {
  type: "connection_established";
  session_id: string;
  ai_name: string;
  timestamp: string;
}

export interface SessionSummary {
  profession_id: string;
  role_title: string;
  debrief: string;
  key_moments: string[];
  skills_identified: string[];
  career_fit_reflection: string;
}
