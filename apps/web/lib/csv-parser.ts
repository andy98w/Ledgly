export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

export function parseCSV(text: string): ParsedCSV {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim() || lines.length > 0) {
        lines.push(current);
      }
      current = '';
      // Skip \r\n
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function autoDetectMapping(
  csvHeaders: string[],
  targetFields: { key: string; label: string; aliases: string[] }[],
): Record<string, number> {
  const mapping: Record<string, number> = {};
  const usedColumns = new Set<number>();
  const normalizedHeaders = csvHeaders.map(normalize);

  // Pass 1: exact match (after normalization)
  for (const field of targetFields) {
    const allNames = [field.label, field.key, ...field.aliases].map(normalize);
    const matchIndex = normalizedHeaders.findIndex((h, i) =>
      !usedColumns.has(i) && allNames.includes(h),
    );
    if (matchIndex !== -1) {
      mapping[field.key] = matchIndex;
      usedColumns.add(matchIndex);
    }
  }

  // Pass 2: substring/contains match
  for (const field of targetFields) {
    if (mapping[field.key] !== undefined) continue;
    const allNames = [field.label, field.key, ...field.aliases].map(normalize);
    const matchIndex = normalizedHeaders.findIndex((h, i) => {
      if (usedColumns.has(i) || h.length < 2) return false;
      return allNames.some((name) => h.includes(name) || name.includes(h));
    });
    if (matchIndex !== -1) {
      mapping[field.key] = matchIndex;
      usedColumns.add(matchIndex);
    }
  }

  // Pass 3: fuzzy match (Levenshtein similarity >= 0.7)
  for (const field of targetFields) {
    if (mapping[field.key] !== undefined) continue;
    const allNames = [field.label, field.key, ...field.aliases].map(normalize);

    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedColumns.has(i)) continue;
      const h = normalizedHeaders[i];
      for (const name of allNames) {
        const score = similarity(h, name);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    if (bestIndex !== -1 && bestScore >= 0.7) {
      mapping[field.key] = bestIndex;
      usedColumns.add(bestIndex);
    }
  }

  return mapping;
}
