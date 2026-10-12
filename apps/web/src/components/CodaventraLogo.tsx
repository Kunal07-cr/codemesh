export function CodaventraLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/brand/codaventra-pathfinder-v1.png"
      alt=""
      aria-hidden="true"
      width={32}
      height={32}
      draggable={false}
      className={`cm-logo-mark ${className}`}
    />
  );
}
