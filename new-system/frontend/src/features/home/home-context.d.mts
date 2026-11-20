import type {LearningResume} from '../../api/learning-api';
export function homeContext(resume:LearningResume|null,lesson?:{courseId:string;title:string;number:number;href:string;updatedAt:number;working?:boolean;outcome?:string}):{courseId:string;title:string;projectHref:string;development:string;href:string;action:string;location:string;links:{title:string;to:string}[];firstVisit?:boolean};
