import {sessionState} from './browser-state.mjs';

type Snapshot<T> = {data: T | null; error: string};
export type ReadTrigger = 'mount' | 'focus' | 'explicit' | 'poll' | Event;
export type ReadOptions = {persist?: boolean; staleTime?: number};
type Entry = {
 snapshot: Snapshot<unknown>;
 serialized?: string;
 restored?: boolean;
 lastSuccess?: number;
 lastStarted?: number;
 pending?: Promise<void>;
 trigger?: ReadTrigger;
 revalidate?: (event: Event) => Promise<void>;
};

const empty: Snapshot<never> = {data:null,error:''};
const focusCooldown = 20_000;
const cacheKey = 'cs-read-snapshots-v1';
const ownerKey = 'cs-read-owner-v1';

export function createLearnerReadCache(initialScope: string | null, now = Date.now) {
 let scope: string | null = null;
 let persisted: Map<string,unknown> | undefined;
 const entries = new Map<string,Entry>();
 const listeners = new Set<() => void>();
 const notify = () => listeners.forEach(listener => listener());

 function activate(next: string | null) {
  try {
   const previous = scope ?? sessionState.getItem(ownerKey,'');
   if (previous && previous !== next) sessionState.removeItem(cacheKey,previous);
   if(next) sessionState.setItem(ownerKey,next,'');
   else sessionState.removeItem(ownerKey,'');
  } catch { /* The cache still works in memory when storage is blocked. */ }
 }
 if(initialScope) {activate(initialScope);scope=initialScope;}

 function saved() {
  if (!persisted) {
   persisted = new Map();
   if (scope) {
    try {
     const values = JSON.parse(sessionState.getItem(cacheKey,scope) ?? '[]') as [string,unknown][];
     persisted = new Map(values);
    } catch { /* A bad snapshot is recovered by the next successful read. */ }
   }
  }
  return persisted;
 }

 function entryFor(key: string, persist = false) {
  let entry = entries.get(key);
  if (!entry) {
   entry = {snapshot:empty};
   entries.set(key,entry);
  }
  if (persist && !entry.restored) {
   entry.restored = true;
   const data = saved().get(key);
   if (data != null && entry.snapshot === empty) {
    entry.serialized = JSON.stringify(data);
    entry.snapshot = {data,error:''};
   }
  }
  return entry;
 }

 function accept<T>(key: string, entry: Entry, data: T, persist: boolean) {
  const serialized = JSON.stringify(data);
  const changed = serialized !== entry.serialized || !!entry.snapshot.error;
  entry.lastSuccess = now();
  if (persist && scope) {
   const values = saved();
   if (!values.has(key) || changed) {
    values.delete(key);
    if(serialized && serialized.length <= 512_000 && data != null)values.set(key,data);
    while(values.size > 32) values.delete(values.keys().next().value!);
    let payload=JSON.stringify([...values]);
    while(payload.length > 2_000_000){
     values.delete(values.keys().next().value!);
     payload=JSON.stringify([...values]);
    }
    try {sessionState.setItem(cacheKey,payload,scope);} catch { /* Browser quota or storage access. */ }
   }
  }
  if(changed){
   entry.serialized = serialized;
   entry.snapshot = {data,error:''};
   notify();
  }
 }

 function load<T>(key: string, request: (previous: T | null, trigger: ReadTrigger) => T | Promise<T>, trigger: ReadTrigger = 'mount', {persist = false,staleTime = focusCooldown}: ReadOptions = {}) {
   if(!scope) return Promise.resolve();
   const entry = entryFor(key,persist);
   entry.revalidate = event => load(key,request,event,{persist,staleTime});
   const background = trigger === 'focus' || trigger === 'mount' || trigger === 'poll';
   if (entry.pending && (background || typeof trigger !== 'string' && trigger === entry.trigger)) return entry.pending;
   if (trigger === 'mount' && entry.lastSuccess !== undefined && now() - entry.lastSuccess < staleTime) return Promise.resolve();
   if (trigger === 'focus' && entry.lastStarted !== undefined && now() - entry.lastStarted < focusCooldown) return Promise.resolve();

   entry.lastStarted = now();
   entry.trigger = trigger;
   const isCurrent = () => entries.get(key) === entry && entry.pending === pending;
   const pending = Promise.resolve().then(async () => {
    if (!isCurrent()) return;
    try {
     const data = await request(entry.snapshot.data as T | null,trigger);
     if (isCurrent()) accept(key,entry,data,persist);
    } catch (failure) {
     if (!isCurrent() || entry.snapshot.data !== null) return;
     const error = failure instanceof Error && failure.message ? failure.message : '读取失败，请重试。';
     if (error !== entry.snapshot.error) {
      entry.snapshot = {data:null,error};
      notify();
     }
    } finally {
     if (isCurrent()) entry.pending = undefined;
    }
   });
   entry.pending = pending;
   if (entry.snapshot.error && trigger === 'explicit') {
    entry.snapshot = empty;
    notify();
   }
   return pending;
  }

 return {
  setScope(next: string | null) {
   if (next === scope) return;
   activate(next);
   scope = next;
   persisted = undefined;
   entries.clear();
   notify();
  },
  subscribe(listener: () => void) {
   listeners.add(listener);
   return () => {listeners.delete(listener);};
  },
  revalidateKnown(matches: (key: string) => boolean,event: Event) {
   const pending: Promise<void>[] = [];
   for(const [key,entry] of entries) {
    if(!matches(key))continue;
    entry.lastSuccess = undefined;
    if(entry.revalidate)pending.push(entry.revalidate(event));
   }
   return Promise.all(pending);
  },
  read<T>(key: string | null, {persist = false}: ReadOptions = {}): Snapshot<T> {
   return (key === null || !scope ? empty : entryFor(key,persist).snapshot) as Snapshot<T>;
  },
  replace<T>(key: string, data: T, expectedScope: string | null, {persist = false}: ReadOptions = {}) {
   if(!scope || expectedScope !== scope) return;
   const entry = entryFor(key,persist);
   entry.pending = undefined;
   accept(key,entry,data,persist);
  },
  load,
 };
}
