import { Clock, ChevronRight } from "lucide-react";
import type { Profession } from "@/config/professions";

interface ProfessionCardProps {
  profession: Profession;
  onClick: (profession: Profession) => void;
  disabled?: boolean;
}

export default function ProfessionCard({ profession, onClick, disabled }: ProfessionCardProps) {
  return (
    <button
      onClick={() => !disabled && onClick(profession)}
      disabled={disabled}
      className="group relative w-full text-left bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden hover:border-blue-500/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/50"
    >
      {/* Image */}
      <div className="relative h-44 overflow-hidden">
        <img
          src={profession.image}
          alt={profession.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />

        {/* Duration badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-full border border-white/10">
          <Clock size={12} className="text-blue-400" />
          <span>{profession.duration}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-semibold text-white group-hover:text-blue-300 transition-colors leading-tight">
            {profession.title}
          </h3>
          <ChevronRight
            size={16}
            className="text-slate-500 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5 mt-0.5 shrink-0"
          />
        </div>

        <p className="text-blue-400/80 text-xs font-medium uppercase tracking-wide mb-2">
          {profession.scenario}
        </p>

        <p className="text-slate-400 text-sm leading-relaxed line-clamp-2">
          {profession.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {profession.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
