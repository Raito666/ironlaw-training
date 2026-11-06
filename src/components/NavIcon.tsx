import type { Page } from '../app/navigation';

type Props = {
  name: Exclude<Page, 'workout'> | 'workout';
  size?: number;
  active?: boolean;
  className?: string;
};

/** Custom line icons for the primary rail. Drawn, not decorative: each glyph maps to one page. */
export default function NavIcon({ name, size = 22, active = false, className = '' }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `nav-icon nav-icon-${name}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`.trim(),
    'aria-hidden': true,
    focusable: false,
  };
  if (name === 'today') {
    return (
      <svg {...common}>
        <circle className="nav-draw" cx="12" cy="12" r="6.8" pathLength={1} />
        <path className="nav-draw" d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3" pathLength={1} />
        <circle className="nav-dotfill" cx="12" cy="12" r="1.8" />
      </svg>
    );
  }
  if (name === 'plans') {
    return (
      <svg {...common}>
        <rect className="nav-draw" x="4" y="4.5" width="16" height="15.5" rx="3" pathLength={1} />
        <path className="nav-draw" d="M8 9h8M8 13h5M8 17h3M8 2.6v4M16 2.6v4" pathLength={1} />
      </svg>
    );
  }
  if (name === 'exercises') {
    return (
      <svg {...common}>
        <path className="nav-draw" d="M2.5 12h19M6.5 5.2v13.6M17.5 5.2v13.6M3.4 8.4v7.2M20.6 8.4v7.2" pathLength={1} />
        <path className="nav-draw nav-draw-soft" d="M9.2 9.3h5.6v5.4H9.2Z" pathLength={1} />
      </svg>
    );
  }
  if (name === 'progress') {
    return (
      <svg {...common}>
        <path className="nav-draw" d="M3.2 20h17.6M5 16.2l4.6-4.7 3.9 2.4L19 7" pathLength={1} />
        <path className="nav-draw" d="M15.5 7H19v3.4" pathLength={1} />
        <circle className="nav-dotfill" cx="19" cy="7" r="1.5" />
      </svg>
    );
  }
  if (name === 'settings') {
    return (
      <svg {...common}>
        <circle className="nav-draw" cx="12" cy="8" r="3.2" pathLength={1} />
        <path className="nav-draw" d="M4.8 20c.8-4.2 3.3-6.2 7.2-6.2s6.4 2 7.2 6.2" pathLength={1} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path className="nav-draw" d="M3 12h18M12 3v18" pathLength={1} />
      <circle className="nav-draw" cx="12" cy="12" r="7.2" pathLength={1} />
    </svg>
  );
}
