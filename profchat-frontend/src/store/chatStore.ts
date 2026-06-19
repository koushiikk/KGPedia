import { create } from "zustand";
import type { ChatMessage, Session, ConnectionStatus, SessionSummary } from "@/types/chat";
import type { Profession } from "@/config/professions";

export interface IntakeData {
  experience_level: string;    // "student" | "career_changer" | "professional" | "exploring"
  user_background: string;     // optional free-text
  career_goals: string;        // optional free-text
}

interface ChatStore {
  activeProfession: Profession | null;
  setActiveProfession: (p: Profession | null) => void;

  intakeData: IntakeData | null;
  setIntakeData: (d: IntakeData | null) => void;

  session: Session | null;
  setSession: (s: Session | null) => void;

  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  clearMessages: () => void;

  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;

  sessionSummary: SessionSummary | null;
  setSessionSummary: (s: SessionSummary | null) => void;

  isAiTyping: boolean;
  setIsAiTyping: (v: boolean) => void;

  resetChat: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeProfession: null,
  setActiveProfession: (p) => set({ activeProfession: p }),

  intakeData: null,
  setIntakeData: (d) => set({ intakeData: d }),

  session: null,
  setSession: (s) => set({ session: s }),

  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  updateLastMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content, isStreaming: false };
      }
      return { messages: msgs };
    }),
  clearMessages: () => set({ messages: [] }),

  connectionStatus: "disconnected",
  setConnectionStatus: (s) => set({ connectionStatus: s }),

  sessionSummary: null,
  setSessionSummary: (s) => set({ sessionSummary: s }),

  isAiTyping: false,
  setIsAiTyping: (v) => set({ isAiTyping: v }),

  resetChat: () =>
    set({
      activeProfession: null,
      intakeData: null,
      session: null,
      messages: [],
      connectionStatus: "disconnected",
      sessionSummary: null,
      isAiTyping: false,
    }),
}));
