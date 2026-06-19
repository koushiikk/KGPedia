import type { IntakeData } from "@/store/chatStore";

const PREFIX = "prosim_intake_v1";

function key(userId: string) {
  return `${PREFIX}_${userId}`;
}

export function saveIntake(userId: string, data: IntakeData): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(data));
  } catch {
    // storage unavailable — silently ignore
  }
}

export function loadSavedIntake(userId: string): IntakeData | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntakeData;
    if (!parsed.experience_level) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedIntake(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // ignore
  }
}

export const EXPERIENCE_LABELS: Record<string, string> = {
  in_training:   "Student / learning the basics",
  exploring:     "Exploring if this career fits",
  some_exposure: "Considering a career change",
  early_career:  "Already working in this area",
};
