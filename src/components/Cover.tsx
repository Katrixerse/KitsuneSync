import Image from "next/image";

interface CoverProps {
  title: string;
  src: string | null;
  color?: string | null;
  className?: string;
  sizes?: string;
}

/** Cover art from AniList, or a generated placeholder when there is none. */
export function Cover({ title, src, color, className = "", sizes = "160px" }: CoverProps) {
  const tint = color ?? "#9d4dff";
  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden bg-panel-2 ${className}`}
      style={{ boxShadow: `inset 0 0 0 1px ${tint}33` }}
    >
      {src ? (
        <Image src={src} alt="" fill sizes={sizes} className="object-cover" />
      ) : (
        <div
          aria-hidden
          className="scanlines @container flex h-full w-full items-end p-2"
          style={{ background: `linear-gradient(160deg, ${tint}55, #10101c 70%)` }}
        >
          {/* Small covers are too narrow for a title, so they show its initial instead. */}
          <span className="font-display text-2xl font-bold text-ink/70 @[5.5rem]:hidden">
            {title.charAt(0)}
          </span>
          <span className="hidden font-display text-xs font-semibold leading-tight text-ink/90 @[5.5rem]:line-clamp-3">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
