import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../motion/reduced-motion';

export type DialSegment = {
  id: string;
  label: string;
  done: number;
  total: number;
};

type Props = {
  segments: DialSegment[];
  centerValue: number;
  centerLabel: string;
  centerDetail: string;
};

function useCountUp(value: number) {
  const [display, setDisplay] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const from = current.current;
    const to = Number.isFinite(value) ? value : 0;
    if (prefersReducedMotion() || from === to || typeof requestAnimationFrame !== 'function') {
      current.current = to;
      setDisplay(to);
      return;
    }
    const started = performance.now();
    const duration = 620;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * eased);
      current.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return display;
}

const SIZE = 380;
const CENTER = SIZE / 2;
const RADIUS = 146;
const CIRC = 2 * Math.PI * RADIUS;

export default function TodayDial({ segments, centerValue, centerLabel, centerDetail }: Props) {
  const liveValue = useCountUp(centerValue);
  const count = Math.max(1, Math.min(segments.length, 10));
  const step = 360 / count;
  const gap = Math.min(7, step * 0.24);
  const shown = segments.slice(0, count);

  return (
    <div className="today-dial" data-count={segments.length}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="presentation" focusable="false">
        <g className="today-dial-ticks" aria-hidden="true">
          {Array.from({ length: 72 }, (_, i) => {
            const angle = (i / 72) * Math.PI * 2 - Math.PI / 2;
            const outer = 170;
            const inner = i % 6 === 0 ? 160 : 165;
            return (
              <line
                key={i}
                x1={CENTER + Math.cos(angle) * inner}
                y1={CENTER + Math.sin(angle) * inner}
                x2={CENTER + Math.cos(angle) * outer}
                y2={CENTER + Math.sin(angle) * outer}
                className={i % 6 === 0 ? 'today-tick major' : 'today-tick'}
              />
            );
          })}
        </g>
        <circle className="today-dial-halo" cx={CENTER} cy={CENTER} r="178" />
        <circle className="today-dial-inner" cx={CENTER} cy={CENTER} r="96" />
        <circle className="today-dial-inner today-dial-inner-dashed" cx={CENTER} cy={CENTER} r="86" />
        <circle className="today-dial-core" cx={CENTER} cy={CENTER} r="112" />
        {shown.map((segment, index) => {
          const start = -90 + index * step + gap / 2;
          const sweep = step - gap;
          const length = (CIRC * sweep) / 360;
          const ratio = segment.total > 0 ? Math.max(0, Math.min(1, segment.done / segment.total)) : 0;
          const mid = ((start + sweep / 2) * Math.PI) / 180;
          const labelRadius = 124;
          return (
            <g key={segment.id}>
              <circle
                className="today-dial-track"
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                strokeDasharray={`${length} ${CIRC}`}
                transform={`rotate(${start} ${CENTER} ${CENTER})`}
              />
              <circle
                className="today-dial-progress"
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                strokeDasharray={`${length * ratio} ${CIRC}`}
                transform={`rotate(${start} ${CENTER} ${CENTER})`}
              />
              <text
                className={`today-dial-seg-label${ratio > 0 ? ' is-progress' : ''}`}
                x={CENTER + Math.cos(mid) * labelRadius}
                y={CENTER + Math.sin(mid) * labelRadius}
              >
                {segment.label}
              </text>
            </g>
          );
        })}
        <text className="today-dial-value" x={CENTER} y={CENTER - 6}>
          {liveValue}
        </text>
        <text className="today-dial-caption" x={CENTER} y={CENTER + 30}>
          {centerLabel}
        </text>
        <text className="today-dial-detail" x={CENTER} y={CENTER + 52}>
          {centerDetail}
        </text>
      </svg>
    </div>
  );
}
