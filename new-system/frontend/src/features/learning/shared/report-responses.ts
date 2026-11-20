export type ActualResponse={label:string;status:number|null;raw:string;data:unknown;passed:boolean};
export function reportResponses(assertions:{name:string;actual:string;passed:boolean}[]):ActualResponse[]{
 const groups=new Map<string,ActualResponse>();
 for(const a of assertions){
  const request=a.name.match(/(?:GET|POST|PUT|DELETE|PATCH)\s+\S+/)?.[0];
  const status=a.actual.match(/^HTTP\s+(\d{3})/);
  if(!request&&!status)continue;
  const label=request||a.name;
  const row=groups.get(label)||{label,status:null,raw:'',data:null,passed:true};
  row.passed&&=a.passed;
  if(status)row.status=Number(status[1]);
  const start=a.actual.search(/[\[{]/);
  if(start>=0){const raw=a.actual.slice(start);try{row.data=JSON.parse(raw);row.raw=raw}catch{if(!row.raw)row.raw=raw}}
  groups.set(label,row);
 }
 return [...groups.values()];
}
