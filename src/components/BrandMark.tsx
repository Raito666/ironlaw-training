type Props = { size?: number; className?: string; title?: string };

/** IRONLAW mark: a loaded barbell reduced to four plates and one lime bar. */
export default function BrandMark({ size = 44, className = '', title }: Props) {
  return (
    <svg
      className={`brand-glyph ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect className="brand-glyph-tile" width="48" height="48" rx="11" />
      <rect className="brand-glyph-bar" x="8.5" y="22.75" width="31" height="2.5" rx="1.25" />
      <g className="brand-glyph-plate">
        <rect x="11.5" y="19" width="3" height="10" rx="1" />
        <rect x="15.75" y="14.75" width="3.5" height="18.5" rx="1.25" />
        <rect x="28.75" y="14.75" width="3.5" height="18.5" rx="1.25" />
        <rect x="33.5" y="19" width="3" height="10" rx="1" />
      </g>
    </svg>
  );
}
