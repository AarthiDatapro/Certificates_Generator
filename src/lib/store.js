import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_BUCKET, SUPABASE_TABLE, SUPABASE_URL } from "../supabase_config.js";
import { field_is_ready, normalize_field } from "./fields.js";

const BUCKET = String(SUPABASE_BUCKET || "").trim() || "certificate_templates";
const TABLE = String(SUPABASE_TABLE || "").trim() || "certificate_templates";

export function config_error() {
  const url = String(SUPABASE_URL || "").trim();
  const key = String(SUPABASE_ANON_KEY || "").trim();
  if (!url || url.includes("YOUR_PROJECT") || !key || key.includes("YOUR_ANON_KEY")) {
    return "Add your Supabase URL and publishable key in certificates/src/supabase_config.js. Run certificates/supabase.sql once in the SQL editor.";
  }
  return "";
}

export const supabase = createClient(
  SUPABASE_URL && !String(SUPABASE_URL).includes("YOUR_PROJECT") ? SUPABASE_URL : "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY && !String(SUPABASE_ANON_KEY).includes("YOUR_ANON_KEY") ? SUPABASE_ANON_KEY : "placeholder-anon-key"
);

function as_array(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function image_public_url(path) {
  if (!path) return "";
  if (String(path).startsWith("data:")) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

function map_template(row) {
  if (!row) return null;
  const image_width = Number(row.image_width) || 0;
  const image_height = Number(row.image_height) || 0;
  const limit_width = image_width || 10000;
  const limit_height = image_height || 10000;
  const image_data = String(row.image_data || "");
  const image_path = String(row.image_path || "");
  return {
    id: row.id,
    template_name: row.template_name || "",
    image_path,
    image_data,
    image_url: image_data || image_public_url(image_path),
    image_width,
    image_height,
    // Excel files stay local only — never hydrate spreadsheet data from Supabase.
    excel_file_name: "",
    excel_columns: [],
    fields: as_array(row.fields)
      .map((field) => normalize_field(field, limit_width, limit_height))
      .filter((field) => field_is_ready(field)),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function file_to_data_url(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The certificate picture could not be read."));
    reader.readAsDataURL(file);
  });
}

function require_config() {
  const problem = config_error();
  if (problem) throw new Error(problem);
}

export async function list_templates() {
  require_config();
  const { data, error } = await supabase.from(TABLE).select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(map_template);
}

export async function save_template(input) {
  require_config();
  let next_path = input.image_path || "";
  let next_data = input.image_data || "";
  if (input.image_file) {
    next_data = await file_to_data_url(input.image_file);
    next_path = "";
  }
  if (!next_data && !next_path) throw new Error("Upload a PNG or JPG certificate.");
  const payload = {
    template_name: input.template_name,
    image_path: next_path,
    image_data: next_data || null,
    image_width: input.image_width,
    image_height: input.image_height,
    // Never store Excel files or spreadsheet contents in Supabase.
    excel_file_name: "",
    excel_columns: [],
    fields: input.fields,
    updated_at: new Date().toISOString()
  };
  const query = input.id
    ? supabase.from(TABLE).update(payload).eq("id", input.id)
    : supabase.from(TABLE).insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) {
    const message = String(error.message || "Save failed.");
    if (/row-level security|rls/i.test(message)) {
      throw new Error("Supabase blocked the save (RLS). Open the SQL editor and run certificates/supabase.sql on this project, then try again.");
    }
    if (/image_data|column/i.test(message)) {
      throw new Error("Missing image_data column. Run certificates/supabase.sql in the Supabase SQL editor, then try again.");
    }
    throw new Error(message);
  }
  if (input.image_file && input.image_path && !String(input.image_path).startsWith("data:")) {
    await supabase.storage.from(BUCKET).remove([input.image_path]).catch(() => {});
  }
  return map_template(data);
}

export async function delete_template(template) {
  require_config();
  if (template.image_path && !String(template.image_path).startsWith("data:")) {
    await supabase.storage.from(BUCKET).remove([template.image_path]).catch(() => {});
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", template.id);
  if (error) throw new Error(error.message);
}
