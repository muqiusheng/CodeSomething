import {useCallback} from 'react';
import {learningRequest,progressPath,type LearningProgress} from '../api/learning-api';
import {useScopedRead} from './useScopedRead';

export function useLearningProgress(path=progressPath){
 const request=useCallback(()=>learningRequest<LearningProgress>(path),[path]);
 const {data,error,reload}=useScopedRead(path,request,{persist:true,refreshOnFocus:true});
 return {progress:data,error:error?'学习进度暂时无法读取，请重试。':'',reload};
}
