const MAX_FILE_SIZE = 25 * 1024 * 1024;

const allowedTypes = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["avif", "image/avif"],
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["odt", "application/vnd.oasis.opendocument.text"],
  ["ods", "application/vnd.oasis.opendocument.spreadsheet"],
  ["odp", "application/vnd.oasis.opendocument.presentation"],
]);

export function validateUpload(file: File): { ok: true; contentType: string; isImage: boolean } | { ok: false; reason: "size" | "type" } {
  if (file.size > MAX_FILE_SIZE) return { ok: false, reason: "size" };
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = allowedTypes.get(extension);
  if (!contentType) return { ok: false, reason: "type" };
  if (file.type && file.type !== contentType && !(file.type === "application/octet-stream")) {
    return { ok: false, reason: "type" };
  }
  return { ok: true, contentType, isImage: contentType.startsWith("image/") };
}

export function isSupportedImageType(contentType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(contentType);
}
