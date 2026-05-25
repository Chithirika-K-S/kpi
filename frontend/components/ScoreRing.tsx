// components/ScoreRing.tsx
"use client";
import { useEffect, useRef } from "react";

interface Props {
  score: number;   // 0–100
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}

export default function ScoreRing({ score, size = 96, stroke = 8, color = "#2563eb", label, sublabel }: Props) {
  const circleRef = useRef<SVGCircleElement>(null);
  const r             = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset        = circumference - (score / 100) * circumference;

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.style.strokeDashoffset = `${circumference}`;
    requestAnimationFrame(() => {
      if (circleRef.current) {
        circleRef.current.style.transition = "stroke-dashoffset 1s ease-out";
        circleRef.current.style.strokeDashoffset = `${offset}`;
      }
    });
  }, [score, offset, circumference]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track – light grey on white bg */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#e2e8f0" strokeWidth={stroke}
        />
        {/* Progress arc */}
        <circle
          ref={circleRef}
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-bold text-slate-800" style={{ fontSize: size * 0.22 }}>
          {label ?? `${Math.round(score)}`}
        </span>
        {sublabel && (
          <span className="text-slate-400" style={{ fontSize: size * 0.12 }}>{sublabel}</span>
        )}
      </div>
    </div>
  );
}
