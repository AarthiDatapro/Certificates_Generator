import { useEffect, useRef, useState } from "react";
import { render_certificate } from "../lib/draw.js";
import { read_excel } from "../lib/excel.js";
import {
  ALIGNMENTS,
  FONT_FAMILIES,
  GRID_SPACINGS,
  fresh_field,
  fresh_image_field,
  is_image_field,
  normalize_field,
  text_fields
} from "../lib/fields.js";
import { delete_template, save_template } from "../lib/store.js";
import { Confirm_Modal } from "./confirm_modal.jsx";
import { Stepper } from "./stepper.jsx";

function Align_Icon({ kind }) {
  if (kind === "center") return <svg viewBox="0 0 16 12" aria-hidden="true"><path d="M2 2h12M4 6h8M2 10h12" /></svg>;
  if (kind === "right") return <svg viewBox="0 0 16 12" aria-hidden="true"><path d="M4 2h10M7 6h7M4 10h10" /></svg>;
  if (kind === "justify") return <svg viewBox="0 0 16 12" aria-hidden="true"><path d="M2 2h12M2 6h12M2 10h12" /></svg>;
  return <svg viewBox="0 0 16 12" aria-hidden="true"><path d="M2 2h10M2 6h7M2 10h10" /></svg>;
}

function row_label(row, index) {
  const value = Object.values(row || {}).find((item) => String(item || "").trim());
  return value ? `${index + 1}. ${String(value).slice(0, 42)}` : `Row ${index + 1}`;
}

function is_image(file) {
  return file?.type === "image/png" || file?.type === "image/jpeg" || /\.jpe?g$|\.png$/i.test(file?.name || "");
}

function is_excel(file) {
  return /\.xlsx$|\.xls$|\.csv$/i.test(file?.name || "");
}

function file_to_data_url(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function load_image_size(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = () => reject(new Error("The image could not be read."));
    image.src = src;
  });
}

