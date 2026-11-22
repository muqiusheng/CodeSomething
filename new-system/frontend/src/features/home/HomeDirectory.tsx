import {ArrowRight,BookOpen,Boxes,Route} from 'lucide-react';
import {Link} from 'react-router-dom';

const destinations=[
 {to:'/path',title:'学习路径',description:'看清当前阶段和下一步',icon:Route,tone:'primary'},
 {to:'/learn/journey',title:'全部课次',description:'按章节找到要学的一节',icon:BookOpen,tone:'secondary'},
 {to:'/projects',title:'项目库',description:'查看各项目要做出的成果',icon:Boxes,tone:'accent'},
] as const;

export function HomeDirectory(){
 return <nav className="learning-home-directory" aria-label="学习目录">
  {destinations.map(({to,title,description,icon:Icon,tone})=><Link key={to} to={to} className="home-directory-link" data-tone={tone}>
   <span className="home-directory-icon"><Icon size={23} aria-hidden="true"/></span>
   <span className="home-directory-copy"><strong>{title}</strong><span>{description}</span></span>
   <ArrowRight className="home-directory-arrow" size={17} aria-hidden="true"/>
  </Link>)}
 </nav>;
}
