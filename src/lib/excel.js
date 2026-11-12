import * as XLSX from "xlsx";

function unique_name(name, seen) {
  const base = String(name || "").trim();
  const count = (seen.get(base.toLowerCase()) || 0) + 1;
  seen.set(base.toLowerCase(), count);
  return count === 1 ? base : `${base} ${count}`;
}

export async function read_excel(file) {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error("The Excel file has no sheet.");
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const header = (grid[0] || []).map((cell) => String(cell ?? "").trim());
  const seen = new Map();
  const columns = [];
  let renamed = false;
  header.forEach((name, index) => {
    if (!name) return;
    const unique = unique_name(name, seen);
    if (unique !== name) renamed = true;
    columns.push({ name: unique, index });
  });
  if (!columns.length) throw new Error("The first row needs column names.");
  const rows = [];
  for (let line_index = 1; line_index < grid.length; line_index += 1) {
    const line = grid[line_index] || [];
    if (line.every((cell) => String(cell ?? "").trim() === "")) continue;
    const row = {};
    for (const column of columns) row[column.name] = String(line[column.index] ?? "").trim();
    rows.push(row);
  }
  return {
    file_name: file.name,
    columns: columns.map((column) => column.name),
    rows,
    renamed
  };
}
