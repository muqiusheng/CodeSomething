type Rows = (string | null)[][];
export function filterRows(rows: Rows, query: string): Rows;
export function resultCsv(columns: string[], rows: Rows): string;
export function resultMarkdown(columns: string[], rows: Rows): string;
