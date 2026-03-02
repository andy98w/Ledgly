function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportCSV(
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPDF(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const tableRows = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td style="border:1px solid #ddd;padding:8px 12px;font-size:13px">${cell}</td>`).join('')}</tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a1a; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
    table { border-collapse: collapse; width: 100%; }
    th { border: 1px solid #ddd; padding: 8px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; background: #f5f5f5; text-align: left; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">Exported on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  <table>
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}
