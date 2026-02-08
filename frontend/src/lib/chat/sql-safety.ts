const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'ATTACH',
  'DETACH',
  'RENAME',
  'OPTIMIZE',
  'KILL',
  'SYSTEM',
];

export function validateSQL(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // Must start with SELECT or WITH
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { valid: false, error: 'Query must start with SELECT or WITH' };
  }

  // Check forbidden keywords (as standalone words)
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(trimmed)) {
      return { valid: false, error: `Forbidden keyword: ${keyword}` };
    }
  }

  // No system tables
  if (/\bsystem\s*\./i.test(trimmed)) {
    return { valid: false, error: 'Cannot query system tables' };
  }

  // Must contain LIMIT
  if (!/\bLIMIT\b/i.test(trimmed)) {
    return { valid: false, error: 'Query must include a LIMIT clause' };
  }

  // LIMIT value must be <= 500
  const limitMatch = trimmed.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    const limitVal = parseInt(limitMatch[1], 10);
    if (limitVal > 500) {
      return { valid: false, error: `LIMIT ${limitVal} exceeds maximum of 500` };
    }
  }

  return { valid: true };
}
