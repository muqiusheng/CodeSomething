export type Progress = {homeTourVersion:number;workbenchTourVersion:number;lastSeenChangelog:string;updatedAt:string};
export const emptyProgress: Progress;
export function shouldOfferTour(saved:number,current:number,replay?:boolean):boolean;
export function hasUnreadUpdates(seen:string,latest:string):boolean;
export function advanceTour(step:number,action:'back'|'next'|'skip',count:number):number|null;
export function mergeProgress(a:Progress,b:Partial<Progress>):Progress;
export type CenterTab = 'guide' | 'updates';
export function initialCenterTab(unread:boolean):CenterTab;
