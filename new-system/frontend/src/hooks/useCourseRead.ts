import {useCallback} from 'react';
import {learningRequest} from '../api/learning-api';
import {useScopedRead} from './useScopedRead';

export function useCourseRead<T>(path: string | null) {
 const request = useCallback(() => learningRequest<T>(path!),[path]);
 return useScopedRead(path,request,{persist:true,staleTime:60_000});
}
