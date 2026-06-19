import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { User } from "firebase/auth";
import { loadCachedSessions } from "@/utils/sessionCache";

export interface SessionHistoryItem {
  session_id: string;
  profession_id: string;
  role_title: string;
  ended_at?: number;
  summary?: {
    debrief: string;
    skills_identified: string[];
    career_fit_reflection?: string;
  };
}

function mergeHistory(
  firestore: SessionHistoryItem[],
  cached: SessionHistoryItem[]
): SessionHistoryItem[] {
  const seen = new Set<string>();
  const merged: SessionHistoryItem[] = [];
  // Firestore takes precedence — add all Firestore entries first
  for (const item of firestore) {
    seen.add(item.session_id);
    merged.push(item);
  }
  // Fill in any cached entries not yet in Firestore (e.g. in-memory backend)
  for (const item of cached) {
    if (!seen.has(item.session_id)) {
      merged.push(item);
    }
  }
  // Sort newest first, cap at 20
  return merged
    .sort((a, b) => (b.ended_at ?? 0) - (a.ended_at ?? 0))
    .slice(0, 20);
}

export function useChatHistory(user: User | null) {
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    // Show cached results immediately (zero latency)
    const cached = loadCachedSessions(user.uid);
    if (cached.length > 0) {
      setHistory(
        cached.map((s) => ({
          session_id: s.session_id,
          profession_id: s.profession_id,
          role_title: s.role_title,
          ended_at: s.ended_at,
          summary: s.summary ?? undefined,
        }))
      );
    }

    // Then try Firestore and merge
    setLoading(true);
    const q = query(
      collection(db, "users", user.uid, "session_summaries"),
      orderBy("saved_at", "desc"),
      limit(20)
    );

    getDocs(q)
      .then((snapshot) => {
        const fsItems: SessionHistoryItem[] = snapshot.docs.map((doc) => ({
          session_id: doc.id,
          ...(doc.data() as Omit<SessionHistoryItem, "session_id">),
        }));
        const cachedItems: SessionHistoryItem[] = loadCachedSessions(user.uid).map((s) => ({
          session_id: s.session_id,
          profession_id: s.profession_id,
          role_title: s.role_title,
          ended_at: s.ended_at,
          summary: s.summary ?? undefined,
        }));
        setHistory(mergeHistory(fsItems, cachedItems));
      })
      .catch(() => {
        // Firestore unavailable — keep showing cached results
      })
      .finally(() => setLoading(false));
  }, [user?.uid]);

  return { history, loading };
}
