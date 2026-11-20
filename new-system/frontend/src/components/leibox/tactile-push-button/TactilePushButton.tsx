// Adapted from LeiBox Tactile Push Button. Community submission by 少荃 (Douyin: 宝龙体育优品小铺).
// Native link semantics replace the original standalone demo surface; original engine retained.
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import './tactile.css';
export function TactilePushButton({to,children}:{to:string;children:ReactNode}){return <Link to={to} className="tactile-button"><span className="button-outer"><span className="button-inner"><span>{children}</span></span></span></Link>}
