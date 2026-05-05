import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export interface LaptopExcelRow {
  "Asset Tag": string;
  "Model": string;
  "Team": string;
  "Assigned Owner": string;
  "Owner Email": string;
  "Created At": string;
}

/**
 * Fetches all laptops joined with their assigned team_member,
 * builds an Excel workbook, and triggers a browser download.
 * Also upserts a record in sheet_uploads for audit trail.
 */
export async function syncLaptopsToExcel(ownerId: string): Promise<void> {
  // 1. Fetch laptops with joined team_member name + email
  const { data: laptops, error } = await supabase
    .from("laptops")
    .select(
      `
      id,
      asset_tag,
      model,
      team,
      created_at,
      assigned_member_id,
      team_members (
        id,
        name,
        email
      )
    `
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("laptopExcelSync: fetch error", error);
    throw new Error(`Failed to fetch laptops: ${error.message}`);
  }

  // 2. Map to Excel rows
  const rows: LaptopExcelRow[] = (laptops ?? []).map((l) => {
    const member = Array.isArray(l.team_members)
      ? l.team_members[0]
      : l.team_members;

    return {
      "Asset Tag": l.asset_tag ?? "",
      Model: l.model ?? "",
      Team: l.team ?? "",
      "Assigned Owner": member?.name ?? "Unassigned",
      "Owner Email": member?.email ?? "",
      "Created At": l.created_at
        ? new Date(l.created_at).toLocaleDateString()
        : "",
    };
  });

  // 3. Build workbook
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Column widths for readability
  worksheet["!cols"] = [
    { wch: 16 }, // Asset Tag
    { wch: 22 }, // Model
    { wch: 18 }, // Team
    { wch: 24 }, // Assigned Owner
    { wch: 28 }, // Owner Email
    { wch: 14 }, // Created At
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laptops");

  // 4. Write and trigger download
  const fileName = `laptops_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  // 5. Log upload record to sheet_uploads for audit trail
  try {
    const wbArray = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbArray], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const storagePath = `laptop-exports/${ownerId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("sheet-uploads")
      .upload(storagePath, blob, { upsert: true });

    if (!uploadError) {
      await supabase.from("sheet_uploads").insert({
        file_name: fileName,
        storage_path: storagePath,
        kind: "laptop_export",
        size_bytes: blob.size,
        uploaded_by: ownerId,
        notes: `Auto-synced on ${new Date().toLocaleString()}`,
      });
    }
  } catch (auditErr) {
    // Non-fatal — download already happened
    console.warn("laptopExcelSync: audit log failed", auditErr);
  }
}

/**
 * Returns an Excel file as a Blob without downloading — useful for
 * programmatic use (e.g. attaching to emails or storing silently).
 */
export async function buildLaptopsExcelBlob(
  ownerId: string
): Promise<{ blob: Blob; fileName: string }> {
  const { data: laptops, error } = await supabase
    .from("laptops")
    .select(
      `
      asset_tag,
      model,
      team,
      created_at,
      team_members (
        name,
        email
      )
    `
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch laptops: ${error.message}`);

  const rows: LaptopExcelRow[] = (laptops ?? []).map((l) => {
    const member = Array.isArray(l.team_members)
      ? l.team_members[0]
      : l.team_members;
    return {
      "Asset Tag": l.asset_tag ?? "",
      Model: l.model ?? "",
      Team: l.team ?? "",
      "Assigned Owner": member?.name ?? "Unassigned",
      "Owner Email": member?.email ?? "",
      "Created At": l.created_at
        ? new Date(l.created_at).toLocaleDateString()
        : "",
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 28 },
    { wch: 14 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laptops");

  const wbArray = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fileName = `laptops_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { blob, fileName };
}
