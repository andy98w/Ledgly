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

export function autoDetectMapping(
  csvHeaders: string[],
  targetFields: { key: string; label: string; aliases: string[] }[],
): Record<string, number> {
  const mapping: Record<string, number> = {};

  for (const field of targetFields) {
    const allNames = [field.label, field.key, ...field.aliases].map((n) =>
      n.toLowerCase().replace(/[^a-z0-9]/g, ''),
    );

    const matchIndex = csvHeaders.findIndex((h) =>
      allNames.includes(h.toLowerCase().replace(/[^a-z0-9]/g, '')),
    );

    if (matchIndex !== -1) {
      mapping[field.key] = matchIndex;
    }
  }

  return mapping;
}
