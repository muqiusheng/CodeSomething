import type {Knowledge} from '../../api/learner-api';
export type Capability={title:string;stages:string[]};
export const capabilityGroups:{id:string;title:string;description:string;skills:Capability[]}[];
export function summarizeCapability(capability:{stages:string[]},knowledge:Knowledge[]):{state:string;sources:Knowledge[]};
