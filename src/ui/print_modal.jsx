import { useEffect, useMemo, useRef, useState } from "react";
import { read_excel } from "../lib/excel.js";
import {
  mapped_column_label,
  match_print_fields,
  missing_print_columns,
  Print_Cancelled,
  print_data_urls,
  render_print_rows
} from "../lib/print.js";

function is_excel(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    /sheet|excel|csv/i.test(file.type || "")
  );
}

export function Print_Modal({ open, mode, template, notify, on_close }) {
  const input_ref = useRef(null);
  const cancel_ref = useRef(false);
  const [over, set_over] = useState(false);
  const [file_name, set_file_name] = useState("");
  const [columns, set_columns] = useState([]);
  const [rows, set_rows] = useState([]);
  const [error, set_error] = useState("");
  const [busy, set_busy] = useState(false);
  const [phase, set_phase] = useState("");
  const [done_count, set_done_count] = useState(0);
  const [total_count, set_total_count] = useState(0);
  const [print_urls, set_print_urls] = useState([]);

  const required = useMemo(
    () => (template?.fields || []).map((field) => mapped_column_label(field)),
    [template]
  );
  const matched = useMemo(
    () => match_print_fields(template?.fields || [], columns),
    [columns, template]
  );
  const missing = useMemo(
    () => (columns.length ? missing_print_columns(template?.fields || [], columns) : required),
    [columns, template, required]
  );

  useEffect(() => {
    if (!open) {
      cancel_ref.current = true;
      return;
    }
    cancel_ref.current = false;
    set_over(false);
    set_file_name("");
    set_columns([]);
    set_rows([]);
    set_error("");
    set_busy(false);
    set_phase("");
    set_done_count(0);
    set_total_count(0);
    set_print_urls([]);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function on_key(event) {
      if (event.key !== "Escape") return;
      cancel_ref.current = true;
      if (!busy) on_close();
      else set_phase("cancelling");
    }
    document.addEventListener("keydown", on_key);
    return () => document.removeEventListener("keydown", on_key);
  }, [open, busy, on_close]);

  if (!open || !template) return null;

  const title = mode === "coordinates" ? "Print only coordinates" : "Print certificates";
  const count_label = rows.length ? ` (${rows.length})` : "";
  const confirm_label = mode === "coordinates"
    ? `Continue to print coordinates${count_label}`
    : `Continue to print certificates${count_label}`;
  const percent = total_count ? Math.min(100, Math.round((done_count / total_count) * 100)) : 0;

  function request_cancel() {
    cancel_ref.current = true;
    if (!busy) {
      on_close();
      return;
    }
    set_phase("cancelling");
  }

  async function take_excel(file) {
    if (!file || busy) return;
    if (!is_excel(file)) {
      set_error("Choose an Excel or CSV file.");
      notify?.("error", "Choose an Excel or CSV file.");
      return;
    }
    set_error("");
    set_print_urls([]);
    try {
      const parsed = await read_excel(file);
      set_file_name(parsed.file_name);
      set_columns(parsed.columns);
      set_rows(parsed.rows);
      const absent = missing_print_columns(template.fields || [], parsed.columns);
      if (!parsed.rows.length) {
        set_error("The Excel file has no data rows.");
      } else if (absent.length) {
        set_error(`Missing columns: ${absent.join(", ")}`);
      }
    } catch (err) {
      set_file_name("");
      set_columns([]);
      set_rows([]);
      set_error(err.message || "Excel could not be read.");
      notify?.("error", err.message || "Excel could not be read.");
    }
  }

  function validation_message() {
    if (!template.fields?.length) return "This template has no mapped columns.";
    if (!file_name) return "Upload an Excel file first.";
    if (!rows.length) return "The Excel file has no data rows.";
    if (missing.length) return `Missing columns: ${missing.join(", ")}`;
    if (!template.image_width || !template.image_height) return "This template is missing image size. Re-save it in Designer.";
    if (mode !== "coordinates" && !template.image_url) return "This template has no certificate picture.";
    return "";
  }

  async function prepare_pages() {
    const message = validation_message();
    if (message) {
      set_error(message);
      notify?.("error", message);
      return;
    }
    cancel_ref.current = false;
    set_busy(true);
    set_phase("preparing");
    set_error("");
    set_print_urls([]);
    set_done_count(0);
    set_total_count(rows.length);
    try {
      const fields = match_print_fields(template.fields || [], columns)
        .map(({ _label, ...field }) => field);
      const urls = await render_print_rows(
        { ...template, fields },
        rows,
        {
          coordinates_only: mode === "coordinates",
          should_cancel: () => cancel_ref.current,
          on_progress: (current, total) => {
            set_done_count(current);
            set_total_count(total);
          }
        }
      );
      if (cancel_ref.current) throw new Print_Cancelled();
      set_print_urls(urls);
      set_phase("");
      set_done_count(urls.length);
    } catch (err) {
      if (err instanceof Print_Cancelled || err?.name === "Print_Cancelled" || cancel_ref.current) {
        set_print_urls([]);
        set_phase("");
        set_done_count(0);
        set_total_count(0);
        on_close();
        return;
      }
      set_error(err.message || "Prepare failed.");
      notify?.("error", err.message || "Prepare failed.");
      set_phase("");
    } finally {
      set_busy(false);
    }
  }

  async function run_print() {
    if (!print_urls.length || busy) {
      const message = print_urls.length ? "" : "Prepare pages first, then print.";
      if (message) {
        set_error(message);
        notify?.("error", message);
      }
      return;
    }
    cancel_ref.current = false;
    set_busy(true);
    set_phase("printing");
    set_error("");
    try {
      await print_data_urls(print_urls);
      if (cancel_ref.current) {
        on_close();
        return;
      }
      notify?.("success", mode === "coordinates" ? "Coordinates sent to print." : "Certificates sent to print.");
      on_close();
    } catch (err) {
      if (cancel_ref.current) {
        on_close();
        return;
      }
      set_error(err.message || "Print failed.");
      notify?.("error", err.message || "Print failed.");
      set_phase("");
    } finally {
      set_busy(false);
    }
  }

  return (
    <div className="cert_modal" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="cert_modal_backdrop" aria-label="Close" onClick={request_cancel} />
      <div className="cert_modal_card cert_print_card">
        <h2>{title}</h2>
        <p>
          Upload Excel with these mapped column names as headers. Every row will be printed.
        </p>

        <div className="cert_print_split">
          <aside className="cert_print_vars">
            <strong>Mapped columns</strong>
            <small>{matched.length} column{matched.length === 1 ? "" : "s"} — match Excel headers exactly</small>
            <ul>
              {matched.map((field) => {
                const name = field._label;
                const present = Boolean(columns.length && field.excel_column);
                return (
                  <li key={`${field.field_key}-${name}`} className={columns.length ? (present ? "is_ok" : "is_missing") : ""}>
                    <code>{name}</code>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div
            className={over ? "cert_print_drop is_over" : "cert_print_drop"}
            onDragOver={(event) => { event.preventDefault(); if (!busy) set_over(true); }}
            onDragLeave={() => set_over(false)}
            onDrop={(event) => {
              event.preventDefault();
              set_over(false);
              if (!busy) take_excel(event.dataTransfer.files?.[0]);
            }}>
            {file_name ?
              <>
                <strong title={file_name}>{file_name}</strong>
                <small>{rows.length} row{rows.length === 1 ? "" : "s"} · {columns.length} column{columns.length === 1 ? "" : "s"}</small>
                <button type="button" className="cert_ghost" disabled={busy} onClick={() => input_ref.current?.click()}>
                  Change Excel
                </button>
              </> :
              <>
                <strong>Drop Excel here</strong>
                <small>Or choose .xlsx / .xls / .csv</small>
                <button type="button" className="cert_save" disabled={busy} onClick={() => input_ref.current?.click()}>
                  Choose Excel
                </button>
              </>}
            <input
              ref={input_ref}
              type="file"
              hidden
              accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => {
                take_excel(event.target.files?.[0]);
                event.target.value = "";
              }} />
          </div>
        </div>

        {busy ?
          <div className="cert_print_status" aria-live="polite">
            <div className="cert_print_status_top">
              <strong>
                {phase === "cancelling" ? "Cancelling…" :
                  phase === "printing" ? "Opening print dialog…" :
                    `Processing ${done_count} of ${total_count}`}
              </strong>
              {phase === "preparing" ? <span>{percent}%</span> : null}
            </div>
            <div className="cert_print_bar" aria-hidden="true">
              <i style={{ width: phase === "preparing" || phase === "cancelling" ? `${percent}%` : "100%" }} />
            </div>
          </div> :
          null}

        {error ? <p className="cert_print_error">{error}</p> : null}
        {!error && !busy && !file_name ?
          <p className="cert_print_hint">Upload Excel, then continue.</p> :
          null}

        <div className="cert_modal_actions">
          <button type="button" className="cert_ghost" onClick={request_cancel}>
            {busy ? "Cancel processing" : "Cancel"}
          </button>
          {print_urls.length ?
            <button type="button" className="cert_save" onClick={run_print} disabled={busy}>
              {busy && phase === "printing" ? "Printing…" : `Print ${print_urls.length} page${print_urls.length === 1 ? "" : "s"}`}
            </button> :
            <button type="button" className="cert_save" onClick={prepare_pages} disabled={busy}>
              {busy && phase === "preparing" ? `Processing ${done_count}/${total_count}` : confirm_label}
            </button>}
        </div>
      </div>
    </div>
  );
}
