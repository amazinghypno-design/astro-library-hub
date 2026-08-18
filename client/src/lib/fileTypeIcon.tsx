import { IconDocument, IconEbook, IconPoster, IconSlide, IconSpreadsheet, type IconProps } from "../components/icons";

type DocumentType = "ebook" | "document" | "spreadsheet" | "slide" | "poster" | "other";

/** documentType is the stored, admin-editable classification (server/src/db/schema.ts) — mimeType alone can't distinguish slide from ebook since both are application/pdf. */
export function fileTypeIcon(documentType: DocumentType): (p: IconProps) => JSX.Element {
  if (documentType === "ebook") return IconEbook;
  if (documentType === "spreadsheet") return IconSpreadsheet;
  if (documentType === "slide") return IconSlide;
  if (documentType === "poster") return IconPoster;
  return IconDocument;
}
