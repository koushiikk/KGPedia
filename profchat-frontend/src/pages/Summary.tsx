import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Award, ArrowLeft, RotateCcw, Lightbulb, Target } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { socketService } from "@/services/socketService";

export default function Summary() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const sessionSummary = useChatStore((s) => s.sessionSummary);
  const activeProfession = useChatStore((s) => s.activeProfession);
  const resetChat = useChatStore((s) => s.resetChat);

  // If there's no summary (e.g. direct URL navigation), redirect to dashboard.
  useEffect(() => {
    if (!sessionSummary) {
      navigate("/", { replace: true });
    }
  }, [sessionSummary, navigate]);

  if (!sessionSummary) return null;

  function handleBack() {
    socketService.reset();
    resetChat();
    navigate("/");
  }

  function handleTryAgain() {
    const profession = activeProfession;
    const intake = useChatStore.getState().intakeData;
    socketService.reset();
    resetChat();
    if (profession && intake) {
      // Re-open dashboard to allow re-select (intake will re-appear on card click)
      navigate("/");
    } else {
      navigate("/");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600/20 border border-blue-500/30 rounded-full mb-4">
            <Award size={28} className="text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Session Complete</h1>
          <p className="text-slate-400">
            Here's how your{" "}
            <span className="text-white font-medium">{sessionSummary.role_title}</span> scenario went.
          </p>
          {sessionId && (
            <p className="text-slate-600 text-xs mt-1 font-mono">session {sessionId.slice(0, 8)}…</p>
          )}
        </div>

        <div className="space-y-5">
          {/* Debrief */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-slate-300 font-semibold text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="w-4 h-4 bg-blue-600/20 rounded flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              </span>
              Session Debrief
            </h2>
            <p className="text-slate-200 leading-relaxed">{sessionSummary.debrief}</p>
          </div>

          {/* Key Moments */}
          {sessionSummary.key_moments?.length > 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
              <h2 className="text-slate-300 font-semibold text-sm uppercase tracking-wide mb-4 flex items-center gap-2">
                <Target size={14} className="text-blue-400" />
                Key Moments
              </h2>
              <ul className="space-y-2.5">
                {sessionSummary.key_moments.map((moment, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className="w-5 h-5 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {moment}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills Identified */}
          {sessionSummary.skills_identified?.length > 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
              <h2 className="text-slate-300 font-semibold text-sm uppercase tracking-wide mb-4 flex items-center gap-2">
                <Lightbulb size={14} className="text-blue-400" />
                Skills Identified
              </h2>
              <div className="flex flex-wrap gap-2">
                {sessionSummary.skills_identified.map((skill) => (
                  <span
                    key={skill}
                    className="bg-blue-600/15 border border-blue-500/30 text-blue-300 text-sm px-3 py-1.5 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Career Fit */}
          {sessionSummary.career_fit_reflection && (
            <div className="bg-gradient-to-br from-blue-900/20 to-slate-900 border border-blue-500/20 rounded-2xl p-6">
              <h2 className="text-slate-300 font-semibold text-sm uppercase tracking-wide mb-3">
                Career Fit Reflection
              </h2>
              <p className="text-slate-200 leading-relaxed italic">
                "{sessionSummary.career_fit_reflection}"
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-8">
          <button
            onClick={handleBack}
            className="flex-1 flex items-center justify-center gap-2 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 py-3.5 rounded-xl text-sm font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            Back to scenarios
          </button>
          {activeProfession && (
            <button
              onClick={handleTryAgain}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl text-sm font-medium transition-colors"
            >
              <RotateCcw size={16} />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
