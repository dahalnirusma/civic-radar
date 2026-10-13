
export function isValidKeywordShape(raw: string): boolean {
    const k = raw.trim();
    if (k.length < 3 || k.length > 50) return false;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\s'&/-]*$/.test(k)) return false;
    return (k.match(/[a-zA-Z]/g) ?? []).length >= 3;
  }