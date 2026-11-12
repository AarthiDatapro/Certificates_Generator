import { useState } from "react";

export function Stepper({ label, value, min, max, disabled, on_focus, on_change, plain = false }) {
  const [draft, set_draft] = useState(null);
  const showing = draft === null ? String(value ?? "") : draft;

  function clamp(next_value) {
    if (!Number.isFinite(next_value)) return min;
    return Math.min(max, Math.max(min, next_value));
  }

  function commit(next_value) {
    on_change(clamp(next_value));
  }

  const number_input = (
    <input
      type="number"
      aria-label={label}
      value={showing}
      min={min}
      max={max}
      disabled={disabled}
      onFocus={() => {
        on_focus?.();
        set_draft(String(value ?? ""));
      }}
      onBlur={() => {
        const next_value = draft === "" || draft === "-" || draft === null ? min : Number(draft);
        commit(next_value);
        set_draft(null);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        set_draft(raw);
        if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
        const next_value = Number(raw);
        if (!Number.isFinite(next_value)) return;
        on_change(clamp(next_value));
      }} />
  );

  if (plain) {
    return (
      <label className="cert_step is_plain">
        <span className="cert_step_chip">
          <em>{label}</em>
          {number_input}
        </span>
      </label>
    );
  }

  return (
    <label className="cert_step">
      <span>{label}</span>
      <div>
        <button type="button" aria-label={`${label} down`} disabled={disabled} onClick={() => { on_focus?.(); set_draft(null); commit(Number(value || 0) - 1); }}>−</button>
        {number_input}
        <button type="button" aria-label={`${label} up`} disabled={disabled} onClick={() => { on_focus?.(); set_draft(null); commit(Number(value || 0) + 1); }}>+</button>
      </div>
    </label>
  );
}
