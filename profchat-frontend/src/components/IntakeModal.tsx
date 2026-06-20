import { useState } from "react";
import { X, Briefcase, ChevronRight } from "lucide-react";
import type { Profession } from "@/config/professions";
import type { IntakeData } from "@/store/chatStore";
import { EXPERIENCE_OPTIONS, loadSavedIntake, saveIntake } from "@/utils/intakeStorage";

interface IntakeModalProps {
  profession: Profession;
  userId: string;
  onSubmit: (intake: IntakeData) => void;
  onClose: () => void;
}


export default function IntakeModal({ profession, userId, onSubmit, onClose }: IntakeModalProps) {
  const saved = loadSavedIntake(userId, profession.id);
  const [experienceLevel, setExperienceLevel] = useState(saved?.experience_level ?? "");
  const [background, setBackground] = useState(saved?.user_background ?? "");
  const [goals, setGoals] = useState(saved?.career_goals ?? "");
  const [step, setStep] = useState<1 | 2>(1);

  function handleNext() {
    if (!experienceLevel) return;
    setStep(2);
  }

  function handleStart() {
    const intake: IntakeData = {
      experience_level: experienceLevel || "exploring",
      user_background: background.trim(),
      career_goals: goals.trim(),
    };
    saveIntake(userId, profession.id, intake);
    onSubmit(intake);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
              <Briefcase size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{profession.title}</p>
              <p className="text-slate-400 text-xs">{profession.scenario}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step 1 — Experience level */}
        {step === 1 && (
          <div className="px-6 py-5">
            <h2 className="text-white font-semibold mb-1">Where are you right now?</h2>
            <p className="text-slate-400 text-sm mb-5">
              This helps your AI mentor calibrate the scenario to the right level.
            </p>

            <div className="space-y-2.5">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExperienceLevel(opt.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    experienceLevel === opt.value
                      ? "bg-blue-600/20 border-blue-500/60 text-white"
                      : "bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleNext}
              disabled={!experienceLevel}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2 — Background + goals */}
        {step === 2 && (
          <div className="px-6 py-5">
            <h2 className="text-white font-semibold mb-1">A bit about you <span className="text-slate-500 font-normal">(optional)</span></h2>
            <p className="text-slate-400 text-sm mb-5">
              Share anything relevant — your AI mentor will factor this in. You can skip both.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Your background
                </label>
                <textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="e.g. CS grad, 2 years as a data analyst, curious about SWE roles…"
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                  What do you want to get out of this?
                </label>
                <textarea
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="e.g. Want to see if I'd enjoy the day-to-day pressure, prep for interviews…"
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-none border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 px-4 py-3 rounded-xl text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-colors text-sm"
              >
                Start scenario
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
