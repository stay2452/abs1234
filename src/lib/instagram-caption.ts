const GENERATED_CAPTION_PATTERNS = [
  /^photo by .+\bmay be\b/i,
  /^video by .+\bmay be\b/i,
  /^photo shared by .+\bmay be\b/i,
  /\bmay be an image of\b/i,
  /\bmay be a video of\b/i,
  /\bmay be text\b/i,
  /^image may contain\b/i,
  /^no photo description available\b/i,
  /^no video description available\b/i,
];

function normalizeCaptionText(value: string) {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function isLikelyInstagramGeneratedCaption(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = normalizeCaptionText(value);
  return GENERATED_CAPTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function cleanInstagramCaption(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeCaptionText(value);

  if (!normalized || isLikelyInstagramGeneratedCaption(normalized)) {
    return null;
  }

  return normalized;
}
