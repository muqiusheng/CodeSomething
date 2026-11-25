import {formatDialect, mysql} from 'sql-formatter';

const options = {dialect: mysql, tabWidth: 2, expressionWidth: 52};

const quotedOrComment = /'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`(?:``|[^`])*`|\/\*[\s\S]*?\*\/|(?:--(?=\s)|#)[^\r\n]*/g;
const simpleClauses = /^([ ]*)(SELECT(?: DISTINCT(?:ROW)?| ALL)?)\n((?:\1  [\w$.]+,\n)*\1  [\w$.*]+;?)$|^([ ]*)(FROM|WHERE)\n(\4  [\w$.]+(?: [<>=!]+ [-\w$.]+)?;?)$/gim;

function formatQuery(sql) {
  const formatted = formatDialect(sql, options);
  // A line that looks like a clause may be part of a multiline string or comment.
  if ([...formatted.matchAll(quotedOrComment)].some(([token]) => token.includes('\n'))) return formatted;
  return formatted.replace(simpleClauses, (match, selectIndent, select, fields, clauseIndent, clause, expression) => {
    const indent = selectIndent ?? clauseIndent;
    const body = (fields ?? expression).trim().replace(/\n +/g, ' ');
    const compact = indent + (select ?? clause) + ' ' + body;
    return compact.length <= options.expressionWidth ? compact : match;
  });
}

export function formatReferenceSql(sql) {
  try {
    if (!/^\s*DELIMITER\b/im.test(sql)) return formatQuery(sql);

    // MySQL client directives frame compound routines and are not SQL statements.
    const routine = /^(\s*DELIMITER[ \t]+(\S+)[ \t]*\r?\n[\s\S]*?\bBEGIN)\s+([\s\S]*?)(\bEND[ \t]*\2[ \t]*\r?\n[ \t]*DELIMITER[ \t]+;)([\s\S]*)$/im.exec(sql);
    if (!routine) return sql;
    const [, header, , body, footer, remaining] = routine;
    const chunks = body.split(/^[ \t]*((?:\w+:[ \t]+)?LOOP|END LOOP;)[ \t]*$/gim);
    let indent = '  ';
    const formatted = chunks.flatMap((chunk, index) => {
      if (!chunk.trim()) return [];
      if (index % 2 === 0) {
        return formatQuery(chunk).split('\n').map(line => line ? indent + line : '');
      }
      if (/^END LOOP/i.test(chunk)) {
        indent = indent.length > 2 ? indent.slice(2) : '  ';
        return [indent + chunk];
      }
      const line = indent + chunk;
      indent += '  ';
      return [line];
    }).join('\n');
    const tail = remaining.trim();
    return header + '\n' + formatted + '\n' + footer
      + (tail ? '\n\n' + formatReferenceSql(tail) : '');
  } catch {
    return sql;
  }
}
