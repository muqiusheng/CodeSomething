export function filterRows(rows, query) {
  const needle = query.trim().toLowerCase();
  return needle ? rows.filter(row => row.some(value => (value ?? 'NULL').toLowerCase().includes(needle))) : rows;
}

export function resultCsv(columns, rows) {
  return [columns, ...rows].map(row => row.map(value => '"' + (value ?? 'NULL').replaceAll('"', '""') + '"').join(',')).join('\r\n') + '\r\n';
}

export function resultMarkdown(columns, rows) {
  const line = row => '| ' + row.map(value => (value ?? 'NULL')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/([\\|*_\x60~\[\]])/g, '\\$1').replace(/\r\n?|\n/g, '<br>')).join(' | ') + ' |';
  return [line(columns), line(columns.map(() => '---')), ...rows.map(line)].join('\n');
}
