import { Snowflake } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

const bulbs = ["gold", "red", "green", "gold", "green", "red", "gold", "red", "green"] as const;

export function ChristmasLights() {
  return (
    <div className="christmas-lights" aria-hidden="true">
      {bulbs.map((color, index) => (
        <span key={index} data-color={color} style={{ "--bulb-order": index } as CSSProperties} />
      ))}
    </div>
  );
}

export function ChristmasNavbarWoodland() {
  return <div className="christmas-navbar-woodland" aria-hidden="true" />;
}

function FlightReindeer({ x, y, lead = false }: { x: number; y: number; lead?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M12 20 7 25 2 25M17 21l-3 7-4 2m15-9 6 5 5-4m-8-4 8 3 5-3" fill="none" stroke="#7b492e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 15c-3-3-6-3-7-2 1 3 4 5 7 5" fill="#a66940" />
      <path d="M6 16c3-4 10-3 16-2l5-5c2-2 6-3 8-1l3 3 5 1c2 1 1 4-1 4l-7 1-6 4c-6 3-18 3-22-1-1-1-2-3-1-4Z" fill="#b47746" />
      <path d="M31 11c-3 0-5-2-6-5 3 0 6 1 7 3" fill="#8e542f" />
      <path d="m33 8-4-5-1-3m2 4-5-2m8 5 4-4 1-3m-2 4 5-1" fill="none" stroke="#63432d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m29 12 3 6" stroke="#a32844" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30.8" cy="17" r="1.3" fill="#ffe09a" />
      <circle cx="36" cy="11.8" r="1" fill="#462b1e" />
      <circle cx="43" cy="13.5" r="1.7" fill={lead ? "#ae2e43" : "#63432d"} />
    </g>
  );
}

const trailFlakes = [
  { left: 13, top: 48, size: 6, delay: -0.46 },
  { left: 29, top: 22, size: 8, delay: -0.81 },
  { left: 44, top: 53, size: 6, delay: -0.33 },
  { left: 59, top: 15, size: 10, delay: -0.56 },
  { left: 73, top: 48, size: 8, delay: -0.41 },
  { left: 88, top: 29, size: 12, delay: -0.65 },
];

export function ChristmasSleigh() {
  return (
    <div className="christmas-flight" aria-hidden="true">
      <div className="christmas-flight-path">
        <div className="christmas-flight-team">
          <div className="christmas-flight-trail">
            {trailFlakes.map(({ left, top, size, delay }) => (
              <Snowflake
                key={left}
                size={size}
                strokeWidth={1.8}
                style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}
              />
            ))}
          </div>
          <svg className="christmas-flight-art" viewBox="34 0 150 38" focusable="false">
            <path d="M80 24q13 3 30-5m13 0q11 3 27-5" fill="none" stroke="#a87237" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M50 29v5m24-5v5m-29 1h36c6 0 10-3 10-8" fill="none" stroke="#ac7535" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M39 13h7l6 10h22l6-5h8c0 7-4 12-11 12H53c-7 0-10-5-14-17Z" fill="#ab2b46" />
            <path d="M40 14h6l6 9h21l7-5h7" fill="none" stroke="#e7b860" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <FlightReindeer x={94} y={6} />
            <FlightReindeer x={138} y={2} lead />
          </svg>
        </div>
      </div>
    </div>
  );
}

const wreathSprigs = Array.from({ length: 12 }, (_, index) => index * 30);
const wreathLights = [
  { angle: 0, color: "#ffd581" },
  { angle: 39, color: "#ff8492" },
  { angle: 77, color: "#a6e5ff" },
  { angle: 120, color: "#ffd581" },
  { angle: 151, color: "#b3f3c5" },
  { angle: 210, color: "#ffd581" },
  { angle: 250, color: "#ff8492" },
  { angle: 291, color: "#a6e5ff" },
  { angle: 329, color: "#b3f3c5" },
];

