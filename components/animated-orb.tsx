import type { ReactNode } from "react";

export type AnimatedOrbTone =
  | "brand"
  | "dawn"
  | "morning"
  | "afternoon"
  | "sunset"
  | "dusk"
  | "night"
  | "mint"
  | "coral";

type AnimatedOrbProps = {
  busy?: boolean;
  className?: string;
  icon?: ReactNode;
  size?: "compact" | "medium" | "large";
  tone?: AnimatedOrbTone;
};

export function AnimatedOrb({
  busy = false,
  className = "",
  icon,
  size = "medium",
  tone = "brand",
}: AnimatedOrbProps) {
  return (
    <span
      aria-hidden="true"
      className={`animated-orb is-${size} tone-${tone}${busy ? " is-busy" : ""}${className ? ` ${className}` : ""}`}
    >
      <i className="animated-orb-cyan" />
      <i className="animated-orb-violet" />
      <i className="animated-orb-coral" />
      <b />
      {icon && <span className="animated-orb-icon">{icon}</span>}
    </span>
  );
}

export function SectionOrbLoader({
  className = "",
  detail,
  label,
  tone = "brand",
}: {
  className?: string;
  detail?: string;
  label: string;
  tone?: AnimatedOrbTone;
}) {
  return (
    <div
      className={`section-orb-loader${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
    >
      <AnimatedOrb busy tone={tone} />
      <strong>{label}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
