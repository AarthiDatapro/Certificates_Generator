export const FONT_FAMILIES = ["Roboto", "Lato", "Poppins", "Inter", "Montserrat", "Georgia", "Times New Roman", "Arial"];
export const ALIGNMENTS = ["left", "center", "right", "justify"];
export const GRID_SPACINGS = [10, 20, 40];

export function is_image_field(field) {
  return String(field?.kind || field?.type || "").toLowerCase() === "image";
}

export function text_fields(fields) {
  return (fields || []).filter((field) => !is_image_field(field));
}

export function image_fields(fields) {
  return (fields || []).filter((field) => is_image_field(field));
}

export function fresh_field(excel_column, width, height, index, field_key) {
  const box_width = Math.min(520, Math.max(180, Math.round((width || 1000) * 0.36)));
  const box_height = 70;
  const column = Math.floor(index / 8);
  const row = index % 8;
  const x_position = Math.max(24, Math.min(Math.max(24, width - box_width - 8), 48 + column * (box_width + 16)));
  const y_position = Math.max(24, Math.min(Math.max(24, height - box_height - 8), 48 + row * (box_height + 12)));
  const mapped = String(excel_column || "").trim();
  const key = String(field_key || mapped || `variable_${index + 1}`).trim() || `variable_${index + 1}`;
  return {
    kind: "text",
    field_key: key,
    name: key,
    excel_column: mapped,
    x_position,
    y_position,
    box_width,
    box_height,
    font_family: "Roboto",
    font_size: 48,
    font_color: "#0D1B3F",
    text_alignment: "center",
    bold: false,
    italic: false,
    underline: false,
    letter_spacing: 0
  };
}

export function fresh_image_field(image_data, natural_width, natural_height, width, height, index, field_key) {
  const canvas_w = Math.max(1, Number(width) || 1);
  const canvas_h = Math.max(1, Number(height) || 1);
  const source_w = Math.max(1, Number(natural_width) || 160);
  const source_h = Math.max(1, Number(natural_height) || 160);
  const max_w = Math.max(48, Math.min(Math.round(canvas_w * 0.28), 420));
  const max_h = Math.max(48, Math.min(Math.round(canvas_h * 0.28), 420));
  const scale = Math.min(1, max_w / source_w, max_h / source_h);
  const box_width = Math.max(40, Math.round(source_w * scale));
  const box_height = Math.max(24, Math.round(source_h * scale));
  const x_position = Math.max(24, Math.min(Math.max(0, canvas_w - box_width - 8), Math.round((canvas_w - box_width) / 2)));
  const y_position = Math.max(24, Math.min(Math.max(0, canvas_h - box_height - 8), Math.round(canvas_h * 0.62)));
  const key = String(field_key || `image_${index + 1}`).trim() || `image_${index + 1}`;
  return {
    kind: "image",
    field_key: key,
    name: "Stamp",
    image_data: String(image_data || ""),
    x_position,
    y_position,
    box_width,
    box_height
  };
}

export function clean_field(field, width, height) {
  const box_width = Math.min(4000, Math.max(40, Math.round(Number(field.box_width) || 420)));
  const box_height = Math.min(800, Math.max(24, Math.round(Number(field.box_height) || 70)));
  const excel_column = String(field.excel_column || "").trim();
  const field_key = String(field.field_key || excel_column || "variable").trim() || "variable";
  const name = String(field.name || field_key).trim() || field_key;
  const limit_width = Math.max(1, Number(width) || 1);
  const limit_height = Math.max(1, Number(height) || 1);
  return {
    kind: "text",
    field_key,
    name,
    excel_column,
    x_position: Math.min(Math.max(0, Math.round(Number(field.x_position) || 0)), limit_width - 1),
    y_position: Math.min(Math.max(0, Math.round(Number(field.y_position) || 0)), limit_height - 1),
    box_width,
    box_height,
    font_family: FONT_FAMILIES.includes(field.font_family) ? field.font_family : "Roboto",
    font_size: Math.min(200, Math.max(8, Math.round(Number(field.font_size) || 48))),
    font_color: /^#[0-9a-fA-F]{6}$/.test(String(field.font_color || "")) ? field.font_color : "#0D1B3F",
    text_alignment: ALIGNMENTS.includes(field.text_alignment) ? field.text_alignment : "center",
    bold: Boolean(field.bold),
    italic: Boolean(field.italic),
    underline: Boolean(field.underline),
    letter_spacing: Math.min(40, Math.max(-5, Math.round(Number(field.letter_spacing) || 0)))
  };
}

export function clean_image_field(field, width, height) {
  const box_width = Math.min(4000, Math.max(24, Math.round(Number(field.box_width) || 160)));
  const box_height = Math.min(4000, Math.max(24, Math.round(Number(field.box_height) || 160)));
  const field_key = String(field.field_key || "image").trim() || "image";
  const name = String(field.name || field_key).trim() || field_key;
  const image_data = String(field.image_data || "").trim();
  const limit_width = Math.max(1, Number(width) || 1);
  const limit_height = Math.max(1, Number(height) || 1);
  return {
    kind: "image",
    field_key,
    name,
    image_data,
    x_position: Math.min(Math.max(0, Math.round(Number(field.x_position) || 0)), limit_width - 1),
    y_position: Math.min(Math.max(0, Math.round(Number(field.y_position) || 0)), limit_height - 1),
    box_width,
    box_height
  };
}

export function normalize_field(field, width, height) {
  return is_image_field(field) ? clean_image_field(field, width, height) : clean_field(field, width, height);
}

export function field_is_ready(field) {
  if (is_image_field(field)) return Boolean(String(field.image_data || "").trim());
  return Boolean(String(field.excel_column || "").trim());
}
