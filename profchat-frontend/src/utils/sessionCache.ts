/**
 * Client-side localStorage cache for session history and per-profession
 * "returning user" summaries.
 *
 * Why this exists:
 *  - Firestore is the source of truth, but:
 *      a) The backend's Firestore is sometimes in in-memory mode (dev / bad creds)
 *         and loses data on restart.
 *      b) Firestore SDK reads are async and take a round-trip.
 *  - This cache gives instant history rendering on login and keeps the
 *    "returning user" context even after a backend restart.
 *  - All keys are scoped by userId — different accounts never share data.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CachedSession {
  session_id: string;
  profession_id: string;
  role_title: string;
  ended_at: number;         // unix ms
  summary: {
    debrief: string;
    skills_identified: string[];
    career_fit_reflection?: string;
  } | null;
}

// ── Keys ──────────────────────────────────────────────────────────────────────

const SESSION_LIST_PREFIX  = "prosim_sessions_v1";
const LAST_SUMMARY_PREFIX  = "prosim_last_summary_v1";

function sessionListKey(userId: string)                     { return `${SESSION_LIST_PREFIX}_${userId}`; }
function lastSummaryKey(userId: string, professionId: string) { return `${LAST_SUMMARY_PREFIX}_${userId}_${professionId}`; }

// ── Session list ─────────────────────────────────────────────────────────────

export function loadCachedSessions(userId: string): CachedSession[] {
  try {
    const raw = localStorage.getItem(sessionListKey(userId));
    return raw ? (JSON.parse(raw) as CachedSession[]) : [];
  } catch {
    return [];
  }
}

export function appendSessionToCache(userId: string, session: CachedSession): void {
  try {
    const existing = loadCachedSessions(userId);
    // Upsert by session_id, keep newest first, cap at 20
    const updated = [
      session,
      ...existing.filter((s) => s.session_id !== session.session_id),
    ].slice(0, 20);
    localStorage.setItem(sessionListKey(userId), JSON.stringify(updated));
  } catch {
    // storage full or unavailable — silently skip
  }
}

export function clearSessionCache(userId: string): void {
  try {
    localStorage.removeItem(sessionListKey(userId));
  } catch { /* ignore */ }
}

// ── Per-profession last summary (for "returning user" welcome) ────────────────

export function saveLastSummary(userId: string, professionId: string, debrief: string): void {
  try {
    if (!debrief) return;
    localStorage.setItem(lastSummaryKey(userId, professionId), debrief);
  } catch { /* ignore */ }
}

export function loadLastSummary(userId: string, professionId: string): string {
  try {
    return localStorage.getItem(lastSummaryKey(userId, professionId)) ?? "";
  } catch {
    return "";
  }
}
