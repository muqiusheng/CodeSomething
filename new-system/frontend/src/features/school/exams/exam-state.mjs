export function answerState(question, answer = []) {
  const filled = answer.filter(value => value.trim() !== '').length;
  if (!filled) return '未答';
  return question.kind === 'blank' && filled < question.blankCount ? '部分已答' : '已答';
}

export function remainingTime(startedAt, minutes, now) {
  return minutes ? Math.max(0, Math.ceil((startedAt + minutes * 60_000 - now) / 1000)) : null;
}

export function restoreDraft(draft, encoded) {
  if (!encoded) return draft;
  try {
    const stored = JSON.parse(encoded);
    if (stored.revision === draft.revision && stored.answers && Array.isArray(stored.stars))
      return {...draft, answers:stored.answers, stars:stored.stars};
  } catch {
    return draft;
  }
  return draft;
}

export function screenPosition(questions, current, predicate) {
  for (let n = 1; n <= questions.length; n++) {
    const index = (n + current) % questions.length;
    if (predicate(questions[index])) return index;
  }
  return -1;
}


export function debugRunMode(selection) {
  return selection?.trim() ? 'selection' : 'run';
}

export function sqlItemDiagnostic(item) {
  if (!item) return null;
  if (item.sqlError) return item.sqlError;
  const check = (item.checks ?? []).find(entry => entry.status !== 'passed' && (entry.errorLine ?? 0) > 0);
  if (!check) return null;
  return {line: check.errorLine ?? 0, code: 0, raw: check.message ?? '', advice: check.advice ?? ''};
}

export function sqlErrorLine(item) {
  const diagnostic = sqlItemDiagnostic(item);
  return diagnostic && diagnostic.line > 0 ? diagnostic.line : undefined;
}

export function isDuplicateSqlErrorCheck(check, diagnostic) {
  if (!diagnostic || !check || check.status === 'passed') return false;
  if (check.diff || check.expected?.length || check.actual?.length) return false;
  const combined = `${diagnostic.raw ?? ''} ${diagnostic.advice ?? ''}`.trim();
  return check.message === diagnostic.raw
    || (combined !== '' && check.message === combined)
    || (diagnostic.line > 0 && check.errorLine === diagnostic.line);
}

export function primaryQueryPreview(item) {
  if (!item || item.question?.kind !== 'sql') return null;
  return (item.checks ?? []).find(check =>
    check.status === 'passed'
    && (check.actual?.length ?? 0) > 0
    && (check.kind === 'result_set' || (!check.kind && check.label === '种子数据结果'))) ?? null;
}
