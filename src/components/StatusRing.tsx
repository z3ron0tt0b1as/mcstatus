import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Animated circular progress ring (e.g. uptime %). The arc draws in on mount
 * and re-animates whenever `percent` changes.
 */
export function StatusRing({
  percent,
  size = 76,
  stroke = 7,
  color = "var(--success)",
  glow = true,
  className,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  glow?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="ring-track"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? offset : circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={glow ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}