export function Template_Designer({ initial, notify, on_history, on_new, on_saved, on_deleted }) {
  const [template_id, set_template_id] = useState(initial?.id || "");
  const [template_name, set_template_name] = useState(initial?.template_name || "");
  const [image_path, set_image_path] = useState(initial?.image_path || "");
  const [image_url, set_image_url] = useState(initial?.image_url || "");
  const [local_url, set_local_url] = useState("");
  const [file, set_file] = useState(null);
  const [width, set_width] = useState(Number(initial?.image_width || 0));
  const [height, set_height] = useState(Number(initial?.image_height || 0));
  const [excel_file_name, set_excel_file_name] = useState(initial?.excel_file_name || "");
  const [columns, set_columns] = useState(initial?.excel_columns || []);
  const [rows, set_rows] = useState([]);
  const [preview_row, set_preview_row] = useState(0);
  const [fields, set_fields] = useState(() =>
    (initial?.fields || []).map((field) => ({
      ...field,
      name: String(field.name || field.field_key || "variable").trim() || "variable"
    }))
  );
  const [active_key, set_active_key] = useState(initial?.fields?.[0]?.field_key || "");
  const [zoom, set_zoom] = useState(1);
  const [zoom_draft, set_zoom_draft] = useState(null);
  const [show_grid, set_show_grid] = useState(true);
  const [grid_spacing, set_grid_spacing] = useState(20);
  const [advanced, set_advanced] = useState(false);
  const [job, set_job] = useState("");
  const busy = Boolean(job);
  const [preview_url, set_preview_url] = useState("");
  const [confirm_delete, set_confirm_delete] = useState(false);
  const [confirm_new, set_confirm_new] = useState(false);
  const [excel_over, set_excel_over] = useState(false);
  const [image_over, set_image_over] = useState(false);
  const [history_tick, set_history_tick] = useState(0);
  const [tool, set_tool] = useState("select");
  const stage_ref = useRef(null);
  const excel_ref = useRef(null);
  const image_ref = useRef(null);
  const stamp_ref = useRef(null);
  const replace_stamp_key_ref = useRef("");
  const local_url_ref = useRef("");
  const fields_ref = useRef([]);
  const past_ref = useRef([]);
  const future_ref = useRef([]);
  const command_ref = useRef({});

  fields_ref.current = fields;
  const picture = local_url || image_url;
  const active = fields.find((field) => field.field_key === active_key) || null;
  const active_is_image = is_image_field(active);
  const variable_fields = text_fields(fields);

  function clamp_zoom(next_value) {
    return Math.min(2, Math.max(0.1, Number(Number(next_value).toFixed(2)) || 1));
  }

  function fit_zoom(stage = stage_ref.current) {
    if (!stage || stage.clientWidth < 40 || stage.clientHeight < 40 || !width || !height) return;
    const pad = 48;
    const next = Math.min((stage.clientWidth - pad) / width, (stage.clientHeight - pad) / height);
    set_zoom_draft(null);
    set_zoom(clamp_zoom(next));
  }

  function remember_local(url) {
    if (local_url_ref.current) URL.revokeObjectURL(local_url_ref.current);
    local_url_ref.current = url;
    set_local_url(url);
  }

  function push_history() {
    past_ref.current = [...past_ref.current, JSON.stringify(fields_ref.current)].slice(-40);
    future_ref.current = [];
    set_history_tick((tick) => tick + 1);
  }

  function undo() {
    const past = past_ref.current;
    if (!past.length) return;
    future_ref.current = [JSON.stringify(fields_ref.current), ...future_ref.current];
    past_ref.current = past.slice(0, -1);
    const restored = JSON.parse(past[past.length - 1]);
    set_fields(restored);
    set_active_key((key) => restored.some((field) => field.field_key === key) ? key : restored[0]?.field_key || "");
    set_history_tick((tick) => tick + 1);
  }

  function redo() {
    const later = future_ref.current;
    if (!later.length) return;
    past_ref.current = [...past_ref.current, JSON.stringify(fields_ref.current)];
    future_ref.current = later.slice(1);
    const restored = JSON.parse(later[0]);
    set_fields(restored);
    set_active_key((key) => restored.some((field) => field.field_key === key) ? key : restored[0]?.field_key || "");
    set_history_tick((tick) => tick + 1);
  }

  function patch_field(field_key, next) {
    set_fields((current) => current.map((field) => field.field_key === field_key ? { ...field, ...next } : field));
  }

  function remove_field(field_key) {
    push_history();
    set_fields((current) => current.filter((field) => field.field_key !== field_key));
    if (active_key === field_key) set_active_key("");
  }

  command_ref.current = { undo, redo, remove_field, active_key, width, height };

  useEffect(() => () => {
    if (local_url_ref.current) URL.revokeObjectURL(local_url_ref.current);
  }, []);

  useEffect(() => {
    if (!picture || !width || !height) return undefined;
    const id = window.requestAnimationFrame(() => fit_zoom());
    return () => window.cancelAnimationFrame(id);
  }, [width, height, picture]);

  useEffect(() => {
    function on_key(event) {
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return;
      const command = command_ref.current;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) command.redo();
        else command.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        command.redo();
        return;
      }
      if (!command.active_key) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!event.repeat) command.remove_field(command.active_key);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const delta = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[event.key];
      if (!delta) return;
      event.preventDefault();
      if (!event.repeat) {
        past_ref.current = [...past_ref.current, JSON.stringify(fields_ref.current)].slice(-40);
        future_ref.current = [];
        set_history_tick((tick) => tick + 1);
      }
      set_fields((current) => current.map((field) => {
        if (field.field_key !== command.active_key) return field;
        return {
          ...field,
          x_position: Math.max(0, Math.min(Math.max(0, command.width - 1), field.x_position + delta[0])),
          y_position: Math.max(0, Math.min(Math.max(0, command.height - 1), field.y_position + delta[1]))
        };
      }));
    }
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, []);

  useEffect(() => {
    if (!preview_url) return undefined;
    function on_key(event) {
      if (event.key === "Escape") set_preview_url("");
    }
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [preview_url]);

  function apply_excel(parsed) {
    const next = fields_ref.current.map((field) => {
      if (is_image_field(field)) return field;
      return !field.excel_column || parsed.columns.includes(field.excel_column) ?
        field :
        { ...field, excel_column: "" };
    });
    set_excel_file_name(parsed.file_name);
    set_columns(parsed.columns);
    set_rows(parsed.rows);
    set_preview_row(0);
    set_fields(next);
    set_active_key((key) => next.some((field) => field.field_key === key) ? key : "");
    if (parsed.renamed) notify("info", "Repeated column names were numbered so each variable stays unique.");
  }

  async function take_excel(next) {
    if (!next) return;
    if (!is_excel(next)) {
      notify("error", "Upload an Excel file (.xlsx, .xls, or .csv).");
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      notify("error", "The Excel file must be 5 MB or smaller.");
      return;
    }
    try {
      apply_excel(await read_excel(next));
    } catch (error) {
      notify("error", error.message || "The Excel file could not be read.");
    }
  }

  function take_image(next) {
    if (!next) return;
    if (!is_image(next)) {
      notify("error", "Use a PNG or JPG certificate.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      notify("error", "The picture must be 10 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(next);
    const image = new Image();
    image.onload = () => {
      const next_width = image.naturalWidth || 0;
      const next_height = image.naturalHeight || 0;
      if (!next_width || !next_height) {
        URL.revokeObjectURL(url);
        notify("error", "That picture could not be read.");
        return;
      }
      set_width(next_width);
      set_height(next_height);
      set_fields((current) => current.map((field) => normalize_field(field, next_width, next_height)));
      set_file(next);
      remember_local(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      notify("error", "That picture could not be read.");
    };
    image.src = url;
  }

  function clear_image(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (local_url_ref.current) URL.revokeObjectURL(local_url_ref.current);
    local_url_ref.current = "";
    set_local_url("");
    set_file(null);
    set_image_url("");
    set_image_path("");
    set_width(0);
    set_height(0);
  }

  function add_variable() {
    if (!width || !height) {
      notify("error", "Upload the certificate picture first.");
      return;
    }
    push_history();
    set_tool("select");
    let n = variable_fields.length + 1;
    while (fields_ref.current.some((field) => field.field_key === `variable_${n}`)) n += 1;
    const next = fresh_field("", width, height, fields_ref.current.length, `variable_${n}`);
    set_fields((current) => [...current, next]);
    set_active_key(next.field_key);
  }

  async function take_stamp(next) {
    if (!next) return;
    if (!width || !height) {
      notify("error", "Upload the certificate picture first.");
      return;
    }
    if (!is_image(next)) {
      notify("error", "Use a PNG or JPG stamp image.");
      return;
    }
    if (next.size > 2 * 1024 * 1024) {
      notify("error", "The stamp image must be 2 MB or smaller.");
      return;
    }
    const replace_key = replace_stamp_key_ref.current;
    replace_stamp_key_ref.current = "";
    try {
      const data_url = await file_to_data_url(next);
      const size = await load_image_size(data_url);
      if (!size.width || !size.height) {
        notify("error", "That image could not be read.");
        return;
      }
      push_history();
      set_tool("select");
      const existing = replace_key ? fields_ref.current.find((field) => field.field_key === replace_key && is_image_field(field)) : null;
      if (existing) {
        patch_field(existing.field_key, { image_data: data_url });
        set_active_key(existing.field_key);
        return;
      }
      let n = fields_ref.current.filter((field) => is_image_field(field)).length + 1;
      while (fields_ref.current.some((field) => field.field_key === `image_${n}`)) n += 1;
      const overlay = fresh_image_field(data_url, size.width, size.height, width, height, fields_ref.current.length, `image_${n}`);
      const stem = String(next.name || "").replace(/\.[^.]+$/, "").trim();
      if (stem) overlay.name = stem.slice(0, 48);
      set_fields((current) => [...current, overlay]);
      set_active_key(overlay.field_key);
    } catch (error) {
      notify("error", error.message || "The image could not be read.");
    }
  }

  function request_stamp(replace_key = "") {
    if (!width || !height) {
      notify("error", "Upload the certificate picture first.");
      return;
    }
    replace_stamp_key_ref.current = String(replace_key || "");
    set_tool("image");
    stamp_ref.current?.click();
  }

  function map_column(field, excel_column) {
    if (is_image_field(field)) return;
    const mapped = String(excel_column || "").trim();
    if (field.excel_column === mapped) return;
    if (mapped && fields_ref.current.some((item) => !is_image_field(item) && item.field_key !== field.field_key && item.excel_column === mapped)) {
      notify("error", `${mapped} is already mapped to another variable.`);
      return;
    }
    push_history();
    patch_field(field.field_key, { excel_column: mapped });
  }

  function rename_variable(field, next_name) {
    const name = String(next_name || "").trim() || field.field_key;
    if (name === (field.name || field.field_key)) return;
    patch_field(field.field_key, { name });
  }

  function on_drag_start(event, field) {
    if (event.button !== 0) return;
    if (event.target.closest(".cert_box_remove, .cert_resize")) return;
    event.preventDefault();
    event.stopPropagation();
    push_history();
    set_active_key(field.field_key);
    const el = event.currentTarget;
    const scale = zoom;
    const max_x = Math.max(0, width - field.box_width);
    const max_y = Math.max(0, height - field.box_height);
    let next_x = field.x_position;
    let next_y = field.y_position;
    el.classList.add("is_dragging");
    try { el.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
    const drag = {
      x: event.clientX,
      y: event.clientY,
      origin_x: field.x_position,
      origin_y: field.y_position
    };
    let frame = 0;
    function paint() {
      frame = 0;
      el.style.left = `${next_x * scale}px`;
      el.style.top = `${next_y * scale}px`;
    }
    function on_move(move_event) {
      next_x = Math.max(0, Math.min(max_x, drag.origin_x + (move_event.clientX - drag.x) / scale));
      next_y = Math.max(0, Math.min(max_y, drag.origin_y + (move_event.clientY - drag.y) / scale));
      if (!frame) frame = requestAnimationFrame(paint);
    }
    function on_up() {
      if (frame) cancelAnimationFrame(frame);
      paint();
      el.classList.remove("is_dragging");
      el.style.pointerEvents = "";
      window.removeEventListener("pointermove", on_move);
      window.removeEventListener("pointerup", on_up);
      patch_field(field.field_key, {
        x_position: Math.round(next_x),
        y_position: Math.round(next_y)
      });
    }
    window.addEventListener("pointermove", on_move);
    window.addEventListener("pointerup", on_up);
  }

  function on_resize_start(event, field) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    push_history();
    set_active_key(field.field_key);
    const el = event.currentTarget.closest(".cert_box");
    const scale = zoom;
    let next_w = field.box_width;
    let next_h = field.box_height;
    el?.classList.add("is_dragging");
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
    const drag = {
      x: event.clientX,
      y: event.clientY,
      origin_w: field.box_width,
      origin_h: field.box_height
    };
    let frame = 0;
    function paint() {
      frame = 0;
      if (!el) return;
      el.style.width = `${next_w * scale}px`;
      el.style.height = `${next_h * scale}px`;
    }
    const max_h = is_image_field(field) ? 4000 : 800;
    const min_w = is_image_field(field) ? 24 : 40;
    function on_move(move_event) {
      next_w = Math.max(min_w, Math.min(4000, drag.origin_w + (move_event.clientX - drag.x) / scale));
      next_h = Math.max(24, Math.min(max_h, drag.origin_h + (move_event.clientY - drag.y) / scale));
      if (!frame) frame = requestAnimationFrame(paint);
    }
    function on_up() {
      if (frame) cancelAnimationFrame(frame);
      paint();
      el?.classList.remove("is_dragging");
      window.removeEventListener("pointermove", on_move);
      window.removeEventListener("pointerup", on_up);
      patch_field(field.field_key, {
        box_width: Math.round(next_w),
        box_height: Math.round(next_h)
      });
    }
    window.addEventListener("pointermove", on_move);
    window.addEventListener("pointerup", on_up);
  }

  async function save() {
    const name = template_name.trim();
    if (!name) {
      notify("error", "Template name is required.");
      return;
    }
    if (!file && !picture) {
      notify("error", "Upload a PNG or JPG certificate.");
      return;
    }
    if (!width || !height) {
      notify("error", "The certificate picture has no size yet.");
      return;
    }
    if (!variable_fields.length) {
      notify("error", "Add at least one variable on the certificate.");
      return;
    }
    const unmapped = variable_fields.find((field) => !field.excel_column);
    if (unmapped) {
      notify("error", "Map every variable to an Excel column.");
      return;
    }
    if (columns.length) {
      const missing = variable_fields.find((field) => !columns.includes(field.excel_column));
      if (missing) {
        notify("error", `${missing.excel_column} is not a column in this Excel file.`);
        return;
      }
    }
    const broken_image = fields.find((field) => is_image_field(field) && !String(field.image_data || "").trim());
    if (broken_image) {
      notify("error", "One of the placed images is missing. Remove it or add the image again.");
      return;
    }
    set_job("save");
    try {
      const saved = await save_template({
        id: template_id,
        template_name: name,
        image_file: file,
        image_path,
        image_data: image_url.startsWith("data:") ? image_url : "",
        image_width: width,
        image_height: height,
        fields: fields.map((field) => normalize_field(field, width, height))
      });
      set_template_id(saved.id);
      set_template_name(saved.template_name);
      set_image_path(saved.image_path);
      set_image_url(saved.image_url);
      set_width(saved.image_width || width);
      set_height(saved.image_height || height);
      set_fields(saved.fields);
      set_file(null);
      remember_local("");
      notify("success", "Template saved.");
      on_saved?.(saved);
    } catch (error) {
      notify("error", error.message || "Save failed.");
    } finally {
      set_job("");
    }
  }

  async function preview() {
    if (!picture) {
      notify("error", "Upload the certificate picture first.");
      return;
    }
    if (!fields.length) {
      notify("error", "Place at least one variable or image on the certificate.");
      return;
    }
    set_job("preview");
    try {
      const url = await render_certificate(picture, width, height, fields, rows[preview_row] || {});
      set_preview_url(url);
    } catch (error) {
      notify("error", error.message || "Preview failed.");
    } finally {
      set_job("");
    }
  }

  async function remove_saved() {
    if (!template_id) {
      set_confirm_delete(false);
      on_deleted?.();
      return;
    }
    set_job("delete");
    try {
      await delete_template({ id: template_id, image_path });
      notify("success", "Template deleted.");
      set_confirm_delete(false);
      on_deleted?.();
    } catch (error) {
      notify("error", error.message || "Delete failed.");
    } finally {
      set_job("");
    }
  }

  function download_preview() {
    const stem = String(template_name.trim() || "certificate").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "certificate";
    const link = document.createElement("a");
    link.href = preview_url;
    link.download = rows.length ? `${stem}-row-${preview_row + 1}.png` : `${stem}.png`;
    link.click();
  }

  const can_undo = history_tick >= 0 && past_ref.current.length > 0;
  const can_redo = future_ref.current.length > 0;
  const in_progress = Boolean(
    template_id ||
    template_name.trim() ||
    columns.length ||
    picture ||
    fields.length ||
    excel_file_name ||
    file
  );

  function request_new() {
    if (busy) return;
    if (in_progress) {
      set_confirm_new(true);
      return;
    }
    on_new?.();
  }

  function confirm_start_new() {
    set_confirm_new(false);
    on_new?.();
  }

  return (
    <section className="cert_designer">
      <header className="cert_studio cert_chrome">
        <div className="cert_studio_left">
          <div className="cert_brand">
            <span className="cert_seal" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
            </span>
            <span>
              <strong>Certificates</strong>
              <small>Template studio</small>
            </span>
          </div>
          <i className="cert_studio_rule" aria-hidden="true" />
          <nav className="cert_switch" aria-label="Sections">
            <span className="cert_switch_thumb is_design" aria-hidden="true" />
            <button type="button" onClick={on_history}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>
              History
            </button>
            <button type="button" className="is_on" aria-current="page">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="M13 7l4 4" /></svg>
              Designer
            </button>
          </nav>
        </div>
        <div className="cert_studio_mid">
          <label className="cert_name cert_name_shell">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h7l4 4v12H7V4Z" /><path d="M14 4v4h4M9 12h6M9 16h4" /></svg>
            <input
              value={template_name}
              disabled={busy}
              placeholder="Template name"
              aria-label="Template name"
              onChange={(event) => set_template_name(event.target.value)} />
          </label>
        </div>
        <div className="cert_bar_actions">
          <button type="button" className="cert_ghost" disabled={busy} onClick={request_new}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            New
          </button>
          {template_id ?
            <button type="button" className="cert_danger" disabled={busy} onClick={() => set_confirm_delete(true)}>Delete</button> :
            null}
          <button type="button" className="cert_ghost" disabled={busy || !picture} onClick={preview}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>
            Preview
          </button>
          <button type="button" className="cert_save" disabled={busy} onClick={save}>
            {job === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {!columns.length && !fields.length && !picture ?
        <div
          className={excel_over ? "cert_gate is_over" : "cert_gate"}
          onDragOver={(event) => { event.preventDefault(); set_excel_over(true); }}
          onDragLeave={() => set_excel_over(false)}
          onDrop={(event) => { event.preventDefault(); set_excel_over(false); take_excel(event.dataTransfer.files?.[0]); }}>
          <div className="cert_gate_panel">
            <div className="cert_gate_copy">
              <div>
                <h2>Start with the spreadsheet</h2>
                <p>Excel stays on this device only and is never saved to Supabase. Use it to map columns, then print later.</p>
              </div>
              <ol>
                <li>Upload Excel</li>
                <li>Add picture</li>
                <li>Add variables & stamps</li>
              </ol>
            </div>
            <div className="cert_gate_card">
              <span className="cert_gate_mark" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5V3Z" /><path d="M15 3v4h4M8 11h8M8 15h8" /></svg>
              </span>
              <h2>Drop an Excel file</h2>
              <p>.xlsx, .xls, and .csv all work</p>
              <button type="button" className="cert_save" onClick={() => excel_ref.current?.click()}>Choose Excel</button>
            </div>
          </div>
          <input
            ref={excel_ref}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(event) => {
              take_excel(event.target.files?.[0]);
              event.target.value = "";
            }} />
        </div> :
        <div className="cert_work">
          <aside className="cert_side">
            <section className="cert_card">
              <header className="cert_section_head">
                <span>1</span>
                <h2>Excel columns</h2>
              </header>
              <div className="cert_section_body">
                <div className="cert_excel_chip">
                  <span className="cert_excel_mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M8 3.5h6.5L18.5 8v12.5H8z" />
                      <path d="M14.5 3.5V8h4.5" />
                      <path d="M10.5 12.5h5M10.5 15.5h5M10.5 18.5h3.5" />
                    </svg>
                  </span>
                  <span className="cert_excel_copy">
                    <strong title={excel_file_name || "Excel file"}>{excel_file_name || "Excel file"}</strong>
                    <small>
                      <em>{columns.length} cols</em>
                      {rows.length ? <em>{rows.length.toLocaleString()} rows</em> : null}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="cert_excel_swap"
                    aria-label="Replace Excel"
                    title="Replace Excel"
                    onClick={() => excel_ref.current?.click()}>
                    <svg viewBox="0 0 24 24">
                      <path d="M16.5 8.5H8.2a3.2 3.2 0 0 0 0 6.4h.3" />
                      <path d="M16.5 8.5 14 6M16.5 8.5 14 11" />
                      <path d="M7.5 15.5h8.3a3.2 3.2 0 0 0 0-6.4h-.3" />
                      <path d="M7.5 15.5 10 18M7.5 15.5 10 13" />
                    </svg>
                  </button>
                </div>
                <input
                  ref={excel_ref}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  hidden
                  onChange={(event) => {
                    take_excel(event.target.files?.[0]);
                    event.target.value = "";
                  }} />
              </div>
            </section>

            <section className="cert_card">
              <header className="cert_section_head">
                <span>2</span>
                <h2>Certificate picture</h2>
              </header>
              <div className="cert_section_body">
                <div
                  className={picture ? "cert_thumb has_image" : image_over ? "cert_thumb is_empty is_over" : "cert_thumb is_empty"}
                  onDragOver={(event) => { event.preventDefault(); set_image_over(true); }}
                  onDragLeave={() => set_image_over(false)}
                  onDrop={(event) => { event.preventDefault(); set_image_over(false); take_image(event.dataTransfer.files?.[0]); }}
                  onClick={() => image_ref.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      image_ref.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}>
                  {picture ?
                    <>
                      <img src={picture} alt="" />
                      <span className="cert_thumb_veil" aria-hidden="true" />
                      <button
                        type="button"
                        className="cert_thumb_delete"
                        aria-label="Remove picture"
                        title="Remove picture"
                        onClick={clear_image}
                        onKeyDown={(event) => event.stopPropagation()}>
                        <svg viewBox="0 0 24 24">
                          <path d="M5 7h14" />
                          <path d="M9 7V5h6v2" />
                          <path d="M8 7l1 13h6l1-13" />
                        </svg>
                      </button>
                    </> :
                    <span>Drop a PNG or JPG, or click to upload.</span>}
                </div>
                <input
                  ref={image_ref}
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(event) => {
                    take_image(event.target.files?.[0]);
                    event.target.value = "";
                  }} />
              </div>
            </section>

            <section className="cert_card cert_vars">
              <header className="cert_section_head">
                <span>3</span>
                <h2>Variables & images</h2>
              </header>
              <div className="cert_section_body">
                <div className="cert_var_list">
                  {fields.map((field) =>
                    <div key={field.field_key} className={field.field_key === active_key ? "cert_var is_on" : "cert_var"}>
                      <button type="button" onClick={() => { set_tool("select"); set_active_key(field.field_key); }}>
                        <i>{is_image_field(field) ? "▣" : field.excel_column ? "✓" : "T"}</i>
                        <span>
                          <b>{field.name || field.field_key}</b>
                          <small>{is_image_field(field) ? "Image · placed on canvas" : field.excel_column || "Select a mapped column"}</small>
                        </span>
                      </button>
                      <button type="button" className="cert_var_x" aria-label={`Remove ${field.name || field.field_key}`} onClick={() => remove_field(field.field_key)}>×</button>
                    </div>
                  )}
                </div>
                <div className="cert_var_actions">
                  <button type="button" className="cert_ghost cert_full" onClick={add_variable}>+ Add variable</button>
                  <button type="button" className="cert_ghost cert_full" onClick={() => request_stamp()}>+ Add image</button>
                </div>
              </div>
            </section>
          </aside>

          <main className="cert_stage_wrap">
            <div className="cert_tools">
              <span className="cert_tools_label">Canvas</span>
              <button type="button" className={tool === "select" ? "is_on" : undefined} aria-label="Select" title="Select" onClick={() => set_tool("select")}>
                <svg viewBox="0 0 24 24"><path d="M5 3l6.5 17 2-6.5L20 11.5 5 3Z" /></svg>
              </button>
              <button type="button" className={tool === "text" ? "is_on" : undefined} aria-label="Add variable" title="Add variable" onClick={add_variable}>
                <span className="cert_tool_letter" aria-hidden="true">T</span>
              </button>
              <button type="button" className={tool === "image" ? "is_on" : undefined} aria-label="Add image" title="Add image / stamp" onClick={() => request_stamp()}>
                <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9.5" cy="10.5" r="1.6" /><path d="M7 16l3.2-3.2a1.2 1.2 0 0 1 1.6 0L15 16l1.4-1.4a1.2 1.2 0 0 1 1.6 0L20 16" /></svg>
              </button>
              <button type="button" className={show_grid ? "is_on" : undefined} aria-label="Grid" title="Grid" onClick={() => set_show_grid((value) => !value)}>
                <svg viewBox="0 0 24 24"><path d="M5 5h14v14H5zM12 5v14M5 12h14" /></svg>
              </button>
              <input
                ref={stamp_ref}
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={(event) => {
                  take_stamp(event.target.files?.[0]);
                  event.target.value = "";
                  set_tool("select");
                }} />
              <div className="cert_tools_end">
                <button type="button" aria-label="Undo" disabled={!can_undo} onClick={undo}>
                  <svg viewBox="0 0 24 24"><path d="M8 8H4V4" /><path d="M4 8a8 8 0 1 1 2 6" /></svg>
                </button>
                <button type="button" aria-label="Redo" disabled={!can_redo} onClick={redo}>
                  <svg viewBox="0 0 24 24"><path d="M16 8h4V4" /><path d="M20 8a8 8 0 1 0-2 6" /></svg>
                </button>
                <i className="cert_split" />
                <button type="button" aria-label="Zoom out" disabled={zoom <= 0.1} onClick={() => { set_zoom_draft(null); set_zoom((value) => clamp_zoom(value - 0.1)); }}>−</button>
                <label className="cert_zoom">
                  <input
                    type="number"
                    aria-label="Zoom"
                    min={10}
                    max={200}
                    value={zoom_draft === null ? Math.round(zoom * 100) : zoom_draft}
                    onFocus={() => set_zoom_draft(String(Math.round(zoom * 100)))}
                    onBlur={() => {
                      const percent = zoom_draft === "" || zoom_draft === null ? zoom * 100 : Number(zoom_draft);
                      set_zoom(clamp_zoom((Number.isFinite(percent) ? percent : zoom * 100) / 100));
                      set_zoom_draft(null);
                    }}
                    onChange={(event) => {
                      const raw = event.target.value;
                      set_zoom_draft(raw);
                      const percent = Number(raw);
                      if (raw !== "" && Number.isFinite(percent)) set_zoom(clamp_zoom(percent / 100));
                    }} />
                  <span>%</span>
                </label>
                <button type="button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => { set_zoom_draft(null); set_zoom((value) => clamp_zoom(value + 0.1)); }}>+</button>
                <button type="button" aria-label="Fit" onClick={() => fit_zoom()}>
                  <svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>
                </button>
              </div>
            </div>
            <div className="cert_stage" ref={stage_ref}>
              {!picture ? <p className="cert_empty">Upload the certificate picture, then place each Excel column on it.</p> : null}
              {picture ?
                <div className="cert_board" style={{ width: Math.max(1, width) * zoom, height: Math.max(1, height) * zoom }}>
                  <img src={picture} alt={template_name || "Certificate"} draggable="false" />
                  {show_grid ?
                    <span className="cert_grid" style={{ backgroundSize: `${grid_spacing * zoom}px ${grid_spacing * zoom}px` }} /> :
                    null}
                  {fields.map((field) => {
                    const image_box = is_image_field(field);
                    return (
                      <div
                        key={field.field_key}
                        className={[
                          "cert_box",
                          image_box ? "is_image" : "",
                          field.field_key === active_key ? "is_on" : ""
                        ].filter(Boolean).join(" ")}
                        style={image_box ? {
                          left: field.x_position * zoom,
                          top: field.y_position * zoom,
                          width: field.box_width * zoom,
                          height: field.box_height * zoom
                        } : {
                          left: field.x_position * zoom,
                          top: field.y_position * zoom,
                          width: field.box_width * zoom,
                          height: field.box_height * zoom,
                          color: field.font_color,
                          fontFamily: field.font_family,
                          fontSize: field.font_size * zoom,
                          fontWeight: field.bold ? 700 : 400,
                          fontStyle: field.italic ? "italic" : "normal",
                          textDecoration: field.underline ? "underline" : "none",
                          letterSpacing: `${field.letter_spacing * zoom}px`
                        }}
                        onPointerDown={(event) => { set_tool("select"); on_drag_start(event, field); }}>
                        {image_box ?
                          <img className="cert_box_image" src={field.image_data} alt={field.name || "Stamp"} draggable="false" /> :
                          <span className={`cert_box_label is_${field.text_alignment}`}>{`{${field.name || field.excel_column || field.field_key}}`}</span>}
                        {field.field_key === active_key ?
                          <>
                            <button
                              type="button"
                              className="cert_box_remove"
                              aria-label={`Remove ${field.name || field.field_key}`}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => remove_field(field.field_key)}>
                              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                            </button>
                            <span className="cert_resize" onPointerDown={(event) => on_resize_start(event, field)} />
                          </> :
                          null}
                      </div>
                    );
                  })}
                </div> :
                null}
            </div>
            <footer className="cert_foot">
              <span>Canvas: {width || "—"} × {height || "—"} px. Arrows move the selection. Delete removes it. Use the image tool for stamps.</span>
              <div className="cert_foot_end">
                <label>
                  <input type="checkbox" checked={show_grid} onChange={(event) => set_show_grid(event.target.checked)} />
                  Grid
                </label>
                <label>
                  Spacing
                  <select value={grid_spacing} onChange={(event) => set_grid_spacing(Number(event.target.value))}>
                    {GRID_SPACINGS.map((spacing) => <option key={spacing} value={spacing}>{spacing} px</option>)}
                  </select>
                </label>
              </div>
            </footer>
          </main>

          <aside className="cert_props">
            <div className="cert_prop_body">
              {!active ?
                <div className="cert_prop_empty">
                  <strong>{fields.length ? "Select an item" : "Nothing placed yet"}</strong>
                  <p>{fields.length ? "Click a variable, image, or box to edit it." : "Add a variable or stamp image, then place it on the certificate."}</p>
                </div> :
                active_is_image ?
                  <>
                    <section className="cert_prop_block">
                      <header className="cert_section_head">
                        <span>1</span>
                        <h3>Image</h3>
                      </header>
                      <div className="cert_section_body">
                        <label className="cert_field">
                          <input
                            value={active.name || ""}
                            onFocus={push_history}
                            onChange={(event) => patch_field(active.field_key, { name: event.target.value })}
                            onBlur={(event) => rename_variable(active, event.target.value)}
                            placeholder="Name"
                            aria-label="Name" />
                        </label>
                        {active.image_data ?
                          <div className="cert_stamp_preview">
                            <img src={active.image_data} alt="" />
                          </div> :
                          null}
                        <button type="button" className="cert_ghost cert_full" onClick={() => request_stamp(active.field_key)}>Replace image</button>
                        <p className="cert_hint">Saved with X/Y and size. Printed on every certificate at these coordinates.</p>
                      </div>
                    </section>
                    <section className="cert_prop_block">
                      <header className="cert_section_head">
                        <span>2</span>
                        <h3>Position and size</h3>
                      </header>
                      <div className="cert_section_body">
                        <div className="cert_grid2">
                          <Stepper plain label="X" value={active.x_position} min={0} max={Math.max(0, width - 1)} on_focus={push_history} on_change={(x_position) => patch_field(active.field_key, { x_position })} />
                          <Stepper plain label="Y" value={active.y_position} min={0} max={Math.max(0, height - 1)} on_focus={push_history} on_change={(y_position) => patch_field(active.field_key, { y_position })} />
                          <Stepper plain label="W" value={active.box_width} min={24} max={4000} on_focus={push_history} on_change={(box_width) => patch_field(active.field_key, { box_width })} />
                          <Stepper plain label="H" value={active.box_height} min={24} max={4000} on_focus={push_history} on_change={(box_height) => patch_field(active.field_key, { box_height })} />
                        </div>
                      </div>
                    </section>
                  </> :
                  <>
                    <section className="cert_prop_block">
                      <header className="cert_section_head">
                        <span>1</span>
                        <h3>Variable</h3>
                      </header>
                      <div className="cert_section_body">
                        <label className="cert_field">
                          <input
                            value={active.name || ""}
                            onFocus={push_history}
                            onChange={(event) => patch_field(active.field_key, { name: event.target.value })}
                            onBlur={(event) => rename_variable(active, event.target.value)}
                            placeholder="Name"
                            aria-label="Name" />
                        </label>
                        <label className="cert_field">
                          <select
                            value={active.excel_column}
                            onChange={(event) => map_column(active, event.target.value)}
                            aria-label="Mapped column">
                            <option value="">Mapped column</option>
                            {active.excel_column && !columns.includes(active.excel_column) ?
                              <option value={active.excel_column}>{active.excel_column}</option> :
                              null}
                            {columns.map((column) => <option key={column} value={column}>{column}</option>)}
                          </select>
                        </label>
                      </div>
                    </section>
                    <section className="cert_prop_block">
                      <header className="cert_section_head">
                        <span>2</span>
                        <h3>Text style</h3>
                      </header>
                      <div className="cert_section_body cert_text_style">
                        <Stepper label="Font size" value={active.font_size} min={8} max={200} on_focus={push_history} on_change={(font_size) => patch_field(active.field_key, { font_size })} />
                        <div className="cert_style_row" role="group" aria-label="Text style">
                          {[["bold", "Bold", "B"], ["italic", "Italic", "I"], ["underline", "Underline", "U"]].map(([key, label, mark]) =>
                            <button
                              key={key}
                              type="button"
                              className={active[key] ? "is_on" : undefined}
                              aria-label={label}
                              onClick={() => { push_history(); patch_field(active.field_key, { [key]: !active[key] }); }}>
                              {mark}
                            </button>
                          )}
                        </div>
                      </div>
                    </section>
                    <section className="cert_prop_block">
                      <header className="cert_section_head">
                        <span>3</span>
                        <h3>Position and size</h3>
                      </header>
                      <div className="cert_section_body">
                        <div className="cert_grid2">
                          <Stepper plain label="X" value={active.x_position} min={0} max={Math.max(0, width - 1)} on_focus={push_history} on_change={(x_position) => patch_field(active.field_key, { x_position })} />
                          <Stepper plain label="Y" value={active.y_position} min={0} max={Math.max(0, height - 1)} on_focus={push_history} on_change={(y_position) => patch_field(active.field_key, { y_position })} />
                          <Stepper plain label="W" value={active.box_width} min={40} max={4000} on_focus={push_history} on_change={(box_width) => patch_field(active.field_key, { box_width })} />
                          <Stepper plain label="H" value={active.box_height} min={24} max={800} on_focus={push_history} on_change={(box_height) => patch_field(active.field_key, { box_height })} />
                        </div>
                      </div>
                    </section>
                    <section className="cert_prop_block">
                      <button type="button" className="cert_advanced cert_section_head" aria-expanded={advanced} onClick={() => set_advanced((open) => !open)}>
                        <span>4</span>
                        <h3>Advanced</h3>
                        <i>{advanced ? "▴" : "▾"}</i>
                      </button>
                      {advanced ?
                        <div className="cert_section_body">
                          <label className="cert_field">
                            <span>Font</span>
                            <select value={active.font_family} onFocus={push_history} onChange={(event) => patch_field(active.field_key, { font_family: event.target.value })}>
                              {FONT_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
                            </select>
                          </label>
                          <label className="cert_color">
                            <span className="cert_label">Color</span>
                            <span className="cert_color_row">
                              <span className="cert_color_swatch" style={{ background: /^#[0-9a-fA-F]{6}$/.test(active.font_color) ? active.font_color : "#0D1B3F" }}>
                                <input
                                  type="color"
                                  value={/^#[0-9a-fA-F]{6}$/.test(active.font_color) ? active.font_color : "#0D1B3F"}
                                  onFocus={push_history}
                                  onChange={(event) => patch_field(active.field_key, { font_color: event.target.value })}
                                  aria-label="Pick color" />
                              </span>
                              <input
                                type="text"
                                value={active.font_color}
                                onFocus={push_history}
                                onChange={(event) => patch_field(active.field_key, { font_color: event.target.value })}
                                placeholder="#0D1B3F"
                                spellCheck={false}
                                aria-label="Color hex" />
                            </span>
                          </label>
                          <div className="cert_align" role="group" aria-label="Alignment">
                            <span>Alignment</span>
                            <div className="cert_align_row">
                              {ALIGNMENTS.map((alignment) =>
                                <button
                                  key={alignment}
                                  type="button"
                                  className={active.text_alignment === alignment ? "is_on" : undefined}
                                  aria-label={alignment}
                                  onClick={() => { push_history(); patch_field(active.field_key, { text_alignment: alignment }); }}>
                                  <Align_Icon kind={alignment} />
                                </button>
                              )}
                            </div>
                          </div>
                          <Stepper label="Letter spacing" value={active.letter_spacing} min={-5} max={40} on_focus={push_history} on_change={(letter_spacing) => patch_field(active.field_key, { letter_spacing })} />
                        </div> :
                        null}
                    </section>
                  </>}
            </div>
          </aside>
        </div>}

      {preview_url ?
        <div className="cert_preview" role="dialog" aria-modal="true" aria-label="Preview">
          <div className="cert_preview_bar cert_chrome">
            <button type="button" className="cert_preview_close" onClick={() => set_preview_url("")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              Close
            </button>
            <div className="cert_preview_title">
              <strong>{template_name.trim() || "Certificate"}</strong>
              <small>Preview</small>
            </div>
            <button type="button" className="cert_preview_download" onClick={download_preview}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10" /><path d="M8.5 10.5 12 14l3.5-3.5" /><path d="M5 18h14" /></svg>
              Download
            </button>
          </div>
          <div className="cert_preview_stage" onClick={(event) => { if (event.target === event.currentTarget) set_preview_url(""); }}>
            <div className="cert_preview_paper">
              <img src={preview_url} alt="Certificate preview" />
            </div>
          </div>
        </div> :
        null}
      <Confirm_Modal
        open={confirm_new}
        title="Start a new template?"
        message="Changes will not be saved. Do you want to continue?"
        confirm_label="Continue"
        busy={false}
        danger={false}
        on_confirm={confirm_start_new}
        on_cancel={() => set_confirm_new(false)} />
      <Confirm_Modal
        open={confirm_delete}
        title="Delete template"
        message="This removes the saved template and its picture."
        confirm_label="Delete template"
        busy={busy}
        busy_label="Deleting…"
        on_confirm={remove_saved}
        on_cancel={() => set_confirm_delete(false)} />
    </section>
  );
}
