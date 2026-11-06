import { createContext, useRef, type ReactNode, type RefObject } from "react";

export const InlineChoiceHost =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

/** A shared in-flow slot keeps a choice out of narrow fields and table cells. */
export default function InlineChoiceScope({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  return (
    <InlineChoiceHost value={host}>
      <div className={`inline-choice-scope ${className}`}>
        {children}
        <div ref={host} className="inline-choice-host" />
      </div>
    </InlineChoiceHost>
  );
}

/** The extra row stays empty until opened; a selected set keeps its options nearby. */
export function InlineChoiceRow({
  children,
  columns,
}: {
  children: ReactNode;
  columns: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  return (
    <InlineChoiceHost value={host}>
      {children}
      <tr className="inline-choice-row">
        <td colSpan={columns}>
          <div ref={host} className="inline-choice-host" />
        </td>
      </tr>
    </InlineChoiceHost>
  );
}
