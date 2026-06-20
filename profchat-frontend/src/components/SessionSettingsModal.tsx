import { useState } from "react";
import { Briefcase, ChevronRight, RotateCcw, Settings, X } from "lucide-react";
import type { Profession } from "@/config/professions";
import type { IntakeData } from "@/store/chatStore";
import { EXPERIENCE_OPTIONS, saveIntake } from "@/utils/intakeStorage";

interface SessionSettingsModalProps {
  profession: Profession;
  userId: string;
  intake: IntakeData;
  onStart: (intake: IntakeData, options?: { resetContext?: boolean }) => void;
  onClose: () => void;
  startLabel?: string;
}

export default function SessionSettingsModal({
  profession,
  userId,
  intake,
  onStart,
  onClose,
  startLabel = "Start session",
}: SessionSettingsModalProps) {
  const [experienceLevel, setExperienceLevel] = useState(intake.experience_level || "exploring");
  const [background, setBackground] = useState(intake.user_background || "");
  const [goals, setGoals] = useState(intake.career_goals || "");
  const [resetContext, setResetContext] = useState(false);

  function handleStart() {
    const updatedIntake: IntakeData = {
      experience_level: experienceLevel,
      user_background: background.trim(),
      career_goals: goals.trim(),
    };
    saveIntake(userId, profession.id, updatedIntake);
    onStart(updatedIntake, { resetContext });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
              <Settings size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Session settings</p>
              <p className="text-slate-400 text-xs">{profession.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Briefcase size={15} className="text-blue-400" />
              <h2 className="text-white font-semibold text-sm">Saved preference</h2>
            </div>
            <div className="grid gap-2">
              {EXPERIENCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setExperienceLevel(option.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    experienceLevel === option.value
                      ? "bg-blue-600/20 border-blue-500/60 text-white"
                      : "bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                Background
              </label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                Goal
              </label>
              <textarea
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none transition-colors"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 cursor-pointer hover:border-slate-600 transition-colors">
            <input
              type="checkbox"
              checked={resetContext}
              onChange={(e) => setResetContext(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="flex items-center gap-1.5 text-slate-200 text-sm font-medium">
                <RotateCcw size={14} className="text-blue-400" />
                Reset session summary and start fresh
              </span>
              <span className="block text-slate-500 text-xs mt-1 leading-relaxed">
                Ignore previous mentor memory for this profession. Your history list stays saved.
              </span>
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-none border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 px-4 py-3 rounded-xl text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-colors text-sm"
            >
              {startLabel}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
