import ChoiceSelect from "./ChoiceSelect";
export default function RpeSelect({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <ChoiceSelect
      compact
      className="rpe-select"
      label={label}
      value={value ?? ""}
      disabled={disabled}
      onChange={(next) => onChange(next === "" ? undefined : Number(next))}
      options={[
        { value: "", label: "未记录" },
        ...Array.from({ length: 9 }, (_, i) => {
          const rpe = 6 + i / 2;
          return { value: String(rpe), label: String(rpe) };
        }),
      ]}
    />
  );
}
