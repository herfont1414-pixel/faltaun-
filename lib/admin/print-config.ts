import { getPool } from "@/lib/admin/db";
import type { PrintConfig } from "@/lib/admin/types";

const DEFAULTS: PrintConfig = {
  paperWidthMm: 80,
  headerText: "",
  footerText: "",
  paperSavingMode: false,
  fontSizeHeader: "normal",
  fontSizeBody: "normal",
  fontSizeFooter: "normal",
  directPrintEnabled: false,
  printerName: "",
};

function toFontSize(value: unknown): PrintConfig["fontSizeHeader"] {
  return value === "pequena" ? "pequena" : "normal";
}

export async function getPrintConfig(): Promise<PrintConfig> {
  const pool = getPool();
  const { rows } = await pool.query<{
    paper_width_mm: number;
    header_text: string | null;
    footer_text: string | null;
    paper_saving_mode: boolean;
    font_size_header: string;
    font_size_body: string;
    font_size_footer: string;
    direct_print_enabled: boolean;
    printer_name: string | null;
  }>(
    `select paper_width_mm, header_text, footer_text, paper_saving_mode,
            font_size_header, font_size_body, font_size_footer,
            direct_print_enabled, printer_name
     from gestion_print_config where id = 1`
  );
  const row = rows[0];
  if (!row) return DEFAULTS;
  return {
    paperWidthMm: row.paper_width_mm === 58 ? 58 : 80,
    headerText: row.header_text ?? "",
    footerText: row.footer_text ?? "",
    paperSavingMode: !!row.paper_saving_mode,
    fontSizeHeader: toFontSize(row.font_size_header),
    fontSizeBody: toFontSize(row.font_size_body),
    fontSizeFooter: toFontSize(row.font_size_footer),
    directPrintEnabled: !!row.direct_print_enabled,
    printerName: row.printer_name ?? "",
  };
}

export async function updatePrintConfig(patch: Partial<PrintConfig>): Promise<PrintConfig> {
  const current = await getPrintConfig();
  // Un spread normal pisa una clave con `undefined` aunque el caller no haya
  // querido tocarla (el route handler siempre manda las 7 claves, definidas
  // o no), así que se filtran antes de mezclar con la config actual.
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: PrintConfig = { ...current, ...definedPatch };
  const pool = getPool();
  await pool.query(
    `insert into gestion_print_config
       (id, paper_width_mm, header_text, footer_text, paper_saving_mode,
        font_size_header, font_size_body, font_size_footer,
        direct_print_enabled, printer_name)
     values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (id) do update set
       paper_width_mm = excluded.paper_width_mm,
       header_text = excluded.header_text,
       footer_text = excluded.footer_text,
       paper_saving_mode = excluded.paper_saving_mode,
       font_size_header = excluded.font_size_header,
       font_size_body = excluded.font_size_body,
       font_size_footer = excluded.font_size_footer,
       direct_print_enabled = excluded.direct_print_enabled,
       printer_name = excluded.printer_name`,
    [
      next.paperWidthMm,
      next.headerText,
      next.footerText,
      next.paperSavingMode,
      next.fontSizeHeader,
      next.fontSizeBody,
      next.fontSizeFooter,
      next.directPrintEnabled,
      next.printerName,
    ]
  );
  return next;
}