export function ChristmasWreath() {
  return (
    <svg className="christmas-wreath" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <circle cx="28" cy="28" r="21" fill="none" stroke="#215141" strokeWidth="5" />
      {wreathSprigs.map((angle, index) => (
        <g key={angle} transform={`rotate(${angle} 28 28)`}>
          <path d="M34 7c-4.9 4.3-9.9 3.6-13.3 1.4 2.5-.5 4.2-1.2 5.2-1.9-2-.4-3.4-1.7-4.4-3.5 3.3-.1 5.2.9 6.6 2.1.2-1.7 1.3-3 3.4-3.9.3 1.5.1 3-.7 4.1 1.7-.3 3.3 0 4.6.8L34 7Z" fill={index % 2 === 0 ? "#307c58" : "#4b8f62"} />
          <path d="M24 8c3.2.2 5.9-.4 8.7-1.7" fill="none" stroke="#a1c082" strokeWidth=".7" strokeLinecap="round" />
        </g>
      ))}
      <path d="M27 49c-4-4-8-4-8-.5 0 3.3 3.7 4.1 8 1.9m2-1.4c4-4 8-4 8-.5 0 3.3-3.7 4.1-8 1.9m-2-.3-4 4 3-.5 1.7 1.6.7-5m.3-.1 4.3 4-2.9-.5-1.5 1.6-1-5" fill="#ad2f48" />
      <circle cx="28" cy="49.8" r="2" fill="#da5460" />
      <g fill="#b9324a">
        <circle cx="16" cy="7" r="2.1" /><circle cx="12.5" cy="9" r="1.7" />
        <circle cx="48" cy="16" r="2.1" /><circle cx="50" cy="19.5" r="1.6" />
        <circle cx="8.5" cy="37" r="2.1" /><circle cx="10.5" cy="40" r="1.6" />
      </g>
      {wreathLights.map(({ angle, color }, index) => (
        <g key={angle} transform={`rotate(${angle} 28 28)`} color={color}>
          <circle cx="28" cy="6" r="1.5" fill="currentColor" opacity=".38" />
          <g className="christmas-wreath-light" style={{ "--bulb-order": index } as CSSProperties}>
            <circle cx="28" cy="6" r="2" fill="currentColor" />
            <circle cx="27.6" cy="5.5" r=".75" fill="#fffaf0" />
          </g>
        </g>
      ))}
    </svg>
  );
}

export function ChristmasAvatarHat() {
  return (
    <svg className="christmas-avatar-hat" viewBox="0 0 36 27" aria-hidden="true" focusable="false">
      <path d="M3 19C5 12 10 4 17 3c5-1 10 2 12 6l3 5-5 3c-1-3-3-4-5-4l3 6c-7-2-14-2-22 0Z" fill="#b32946" />
      <path d="M5 17C9 8 15 4 20 5c3 1 5 2 6 5-5-4-11-1-15 7Z" fill="#d6505c" />
      <path d="M2 18c5-2 15-2 24 0a3 3 0 0 1-1.2 5.8c-7.8-1.6-14.1-1.6-21.5 0A3 3 0 0 1 2 18Z" fill="#fffaf2" stroke="#decdbc" strokeWidth="1" />
      <circle cx="30.7" cy="15.6" r="4.2" fill="#fffaf2" stroke="#decdbc" strokeWidth="1" />
    </svg>
  );
}

// Stagger the flakes so the snowfall is already spread over the screen on entry.
const snowfall = [
  [5, 8, 16, 2], [15, 12, 14, 9], [92, 9, 17, 6], [27, 10, 19, 12],
  [66, 12, 15, 4], [80, 8, 16, 11], [41, 8, 13, 5], [53, 13, 17, 14],
  [34, 10, 17, 7], [74, 10, 18, 2], [11, 7, 20, 7], [48, 11, 15, 1],
  [87, 12, 20, 15], [21, 8, 15, 4], [59, 8, 12, 2], [97, 10, 13, 10],
];

export function ChristmasHomeSnow() {
  return (
    <div className="christmas-home-snow" aria-hidden="true">
      {snowfall.map(([left, size, duration, elapsed], index) => (
        <span key={left} style={{
          left: `${left}%`,
          animationDuration: `${duration}s`,
          animationDelay: `-${elapsed}s`,
          "--flake-drift": index % 2 === 0 ? "22px" : "-24px",
        } as CSSProperties}>
          <Snowflake size={size} strokeWidth={1.6} />
        </span>
      ))}
    </div>
  );
}

export function ChristmasHeroArt() {
  return (
    <div className="christmas-hero-art" aria-hidden="true">
      <Image
        className="christmas-hero-image"
        src="/themes/christmas-tree.webp"
        alt=""
        width={760}
        height={748}
        unoptimized
      />
    </div>
  );
}
