import {useEffect,useState,useCallback} from 'react';
import {learningRequest,progressPath,type LearningProgress} from '../api/learning-api';

export function useLearningProgress(path=progressPath){
 const [progress,setProgress]=useState<LearningProgress|null>(null);
 const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const reload=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{let active=true;void learningRequest<LearningProgress>(path).then(value=>{if(active){setProgress(value);setError('')}}).catch(()=>{if(active)setError('学习进度暂时无法读取，请重试。')});return()=>{active=false}},[revision,path]);
 useEffect(()=>{window.addEventListener('learning-progress',reload);window.addEventListener('focus',reload);return()=>{window.removeEventListener('learning-progress',reload);window.removeEventListener('focus',reload)}},[reload]);
 return {progress,error,reload};
}
