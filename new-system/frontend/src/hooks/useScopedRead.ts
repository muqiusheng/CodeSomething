import {useCallback,useEffect,useSyncExternalStore} from 'react';
import {currentAccess,onAccessChange} from '../api/auth-api';
import {createLearnerReadCache,type ReadOptions,type ReadTrigger} from '../api/learner-read-cache';

function accessScope() {
 const {user,config,loading} = currentAccess();
 if (loading || !config) return null;
 return user ? user.role + ':' + user.userId : config?.enabled ? 'guest' : 'local';
}

const cache = createLearnerReadCache(accessScope());
onAccessChange(() => cache.setScope(accessScope()));
window.addEventListener('learning-progress', event => {
 const course = event instanceof CustomEvent && typeof event.detail==='string' ? event.detail : undefined;
 void cache.revalidateKnown(key =>
  key === '/learning/continue' ||
  key === 'home:module-counts' && course !== 'school' ||
  key.startsWith('/learning/progress/') && (!course || key.startsWith('/learning/progress/'+course+'/')) ||
  key.startsWith('/learner/') && key !== '/learner/adjustments' ||
  key === '/portfolio' && (!course || course === 'portfolio') ||
  key === '/api/school/courses' && (!course || course === 'school'),event);
});
window.addEventListener('learner-data', event => {
 void cache.revalidateKnown(key => key.startsWith('/learner/'),event);
});
window.addEventListener('learning-position', event => {
 void cache.revalidateKnown(key => key === '/learning/continue',event);
});

export const visibleRefreshInterval = 120_000;

export async function readScopedData<T>(key: string, request: () => Promise<T>, trigger: ReadTrigger, options: ReadOptions = {}) {
 const scope=accessScope();
 await cache.load(key,request,trigger,options);
 return scope===accessScope()?cache.read<T>(key,options).data:null;
}

type Options = ReadOptions & {refreshOnFocus?: boolean; interval?: number};

export function useScopedRead<T>(
 key: string | null,
 request: (previous: T | null, trigger: ReadTrigger) => Promise<T>,
 {persist = false,staleTime,refreshOnFocus = false,interval = 0}: Options = {},
) {
 const scope = useSyncExternalStore(onAccessChange,accessScope);
 const getSnapshot = useCallback(() => cache.read<T>(key,{persist}),[key,persist]);
 const snapshot = useSyncExternalStore(cache.subscribe,getSnapshot);
 const reload = useCallback(() => {
  if (key !== null && scope === accessScope()) return cache.load(key,request,'explicit',{persist,staleTime});
 },[key,request,scope,persist,staleTime]);
 const setData = useCallback((data: T) => {
  if (key !== null) cache.replace(key,data,scope,{persist});
 },[key,scope,persist]);

 useEffect(() => {
  if (key === null || !scope) return;
  const path = key;
  const options = {persist,staleTime};
  let active = true;
  let timer: number | undefined;
  async function load(trigger: 'mount' | 'poll') {
   if(trigger==='mount'||document.visibilityState==='visible')await cache.load(path,request,trigger,options);
   if (active && interval) timer = window.setTimeout(() => void load('poll'),interval);
  }
  function onFocus() {
   if (document.visibilityState === 'visible') void cache.load(path,request,'focus',options);
  }
  void load('mount');
  if (refreshOnFocus) {
   window.addEventListener('focus',onFocus);
   document.addEventListener('visibilitychange',onFocus);
  }
  return () => {
   active = false;
   window.clearTimeout(timer);
   window.removeEventListener('focus',onFocus);
   document.removeEventListener('visibilitychange',onFocus);
  };
 },[key,request,scope,persist,staleTime,refreshOnFocus,interval]);

 return {...snapshot,reload,setData};
}
