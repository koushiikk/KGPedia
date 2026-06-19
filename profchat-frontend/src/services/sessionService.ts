const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface CreateSessionPayload {
  user_id: string;
  profession_id: string;
  experience_level?: string;
  user_background?: string;
  career_goals?: string;
  user_first_name?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  user_id: string;
  profession_id: string;
  session_type: string;
}

export async function createSession(payload: CreateSessionPayload, token: string): Promise<CreateSessionResponse> {
  const res = await fetch(`${API_URL}/api/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create session: ${err}`);
  }
  return res.json() as Promise<CreateSessionResponse>;
}

export async function endSession(sessionId: string, userId: string, token: string): Promise<void> {
  await fetch(`${API_URL}/api/session/${sessionId}?user_id=${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getSessionHistory(sessionId: string, token: string) {
  const res = await fetch(`${API_URL}/api/history/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch session history");
  return res.json();
}
