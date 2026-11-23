import {BrandMark} from '../layout/BrandMark';

export function BrandSplashLoading({label}: {label:string}) {
 return <main className="access-shell access-startup">
  <div className="loading-splash">
   <div className="loading-brand" aria-hidden="true">
    <BrandMark/>
    <svg className="loading-brand-orbit" viewBox="0 0 64 64" fill="none" focusable="false">
     <circle cx="32" cy="32" r="29"/>
     <circle className="loading-brand-arc" cx="32" cy="32" r="29" pathLength="100"/>
    </svg>
   </div>
   <p role="status">{label}</p>
  </div>
 </main>;
}

export function InlineSpinner({active = true}: {active?:boolean}) {
 return <span className={active?'loading-spinner':'loading-spinner-slot'} aria-hidden="true"/>;
}

export function PulseDots() {
 return <span className="loading-dots" aria-hidden="true"><i/><i/><i/></span>;
}

export function LoadingLines({widths}: {widths:readonly number[]}) {
 return <div className="loading-lines" aria-hidden="true">
  {widths.map((width,index)=><span className="loading-line" key={index} style={{width:width+'%'}}/>)}
 </div>;
}

type Variant = 'page' | 'course' | 'cards' | 'profile' | 'table' | 'editor' | 'inline';
const cardLines = [[32,74,55],[41,82,65],[26,64,47]];

export function PageSkeleton({variant,label,className = ''}: {variant:Variant; label:string; className?:string}) {
 return <div className={`loading-state loading-state--${variant} ${className}`}>
  <p className="sr-only" role="status">{label}</p>
  <div className="loading-shapes loading-delay" aria-hidden="true">
   {(variant === 'page' || variant === 'course') && <>
    <header className="loading-page-heading"><LoadingLines widths={variant==='course'?[16,36]:[30,22]}/></header>
    <div className="loading-surface loading-page-content">
     <div className="loading-page-tabs"><LoadingLines widths={[16,12,18]}/></div>
     <LoadingLines widths={[38,83,74,61,31,68]}/>
    </div>
   </>}
   {(variant === 'cards' || variant === 'profile') && <>
    <div className="loading-card-grid">{cardLines.map((widths,index)=>
     <div className="loading-surface" key={index}><LoadingLines widths={widths}/></div>)}</div>
    {variant === 'profile' && <div className="loading-surface"><LoadingLines widths={[27,64,51,38]}/></div>}
   </>}
   {variant === 'table' && <div className="loading-surface loading-table">
    {[0,1,2,3].map(index=><div className="loading-row" key={index}><LoadingLines widths={index%2?[54,28,17]:[43,34,22]}/></div>)}
   </div>}
   {variant === 'editor' && <LoadingLines widths={[21,45,56,39,29]}/>}
   {variant === 'inline' && <LoadingLines widths={[38,57]}/>}
  </div>
 </div>;
}
