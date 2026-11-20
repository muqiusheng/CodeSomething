import {useEffect, useLayoutEffect, useState} from 'react';
import {Link, useLocation, useNavigate, useNavigationType} from 'react-router-dom';
import {ArrowLeft, ArrowRight} from 'lucide-react';

type Trail = {keys: string[]; index: number};
const storageKey = 'cs-navigation-trail';

function restore(key: string): Trail {
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  // A fresh address-bar entry has no known forward branch. Restore only a reload
  // or browser traversal, so unrelated history cannot enable our controls.
  if (entry?.type === 'navigate') return {keys: [key], index: 0};
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as Trail | null;
    if (stored && Array.isArray(stored.keys) && stored.keys.every(value => typeof value === 'string') && stored.keys.length <= window.history.length) {
      const index = stored.keys.indexOf(key);
      if (index >= 0) return {keys: stored.keys, index};
    }
  } catch { /* A fresh page still has working links when storage is unavailable. */ }
  return {keys: [key], index: 0};
}

function advance(trail: Trail, key: string, action: string): Trail {
  if (trail.keys[trail.index] === key) return trail;
  if (action === 'PUSH') return {keys: [...trail.keys.slice(0, trail.index + 1), key], index: trail.index + 1};
  if (action === 'REPLACE') return {keys: trail.keys.map((value, index) => index === trail.index ? key : value), index: trail.index};
  const index = trail.keys.indexOf(key);
  return index >= 0 ? {...trail, index} : {keys: [key], index: 0};
}

export function HeaderNavigation() {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const [trail, setTrail] = useState(() => restore(location.key));
  useLayoutEffect(() => { setTrail(previous => advance(previous, location.key, action)); }, [location.key, action]);
  useEffect(() => {try {sessionStorage.setItem(storageKey, JSON.stringify(trail));} catch { /* Navigation remains available in memory. */ }}, [trail]);

  return <div className="header-navigation">
    {location.pathname.startsWith('/learn/')&&<><Link className="coding-brand" to="/learn">CodeSomething<span>.</span></Link><nav className="coding-quick-links" aria-label="学习导航"><Link to="/path">学习路径</Link><Link to="/projects">项目</Link></nav></>}
    <div className="history-controls" role="group" aria-label="浏览历史">
      <button type="button" aria-label="后退" title="后退" disabled={trail.index === 0} onClick={() => navigate(-1)}><ArrowLeft size={17} aria-hidden="true"/></button>
      <button type="button" aria-label="前进" title="前进" disabled={trail.index >= trail.keys.length - 1} onClick={() => navigate(1)}><ArrowRight size={17} aria-hidden="true"/></button>
    </div>

  </div>;
}
