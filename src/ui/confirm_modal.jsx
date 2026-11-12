export function Confirm_Modal({
  open,
  title,
  message,
  confirm_label,
  cancel_label = "Cancel",
  busy,
  busy_label,
  danger = true,
  on_confirm,
  on_cancel
}) {
  if (!open) return null;
  return (
    <div className="cert_modal" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="cert_modal_backdrop" aria-label="Close" onClick={busy ? undefined : on_cancel} />
      <div className="cert_modal_card">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="cert_modal_actions">
          <button type="button" className="cert_ghost" onClick={on_cancel} disabled={busy}>{cancel_label}</button>
          <button
            type="button"
            className={danger ? "cert_danger" : "cert_save"}
            onClick={on_confirm}
            disabled={busy}>
            {busy ? (busy_label || "Working…") : confirm_label}
          </button>
        </div>
      </div>
    </div>
  );
}
