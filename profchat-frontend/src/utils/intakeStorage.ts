import type { IntakeData } from "@/store/chatStore";

const PREFIX = "prosim_intake_v1";

function key(userId: string, professionId: string) {
  return `${PREFIX}_${userId}_${professionId}`;
}

export function saveIntake(userId: string, professionId: string, data: IntakeData): void {
  try {
    localStorage.setItem(key(userId, professionId), JSON.stringify(data));
  } catch {
    // storage unavailable - silently ignore
  }
}

export function loadSavedIntake(userId: string, professionId: string): IntakeData | null {
  try {
    const raw = localStorage.getItem(key(userId, professionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntakeData;
    if (!parsed.experience_level) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedIntake(userId: string, professionId: string): void {
  try {
    localStorage.removeItem(key(userId, professionId));
  } catch {
    // ignore
  }
}

export const EXPERIENCE_OPTIONS = [
  { value: "in_training",   label: "Student / learning the basics" },
  { value: "exploring",     label: "Exploring if this career fits me" },
  { value: "some_exposure", label: "Considering a career change" },
  { value: "early_career",  label: "Already working in this area" },
] as const;

export const EXPERIENCE_LABELS: Record<string, string> = Object.fromEntries(
  EXPERIENCE_OPTIONS.map((option) => [option.value, option.label])
);
