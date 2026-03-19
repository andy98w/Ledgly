interface ParsedRow {
  [key: string]: string;
}

interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  format: 'tab' | 'comma' | 'newline' | 'unknown';
}

export function detectAndParsePaste(text: string): ParseResult | null {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  if (lines.length < 2) return null;

  // Detect format
  const tabCount = lines.reduce((sum, l) => sum + (l.split('\t').length - 1), 0);
  const commaCount = lines.reduce((sum, l) => sum + (l.split(',').length - 1), 0);

  let format: 'tab' | 'comma' | 'newline' | 'unknown' = 'unknown';
  let rows: string[][] = [];

  if (tabCount >= lines.length) {
    format = 'tab';
    rows = lines.map(l => l.split('\t').map(c => c.trim()));
  } else if (commaCount >= lines.length) {
    format = 'comma';
    rows = lines.map(l => l.split(',').map(c => c.trim()));
  } else {
    format = 'newline';
    rows = lines.map(l => [l.trim()]);
  }

  if (rows.length < 2) return null;

  // Detect if first row is a header
  const firstRow = rows[0];
  const secondRow = rows[1];
  const hasHeader = firstRow.every(cell => {
    const lower = cell.toLowerCase();
    return !cell.match(/^\$?\d/) && (
      lower.includes('name') || lower.includes('email') || lower.includes('amount') ||
      lower.includes('date') || lower.includes('member') || lower.includes('title') ||
      lower.includes('category') || lower.includes('role') || lower.includes('source') ||
      lower.includes('memo') || lower.includes('vendor') || lower.includes('phone') ||
      lower.includes('due') || lower.includes('fee') || lower.includes('paid') ||
      // Generic: first row has no numbers but second row does
      (!cell.match(/\d/) && secondRow.some(c => c.match(/\d/)))
    );
  });

  let headers: string[];
  let dataRows: string[][];

  if (hasHeader) {
    headers = firstRow.map(h => h.toLowerCase().trim());
    dataRows = rows.slice(1);
  } else {
    headers = inferHeaders(firstRow);
    dataRows = rows;
  }

  const parsed: ParsedRow[] = dataRows
    .filter(row => row.some(cell => cell.length > 0 && cell !== '-' && cell.toLowerCase() !== 'tbd' && !cell.match(/^\[.*\]$/)))
    .map(row => {
      const obj: ParsedRow = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });

  if (parsed.length === 0) return null;

  return { rows: parsed, headers, format };
}

function inferHeaders(sampleRow: string[]): string[] {
  if (sampleRow.length === 1) return ['name'];

  return sampleRow.map((cell, i) => {
    if (cell.match(/^\$?\d[\d,.]*$/)) return i === 0 ? 'amount' : `amount_${i}`;
    if (cell.match(/@/)) return 'email';
    if (cell.match(/^\d{1,2}\/\d{1,2}/)) return 'date';
    if (cell.match(/^(venmo|zelle|cashapp|paypal|manual)$/i)) return 'source';
    if (cell.match(/^(DUES|EVENT|FINE|MERCH|OTHER|SUPPLIES|FOOD|VENUE|MARKETING|SERVICES)$/i)) return 'category';
    if (cell.match(/^(OWNER|ADMIN|TREASURER|MEMBER)$/i)) return 'role';
    if (i === 0) return 'name';
    if (i === 1 && sampleRow.length <= 3) return 'amount';
    return `col_${i}`;
  });
}

export function formatParsedDataForAI(result: ParseResult): string {
  const { rows, headers } = result;

  const summary = `[Parsed ${rows.length} rows with columns: ${headers.join(', ')}]\n`;
  const json = JSON.stringify(rows.slice(0, 50));

  return `${summary}Data: ${json}${rows.length > 50 ? `\n(${rows.length - 50} more rows truncated)` : ''}`;
}

export function isProbablyTabularData(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return false;

  const tabCount = lines.reduce((sum, l) => sum + (l.split('\t').length - 1), 0);
  if (tabCount >= lines.length) return true;

  const commaCount = lines.reduce((sum, l) => sum + (l.split(',').length - 1), 0);
  if (commaCount >= lines.length && lines[0].split(',').length >= 2) return true;

  if (lines.length >= 3 && lines.every(l => l.trim().length > 0 && l.trim().length < 100)) return true;

  return false;
}
