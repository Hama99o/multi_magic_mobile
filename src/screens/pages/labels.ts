/** The words for a sort and a type filter. Literal keys, so the key gate sees each one. */
import type { SortBy } from "@/api/pages";
import type { Filter } from "./drive/filters";

type Translate = (key: string) => string;

export function sortLabel(sort: SortBy, t: Translate): string {
  switch (sort) {
    case "name":
      return t("pages.sort.name");
    case "updated_at":
      return t("pages.sort.updated");
    case "created_at":
      return t("pages.sort.created");
    case "size":
      return t("pages.sort.size");
    default:
      return t("pages.sort.type");
  }
}

export function typeLabel(type: Filter | null, t: Translate): string {
  switch (type) {
    case "folders":
      return t("pages.types.folders");
    case "image":
      return t("pages.types.image");
    case "pdf":
      return t("pages.types.pdf");
    case "video":
      return t("pages.types.video");
    case "audio":
      return t("pages.types.audio");
    case "document":
      return t("pages.types.document");
    case "archive":
      return t("pages.types.archive");
    default:
      return t("pages.types.all");
  }
}
