import { useEffect, useMemo, useState } from "react";
import { render_certificate } from "../lib/draw.js";
import { is_image_field, text_fields } from "../lib/fields.js";
import { config_error, delete_template, list_templates, save_template } from "../lib/store.js";
import { Confirm_Modal } from "./confirm_modal.jsx";
import { Print_Modal } from "./print_modal.jsx";

const FAVORITES_KEY = "cert_template_favorites";

function format_day(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function read_favorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function is_active(item) {
  return Boolean(item?.image_url && text_fields(item?.fields).length);
}

export function History_Screen({ revision, on_open, on_create, notify }) {
  const [items, set_items] = useState([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState("");
  const [pending, set_pending] = useState(null);
  const [busy, set_busy] = useState(false);
  const [query, set_query] = useState("");
  const [sort, set_sort] = useState("latest");
  const [favorites, set_favorites] = useState(() => read_favorites());
  const [menu_id, set_menu_id] = useState("");
  const [preview, set_preview] = useState(null);
  const [preview_url, set_preview_url] = useState("");
  const [preview_busy, set_preview_busy] = useState(false);
  const [thumbs, set_thumbs] = useState({});
  const [print_job, set_print_job] = useState(null);

  useEffect(() => {
    let live = true;
    if (config_error()) {
      set_items([]);
      set_error("");
      set_loading(false);
      return () => { live = false; };
    }
    set_loading(true);
    list_templates()
      .then((next) => {
        if (!live) return;
        set_items(next);
        set_error("");
      })
      .catch((err) => {
        if (!live) return;
        set_items([]);
        set_error(err.message || "Templates could not be loaded.");
      })
      .finally(() => {
        if (live) set_loading(false);
      });
    return () => { live = false; };
  }, [revision]);

  useEffect(() => {
    function on_doc(event) {
      if (!event.target.closest?.(".cert_history_more")) set_menu_id("");
    }
    document.addEventListener("pointerdown", on_doc);
    return () => document.removeEventListener("pointerdown", on_doc);
  }, []);

  useEffect(() => {
    let live = true;
    const next = {};
    (async () => {
      for (const item of items) {
        if (!live) return;
        if (!item.image_url || !item.fields?.length || !item.image_width || !item.image_height) continue;
        try {
          const sample = {};
          for (const field of item.fields) {
            if (is_image_field(field)) continue;
            const column = field.excel_column || field.field_key;
            if (column) sample[column] = `{${column}}`;
          }
          next[item.id] = await render_certificate(
            item.image_url,
            item.image_width,
            item.image_height,
            item.fields,
            sample
          );
          if (live) set_thumbs((current) => ({ ...current, [item.id]: next[item.id] }));
        } catch {
          /* keep plain image */
        }
      }
    })();
    return () => { live = false; };
  }, [items]);

  useEffect(() => {
    if (!preview) return undefined;
    function on_key(event) {
      if (event.key === "Escape") close_preview();
    }
    document.addEventListener("keydown", on_key);
    return () => document.removeEventListener("keydown", on_key);
  }, [preview]);

  function close_preview() {
    set_preview(null);
    set_preview_url("");
    set_preview_busy(false);
  }

  async function open_preview(item) {
    if (!item?.image_url) return;
    set_preview(item);
    set_preview_url("");
    set_preview_busy(true);
    try {
      if (item.fields?.length && item.image_width && item.image_height) {
        const sample = {};
        for (const field of item.fields) {
          if (is_image_field(field)) continue;
          const column = field.excel_column || field.field_key;
          if (column) sample[column] = `{${column}}`;
        }
        const url = await render_certificate(
          item.image_url,
          item.image_width,
          item.image_height,
          item.fields,
          sample
        );
        set_preview_url(url);
      } else {
        set_preview_url(item.image_url);
      }
    } catch (err) {
      notify?.("error", err.message || "Preview failed.");
      close_preview();
    } finally {
      set_preview_busy(false);
    }
  }

  function download_preview() {
    const href = preview_url || preview?.image_url;
    if (!href) return;
    const stem = String(preview.template_name || "certificate")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "certificate";
    const link = document.createElement("a");
    link.href = href;
    link.download = `${stem}.png`;
    link.click();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let next = items.filter((item) => {
      if (!q) return true;
      return String(item.template_name || "").toLowerCase().includes(q);
    });
    next = [...next].sort((a, b) => {
      if (sort === "name") {
        return String(a.template_name || "").localeCompare(String(b.template_name || ""));
      }
      const a_time = new Date(a.updated_at || a.created_at || 0).getTime();
      const b_time = new Date(b.updated_at || b.created_at || 0).getTime();
      return sort === "oldest" ? a_time - b_time : b_time - a_time;
    });
    return next;
  }, [items, query, sort]);

  function toggle_favorite(id, event) {
    event.stopPropagation();
    set_favorites((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function remove_pending() {
    if (!pending) return;
    set_busy(true);
    try {
      await delete_template(pending);
      set_items((current) => current.filter((item) => item.id !== pending.id));
      set_pending(null);
      set_menu_id("");
      notify("success", "Template deleted.");
    } catch (err) {
      notify("error", err.message || "Delete failed.");
    } finally {
      set_busy(false);
    }
  }

  async function duplicate_item(item) {
    set_busy(true);
    set_menu_id("");
    try {
      const saved = await save_template({
        template_name: `${item.template_name || "Untitled"} copy`,
        image_path: item.image_path || "",
        image_data: item.image_data || (String(item.image_url || "").startsWith("data:") ? item.image_url : ""),
        image_width: item.image_width,
        image_height: item.image_height,
        fields: item.fields || []
      });
      set_items((current) => [saved, ...current]);
      notify("success", "Template duplicated.");
    } catch (err) {
      notify("error", err.message || "Duplicate failed.");
    } finally {
      set_busy(false);
    }
  }

  return (
    <section className="cert_history">
      <header className="cert_history_toolbar">
        <label className="cert_history_search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
          <input
            value={query}
            onChange={(event) => set_query(event.target.value)}
            placeholder="Search template by name..."
            aria-label="Search templates"
            disabled={loading || !items.length} />
        </label>
        <select
          className="cert_history_select"
          value={sort}
          onChange={(event) => set_sort(event.target.value)}
          aria-label="Sort templates">
          <option value="latest">Sort by: Latest</option>
          <option value="oldest">Sort by: Oldest</option>
          <option value="name">Sort by: Name</option>
        </select>
        <button type="button" className="cert_history_new" onClick={on_create}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          New
        </button>
      </header>

      <div className="cert_history_body">
        {loading ? <p className="cert_history_status">Loading templates…</p> : null}
        {!loading && error ? <p className="cert_history_status is_error">{error}</p> : null}
        {!loading && !error && !items.length ?
          <div className="cert_history_empty">
            <strong>No templates yet</strong>
            <p>Design a certificate and save it to see it here.</p>
            <button type="button" className="cert_history_new" onClick={on_create}>New template</button>
          </div> :
          null}
        {!loading && !error && items.length && !filtered.length ?
          <p className="cert_history_status">Nothing matches your search.</p> :
          null}
        {!loading && !error && filtered.length ?
          <div className="cert_history_grid" role="list">
            {filtered.map((item) => {
              const active = is_active(item);
              const favored = favorites.includes(item.id);
              return (
                <article key={item.id} className="cert_history_card" role="listitem">
                  <div className="cert_history_media">
                    <div className="cert_history_shot">
                      {item.image_url ?
                        <img src={thumbs[item.id] || item.image_url} alt="" /> :
                        <span>No picture</span>}
                      <label className="cert_history_check" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${item.template_name || "template"}`} />
                      </label>
                      <button
                        type="button"
                        className={favored ? "cert_history_star is_on" : "cert_history_star"}
                        aria-label={favored ? "Remove favorite" : "Favorite"}
                        onClick={(event) => toggle_favorite(item.id, event)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18.5l.9-5.4L4.2 9.3l5.4-.8z" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="cert_history_card_body">
                    <div className="cert_history_card_top">
                      <h2 title={item.template_name || "Untitled"}>{item.template_name || "Untitled"}</h2>
                      <span className={active ? "cert_history_badge is_active" : "cert_history_badge"}>{active ? "Active" : "Inactive"}</span>
                    </div>
                    <p className="cert_history_card_meta">
                      <span>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
                        {format_day(item.updated_at || item.created_at)}
                      </span>
                      <i aria-hidden="true">•</i>
                      <span>{(() => {
                        const variables = text_fields(item.fields).length;
                        const images = (item.fields || []).filter((field) => is_image_field(field)).length;
                        const parts = [`${variables} Variable${variables === 1 ? "" : "s"}`];
                        if (images) parts.push(`${images} image${images === 1 ? "" : "s"}`);
                        return parts.join(" · ");
                      })()}</span>
                    </p>
                  </div>
                  <footer className="cert_history_card_foot">
                    <div className="cert_history_actions">
                      <button type="button" disabled={!item.image_url || preview_busy} onClick={() => open_preview(item)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>
                        Preview
                      </button>
                      <button type="button" onClick={() => on_open(item)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="M13 7l4 4" /></svg>
                        Edit
                      </button>
                      <button type="button" disabled={busy} onClick={() => duplicate_item(item)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                        Duplicate
                      </button>
                    </div>
                    <div className="cert_history_more">
                      <button
                        type="button"
                        className="cert_history_more_btn"
                        aria-label="More actions"
                        aria-expanded={menu_id === item.id}
                        onClick={() => set_menu_id((value) => value === item.id ? "" : item.id)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></svg>
                      </button>
                      {menu_id === item.id ?
                        <div className="cert_history_menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!text_fields(item.fields).length || !item.image_width || !item.image_height}
                            onClick={() => {
                              set_menu_id("");
                              set_print_job({ mode: "coordinates", template: item });
                            }}>
                            Print only coordinates
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!item.image_url || !text_fields(item.fields).length || !item.image_width || !item.image_height}
                            onClick={() => {
                              set_menu_id("");
                              set_print_job({ mode: "certificates", template: item });
                            }}>
                            Print certificates
                          </button>
                          <button type="button" role="menuitem" className="is_danger" onClick={() => { set_menu_id(""); set_pending(item); }}>Delete</button>
                        </div> :
                        null}
                    </div>
                  </footer>
                </article>
              );
            })}
          </div> :
          null}
      </div>

      {preview ?
        <div className="cert_preview" role="dialog" aria-modal="true" aria-label="Preview">
          <div className="cert_preview_bar cert_chrome">
            <button type="button" className="cert_preview_close" onClick={close_preview}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              Close
            </button>
            <div className="cert_preview_title">
              <strong>{preview.template_name || "Certificate"}</strong>
              <small>{preview_busy ? "Rendering variables…" : "Preview"}</small>
            </div>
            <button type="button" className="cert_preview_download" onClick={download_preview} disabled={!preview_url || preview_busy}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10" /><path d="M8.5 10.5 12 14l3.5-3.5" /><path d="M5 18h14" /></svg>
              Download
            </button>
          </div>
          <div className="cert_preview_stage" onClick={(event) => { if (event.target === event.currentTarget) close_preview(); }}>
            <div className="cert_preview_paper">
              {preview_url ?
                <img src={preview_url} alt="Certificate preview" /> :
                <p className="cert_preview_loading">{preview_busy ? "Rendering variables…" : "Loading preview…"}</p>}
            </div>
          </div>
        </div> :
        null}

      <Print_Modal
        open={Boolean(print_job)}
        mode={print_job?.mode || "certificates"}
        template={print_job?.template || null}
        notify={notify}
        on_close={() => set_print_job(null)} />

      <Confirm_Modal
        open={Boolean(pending)}
        title="Delete template"
        message={pending ? `Delete ${pending.template_name || "this template"}?` : ""}
        confirm_label="Delete template"
        busy={busy}
        busy_label="Deleting…"
        on_confirm={remove_pending}
        on_cancel={() => { if (!busy) set_pending(null); }} />
    </section>
  );
}
