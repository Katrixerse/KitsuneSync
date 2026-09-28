import type { CatMood } from "@/lib/profile";

const PINK = "#ff2a6d";
const CYAN = "#05d9e8";
const YELLOW = "#f9f002";

function Eyes({ mood }: { mood: CatMood }) {
  switch (mood) {
    case "excited":
      return (
        <g className="cat-eye" fill={CYAN}>
          <circle cx="47" cy="53" r="5" />
          <circle cx="73" cy="53" r="5" />
          <circle cx="49" cy="51" r="1.6" fill="#fff" />
          <circle cx="75" cy="51" r="1.6" fill="#fff" />
        </g>
      );
    case "judging":
      return (
        <g stroke={CYAN} strokeWidth="3" strokeLinecap="round">
          <line className="cat-eye" x1="41" y1="54" x2="53" y2="54" />
          <line className="cat-eye" x1="67" y1="54" x2="79" y2="54" />
          <line x1="66" y1="47" x2="80" y2="49" strokeWidth="2" stroke={PINK} />
        </g>
      );
    case "sleepy":
      return (
        <g fill="none" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round">
          <path d="M41 52 q6 6 12 0" />
          <path d="M67 52 q6 6 12 0" />
        </g>
      );
    case "love":
      return (
        <g fill={PINK}>
          <path d="M47 58 l-5 -5 a3 3 0 0 1 5 -3 a3 3 0 0 1 5 3 z" />
          <path d="M73 58 l-5 -5 a3 3 0 0 1 5 -3 a3 3 0 0 1 5 3 z" />
        </g>
      );
    case "smug":
    default:
      return (
        <g fill={CYAN}>
          <path className="cat-eye" d="M41 53 h12 a6 4 0 0 1 -12 0 z" />
          <path className="cat-eye" d="M67 53 h12 a6 4 0 0 1 -12 0 z" />
        </g>
      );
  }
}

/** A cyberpunk cat with a visor. Its eyes follow the mood of whatever it's saying. */
export function CatMascot({ mood = "smug", className = "" }: { mood?: CatMood; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={`Cat mascot looking ${mood}`}>
      <defs>
        <filter id="cat-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        className="cat-tail"
        d="M88 104 C108 102 112 84 104 70"
        fill="none"
        stroke="#1d1d33"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path className="cat-tail" d="M88 104 C108 102 112 84 104 70" fill="none" stroke={CYAN} strokeWidth="1" opacity=".6" />

      <ellipse cx="60" cy="98" rx="31" ry="18" fill="#1d1d33" stroke={CYAN} strokeOpacity=".5" />

      <path d="M32 44 L36 12 L56 30 Z" fill="#1d1d33" stroke={CYAN} strokeOpacity=".5" />
      <path d="M88 44 L84 12 L64 30 Z" fill="#1d1d33" stroke={CYAN} strokeOpacity=".5" />
      <path d="M37 36 L39 20 L49 30 Z" fill={PINK} opacity=".7" />
      <path d="M83 36 L81 20 L71 30 Z" fill={PINK} opacity=".7" />
      <circle cx="84" cy="22" r="2" fill={YELLOW} filter="url(#cat-glow)" />

      <ellipse cx="60" cy="56" rx="32" ry="28" fill="#1d1d33" stroke={CYAN} strokeOpacity=".5" />

      <rect x="34" y="43" width="52" height="20" rx="6" fill="#07070d" stroke={PINK} strokeWidth="1.5" filter="url(#cat-glow)" />
      <g filter="url(#cat-glow)">
        <Eyes mood={mood} />
      </g>

      <path d="M57 68 l3 2.5 l3 -2.5" fill={PINK} />
      <path d="M54 72 q3 3 6 0 q3 3 6 0" fill="none" stroke="#c7c7de" strokeWidth="1.3" strokeLinecap="round" />
      <g stroke="#c7c7de" strokeWidth=".8" opacity=".6">
        <line x1="30" y1="66" x2="46" y2="68" />
        <line x1="30" y1="72" x2="46" y2="71" />
        <line x1="90" y1="66" x2="74" y2="68" />
        <line x1="90" y1="72" x2="74" y2="71" />
      </g>

      <ellipse cx="46" cy="112" rx="8" ry="4" fill="#1d1d33" stroke={CYAN} strokeOpacity=".4" />
      <ellipse cx="74" cy="112" rx="8" ry="4" fill="#1d1d33" stroke={CYAN} strokeOpacity=".4" />
    </svg>
  );
}
