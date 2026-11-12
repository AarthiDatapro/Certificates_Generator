import { is_image_field } from "./fields.js";

function load_image(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!String(src).startsWith("blob:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The certificate picture could not be loaded."));
    image.src = src;
  });
}

function draw_underline(ctx, text, x, y, size, max_width) {
  const width = Math.min(ctx.measureText(text).width, max_width || ctx.measureText(text).width);
  let start = x;
  if (ctx.textAlign === "center") start = x - width / 2;
  if (ctx.textAlign === "right") start = x - width;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.max(1, size / 16);
  ctx.beginPath();
  ctx.moveTo(start, y + size * 0.38);
  ctx.lineTo(start + width, y + size * 0.38);
  ctx.stroke();
}

async function draw_image_field(ctx, field) {
  const source = String(field.image_data || "").trim();
  if (!source) return;
  const box_width = Math.max(1, Number(field.box_width) || 1);
  const box_height = Math.max(1, Number(field.box_height) || 1);
  const x = Number(field.x_position) || 0;
  const y = Number(field.y_position) || 0;
  try {
    const image = await load_image(source);
    ctx.drawImage(image, x, y, box_width, box_height);
  } catch {
    // Skip a broken stamp rather than failing the whole certificate.
  }
}

function draw_text_field(ctx, field, values) {
  const column = field.excel_column || field.field_key;
  const raw = values?.[column];
  const text = raw === undefined || raw === null || String(raw).trim() === "" ? `{${column}}` : String(raw);
  const size = Math.max(8, Number(field.font_size) || 48);
  const box_width = Math.max(40, Number(field.box_width) || 420);
  const box_height = Math.max(24, Number(field.box_height) || 70);
  const align = field.text_alignment || "center";
  ctx.save();
  ctx.font = `${field.italic ? "italic" : "normal"} ${field.bold ? "700" : "400"} ${size}px "${field.font_family || "Roboto"}", sans-serif`;
  ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(String(field.font_color || "")) ? field.font_color : "#0D1B3F";
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${Number(field.letter_spacing) || 0}px`;
  let x = Number(field.x_position) || 0;
  const y = (Number(field.y_position) || 0) + box_height / 2;
  if (align === "center" || align === "justify") {
    ctx.textAlign = "center";
    x += box_width / 2;
  } else if (align === "right") {
    ctx.textAlign = "right";
    x += box_width;
  } else {
    ctx.textAlign = "left";
  }
  ctx.fillText(text, x, y, align === "justify" ? undefined : box_width);
  if (field.underline) draw_underline(ctx, text, x, y, size, box_width);
  ctx.restore();
}

export async function render_certificate(image_source, width, height, fields, values, options = {}) {
  const coordinates_only = Boolean(options.coordinates_only);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (coordinates_only) {
    canvas.width = Math.max(1, Number(width) || 1);
    canvas.height = Math.max(1, Number(height) || 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const image = await load_image(image_source);
    canvas.width = width || image.naturalWidth || 1;
    canvas.height = height || image.naturalHeight || 1;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  if (document.fonts?.ready) await document.fonts.ready;
  for (const field of fields || []) {
    if (is_image_field(field)) await draw_image_field(ctx, field);
    else draw_text_field(ctx, field, values);
  }
  return canvas.toDataURL("image/png");
}
