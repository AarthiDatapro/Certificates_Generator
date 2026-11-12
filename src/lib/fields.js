export const FONT_FAMILIES = ["Roboto", "Lato", "Poppins", "Inter", "Montserrat", "Georgia", "Times New Roman", "Arial"];
export const ALIGNMENTS = ["left", "center", "right", "justify"];
export const GRID_SPACINGS = [10, 20, 40];

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

export function clean_field(field, width, height) {
  const box_width = Math.min(4000, Math.max(40, Math.round(Number(field.box_width) || 420)));
  const box_height = Math.min(800, Math.max(24, Math.round(Number(field.box_height) || 70)));
  const excel_column = String(field.excel_column || "").trim();
  const field_key = String(field.field_key || excel_column || "variable").trim() || "variable";
  const name = String(field.name || field_key).trim() || field_key;
  const limit_width = Math.max(1, Number(width) || 1);
  const limit_height = Math.max(1, Number(height) || 1);
  return {
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
