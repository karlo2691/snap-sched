import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildLaptopsExcelBlob } from "@/utils/laptopExcelSync";
import { toast } from "sonner";

interface UseLaptopExcelSyncReturn {
  isSyncing: boolean;
  /** Call after a laptop is created or updated to auto-sync the Excel sheet */
  triggerSync: (ownerId: string, silent?: boolean) => Promise<void>;
  /** Download a fresh copy of the Excel data list */
  downloadExcel: (ownerId: string) => Promise<void>;
}

/**
 * Hook that programmatically syncs laptop data (including assigned_owner)
 * to an Excel sheet whenever a record is created or updated.
 *
 * Usage:
 *   const { triggerSync, downloadExcel, isSyncing } = useLaptopExcelSync();
 *
 *   // After creating/updating a laptop:
 *   await triggerSync(session.user.id);
 */
export function useLaptopExcelSync(): UseLaptopExcelSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const triggerSync = useCallback(
    async (ownerId: string, silent = true) => {
      if (!ownerId) return;
      setIsSyncing(true);

      try {
        // Re-fetch latest laptops data (including the just-created/updated record)
        await queryClient.invalidateQueries({ queryKey: ["laptops"] });

        const { blob, fileName } = await buildLaptopsExcelBlob(ownerId);

        // Upload silently to Supabase storage so the Excel file is always
        // in sync with the latest database state
        const storagePath = `laptop-exports/${ownerId}/laptops_latest.xlsx`;
        const { error: uploadError } = await supabase.storage
          .from("sheet-uploads")
          .upload(storagePath, blob, { upsert: true });

        if (uploadError) {
          console.warn("useLaptopExcelSync: storage upload failed", uploadError);
        } else {
          // Upsert sheet_uploads audit record
          await supabase.from("sheet_uploads").upsert(
            {
              file_name: fileName,
              storage_path: storagePath,
              kind: "laptop_export",
              size_bytes: blob.size,
              uploaded_by: ownerId,
              notes: `Auto-synced on ${new Date().toLocaleString()} — assigned owner captured`,
            },
            { onConflict: "storage_path" }
          );
        }

        if (!silent) {
          toast.success("Excel sheet synced", {
            description: "Assigned owner written to data list.",
          });
        }
      } catch (err) {
        console.error("useLaptopExcelSync: sync failed", err);
        if (!silent) {
          toast.error("Excel sync failed", {
            description: "Could not update the Excel data list.",
          });
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [queryClient]
  );

  const downloadExcel = useCallback(async (ownerId: string) => {
    if (!ownerId) return;
    setIsSyncing(true);
    try {
      const { blob, fileName } = await buildLaptopsExcelBlob(ownerId);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download started", {
        description: `${fileName} is downloading.`,
      });
    } catch (err) {
      console.error("useLaptopExcelSync: download failed", err);
      toast.error("Download failed", {
        description: "Could not generate the Excel file.",
      });
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return { isSyncing, triggerSync, downloadExcel };
}
