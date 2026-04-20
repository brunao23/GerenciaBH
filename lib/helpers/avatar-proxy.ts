export function resolveAvatarImageSrc(input?: string | null): string {
  const value = String(input || "").trim()
  if (!value) return ""

  if (
    value.startsWith("data:image/") ||
    value.startsWith("blob:") ||
    value.startsWith("/") ||
    value.startsWith("/api/media/avatar?")
  ) {
    return value
  }

  if (/^https?:\/\//i.test(value)) {
    return `/api/media/avatar?url=${encodeURIComponent(value)}`
  }

  return value
}
