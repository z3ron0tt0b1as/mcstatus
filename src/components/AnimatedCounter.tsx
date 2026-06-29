import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * A number that smoothly tweens whenever its `value` changes — used for live
 * KPI counters. Updates the DOM node imperatively to avoid re-rendering the
 * tree on every animation frame. Honours prefers-reduced-motion.
 */
export function AnimatedCounter({
  value,
  decimals = 0,
  duration = 0.9,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();

  const fmt = (n: number) =>
    prefix +
    n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) +
    suffix;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = fmt(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = fmt(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, duration, prefix, suffix, reduce]);

  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}
