export function currentLabGrade(labId, question, work, sql = work.drafts[question.id]) {
  const execution = work.executions[question.id];
  if (!execution || execution.sql !== sql) return undefined;
  const grade = execution.grade;
  if (question.gradingRevision && grade?.question.id !== labId+'-'+question.id+'-'+question.gradingRevision) return undefined;
  return grade;
}

export function justCompletedLab(labId, required, before, after, submittedId, passed) {
  const submitted = required.find(question => question.id === submittedId);
  const correct = (question, work) => currentLabGrade(labId, question, work)?.status === 'correct';
  return passed && !!submitted && !correct(submitted, before)
    && required.every(question => correct(question, after));
}
