import { render_certificate } from "./draw.js";

export function mapped_column_label(field) {
  return String(field?.excel_column || field?.name || field?.field_key || "column").trim() || "column";
}

export function find_column(columns, wanted) {
  const target = String(wanted || "").trim();
  if (!target) return "";
  const list = columns || [];
  const exact = list.find((column) => column === target);
  if (exact) return exact;
  const lower = target.toLowerCase();
  return list.find((column) => String(column).toLowerCase() === lower) || "";
}

export function match_print_fields(fields, columns) {
  return (fields || []).map((field) => {
    const label = mapped_column_label(field);
    const matched = find_column(columns, field.excel_column) || find_column(columns, label);
    return { ...field, excel_column: matched, _label: label };
  });
}

export function missing_print_columns(fields, columns) {
  return match_print_fields(fields, columns)
    .filter((field) => !field.excel_column)
    .map((field) => field._label);
}

function wait_for_images(doc) {
  const images = [...doc.images];
  if (!images.length) return Promise.resolve();
  return Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }));
}

function data_url_to_blob_url(data_url) {
  const parts = String(data_url || "").split(",");
  const header = parts[0] || "";
  const body = parts[1] || "";
  const mime = /data:([^;]+)/.exec(header)?.[1] || "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function print_styles() {
  return `@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; font: 14px/1.4 sans-serif; }
.cert_print_wait { display:grid; place-items:center; min-height:100vh; padding:24px; text-align:center; }
img {
  display: block;
  max-width: 100%;
  width: auto;
  height: auto;
  margin: 0 auto;
  page-break-after: always;
  break-after: page;
}
img:last-child {
  page-break-after: auto;
  break-after: auto;
}`;
}

function print_markup(urls) {
  return `<!DOCTYPE html><html><head><title>Print</title><style>${print_styles()}</style></head><body>${urls.map((url) => `<img src="${url}" />`).join("")}</body></html>`;
}

async function run_print(win) {
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  await new Promise((resolve, reject) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    try {
      win.addEventListener("afterprint", done, { once: true });
      win.onafterprint = done;
      win.focus();
      win.print();
    } catch (err) {
      reject(err);
      return;
    }
    window.setTimeout(done, 60_000);
  });
}

export async function print_data_urls(data_urls) {
  const source_urls = (data_urls || []).filter(Boolean);
  if (!source_urls.length) throw new Error("Nothing to print.");

  const blob_urls = source_urls.map((url) => (
    String(url).startsWith("data:") ? data_url_to_blob_url(url) : url
  ));
  const revoke = () => {
    blob_urls.forEach((url) => {
      if (String(url).startsWith("blob:")) URL.revokeObjectURL(url);
    });
  };

  // Print from an on-page iframe so a user click is enough (no pop-up permission).
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Print";
  frame.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;z-index:2147483647;";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) throw new Error("Print preview could not be created.");
    doc.open();
    doc.write(print_markup(blob_urls));
    doc.close();
    await wait_for_images(doc);
    await run_print(frame.contentWindow);
  } finally {
    frame.remove();
    revoke();
  }
}

export class Print_Cancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "Print_Cancelled";
  }
}

function yield_ui() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

export async function render_print_rows(template, rows, {
  coordinates_only = false,
  on_progress,
  should_cancel
} = {}) {
  const width = Number(template.image_width) || 0;
  const height = Number(template.image_height) || 0;
  if (!coordinates_only && !template.image_url) {
    throw new Error("This template has no certificate picture.");
  }
  if (!width || !height) {
    throw new Error("This template is missing image size.");
  }
  if (!template.fields?.length) {
    throw new Error("This template has no variables.");
  }
  if (!rows?.length) {
    throw new Error("The Excel file has no data rows.");
  }

  const urls = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (should_cancel?.()) throw new Print_Cancelled();
    on_progress?.(index + 1, rows.length);
    await yield_ui();
    if (should_cancel?.()) throw new Print_Cancelled();
    const url = await render_certificate(
      template.image_url,
      width,
      height,
      template.fields,
      rows[index],
      { coordinates_only }
    );
    urls.push(url);
  }
  return urls;
}
