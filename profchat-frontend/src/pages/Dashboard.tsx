import { useState } from "react";
import { Briefcase, LogOut, User, History } from "lucide-react";
import { PROFESSIONS } from "@/config/professions";
import type { Profession } from "@/config/professions";
import ProfessionCard from "@/components/ProfessionCard";
import AuthModal from "@/components/AuthModal";
import IntakeModal from "@/components/IntakeModal";
import { useAuth } from "@/hooks/useAuth";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useChat } from "@/hooks/useChat";
import type { IntakeData } from "@/store/chatStore";
import { loadSavedIntake } from "@/utils/intakeStorage";

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const { history } = useChatHistory(user);
  const { startSession } = useChat();

  const [showAuth, setShowAuth] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [selectedProfession, setSelectedProfession] = useState<Profession | null>(null);

  function handleCardClick(profession: Profession) {
    if (!user) {
      setShowAuth(true);
      return;
    }

    const savedIntake = loadSavedIntake(user.uid, profession.id);
    if (savedIntake) {
      startSession(profession, savedIntake);
      return;
    }

    setSelectedProfession(profession);
  }

  function handleIntakeSubmit(intake: IntakeData) {
    if (!selectedProfession || !user) return;
    setSelectedProfession(null);
    startSession(selectedProfession, intake);
  }



  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Briefcase size={16} className="text-white" />
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">ProSim</span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {history.length > 0 && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
                  >
                    <History size={15} />
                    <span className="hidden sm:inline">History</span>
                  </button>
                )}
                <div className="flex items-center gap-2 pl-3 border-l border-slate-700">
                  <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <User size={14} className="text-slate-300" />
                    )}
                  </div>
                  <span className="text-sm text-slate-300 hidden sm:block max-w-32 truncate">
                    {user.displayName || user.email}
                  </span>
                  <button
                    onClick={() => setShowSignOutConfirm(true)}
                    className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Sign out"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
          AI-Powered Professional Simulations
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4 max-w-2xl mx-auto leading-tight">
          Step Inside the Role.
          <span className="text-blue-400"> Feel the Pressure.</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Choose a profession and get dropped into a real-world scenario. Your AI mentor guides you through the decisions, debriefs you, and helps you figure out if this career is for you.
        </p>
        {!user && (
          <button
            onClick={() => setShowAuth(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-base shadow-lg shadow-blue-600/20"
          >
            Get started — it's free
          </button>
        )}
      </div>

      {/* Session History Panel */}
      {showHistory && user && history.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <History size={15} className="text-blue-400" />
                Recent Sessions
              </h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-slate-300 text-xs">
                Close
              </button>
            </div>
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.session_id}
                  className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{item.role_title}</p>
                    {item.summary?.debrief && (
                      <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">{item.summary.debrief}</p>
                    )}
                  </div>
                  {(item.summary?.skills_identified?.length ?? 0) > 0 && (
                    <div className="flex gap-1 ml-4 shrink-0">
                      {item.summary?.skills_identified?.slice(0, 2).map((skill) => (
                        <span key={skill} className="text-xs bg-blue-600/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Profession Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">Choose your scenario</h2>
          <span className="text-slate-500 text-sm">{PROFESSIONS.length} professions available</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PROFESSIONS.map((profession) => (
            <ProfessionCard
              key={profession.id}
              profession={profession}
              onClick={handleCardClick}
            />
          ))}
        </div>
      </div>

      {/* First-time preference modal */}
      {selectedProfession && user && (
        <IntakeModal
          profession={selectedProfession}
          userId={user.uid}
          onSubmit={handleIntakeSubmit}
          onClose={() => setSelectedProfession(null)}
        />
      )}


      {/* Auth Modal */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* Sign-out confirmation */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center justify-center shrink-0">
                <LogOut size={16} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Sign out?</h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  You'll need to sign in again to start a session.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 py-2.5 rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowSignOutConfirm(false); logout(); }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
