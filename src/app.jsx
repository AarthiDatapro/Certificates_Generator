import { useState } from "react";
import { config_error } from "./lib/store.js";
import { History_Screen } from "./ui/history_screen.jsx";
import { Template_Designer } from "./ui/designer_screen.jsx";

export function Certificate_App() {
  const [screen, set_screen] = useState("design");
  const [initial, set_initial] = useState(null);
  const [draft_key, set_draft_key] = useState(1);
  const [revision, set_revision] = useState(0);
  const [toasts, set_toasts] = useState([]);
  const setup = config_error();

  function notify(kind, message) {
    const id = crypto.randomUUID();
    set_toasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => {
      set_toasts((current) => current.filter((item) => item.id !== id));
    }, 4600);
  }

  function open_template(template) {
    set_initial(template);
    set_draft_key((value) => value + 1);
    set_screen("design");
  }

  function start_new() {
    set_initial(null);
    set_draft_key((value) => value + 1);
    set_screen("design");
  }

  return (
    <div className="cert_app">
      {screen === "history" ?
        <header className="cert_nav cert_chrome">
          <div className="cert_brand">
            <span className="cert_seal" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
            </span>
            <span>
              <strong>Certificates</strong>
              <small>Template studio</small>
            </span>
          </div>
          <nav className="cert_switch" aria-label="Sections">
            <span className="cert_switch_thumb" aria-hidden="true" />
            <button type="button" className="is_on" aria-current="page" onClick={() => set_screen("history")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>
              History
            </button>
            <button type="button" onClick={() => set_screen("design")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="M13 7l4 4" /></svg>
              Designer
            </button>
          </nav>
        </header> :
        null}
      {setup ? <div className="cert_banner" role="status"><span className="cert_banner_mark" aria-hidden="true" /><span>{setup}</span></div> : null}
      <div className="cert_main">
        <div className="cert_screen" hidden={screen !== "history"}>
          <History_Screen revision={revision} on_open={open_template} on_create={start_new} notify={notify} />
        </div>
        <div className="cert_screen" hidden={screen !== "design"}>
          <Template_Designer
            key={draft_key}
            initial={initial}
            notify={notify}
            on_history={() => set_screen("history")}
            on_new={start_new}
            on_saved={() => set_revision((value) => value + 1)}
            on_deleted={() => {
              set_revision((value) => value + 1);
              start_new();
            }} />
        </div>
      </div>
      <div className="cert_toast_wrap" aria-live="polite">
        {toasts.map((toast) => <p key={toast.id} className={`cert_toast is_${toast.kind}`}>{toast.message}</p>)}
      </div>
    </div>
  );
}
