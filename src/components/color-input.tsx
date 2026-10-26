"use client";

import { isHexColor } from "@/lib/branding";

/** Colour picker + hex text box that stay in sync. `value` is always a #rrggbb string. */
export default function ColorInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
}) {
  const valid = isHexColor(value);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={valid ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-14 cursor-pointer rounded-xl border border-neutral-300 bg-white p-1"
      />
      <input
        type="text"
        aria-label={`${label} hex code`}
        value={value}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
        className={`field w-32 font-mono uppercase ${valid ? "" : "!border-red-400"}`}
      />
      {!valid && <span className="text-xs text-red-600">Use 6 digits, e.g. #12284C</span>}
    </div>
  );
}
