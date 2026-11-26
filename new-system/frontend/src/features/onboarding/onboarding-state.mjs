export const emptyProgress = {homeTourVersion:0,workbenchTourVersion:0,lastSeenChangelog:'',updatedAt:''};

export function shouldOfferTour(saved,current,replay=false) {
  return replay || saved < current;
}

export function hasUnreadUpdates(seen,latest) {
  if (!latest || seen===latest) return false;
  if (!seen) return true;
  const saved=seen.split('.').map(Number);
  const current=latest.split('.').map(Number);
  for (let i=0;i<Math.max(saved.length,current.length);i++) {
    const diff=(current[i] ?? 0)-(saved[i] ?? 0);
    if (diff) return diff>0;
  }
  return false;
}

export function initialCenterTab(unread) {
  return unread ? 'updates' : 'guide';
}

export function advanceTour(step,action,count) {
  if (action==='skip' || (action==='next' && step===count-1)) return null;
  if (action==='back') return step<0 ? -1 : Math.max(0,step-1);
  return step+1;
}

export function mergeProgress(a,b) {
  const seen=b.lastSeenChangelog ?? '';
  return {
    homeTourVersion:Math.max(a.homeTourVersion,b.homeTourVersion ?? 0),
    workbenchTourVersion:Math.max(a.workbenchTourVersion,b.workbenchTourVersion ?? 0),
    lastSeenChangelog:hasUnreadUpdates(a.lastSeenChangelog,seen) ? seen : a.lastSeenChangelog,
    updatedAt:b.updatedAt ?? a.updatedAt,
  };
}
