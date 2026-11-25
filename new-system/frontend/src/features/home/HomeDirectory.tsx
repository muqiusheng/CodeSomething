import {ArrowRight,Bookmark,GraduationCap,RotateCcw} from 'lucide-react';
import {Link} from 'react-router-dom';

const destinations=[
 {to:'/school',title:'课内实验',description:'按课次练习，查看必做进度',icon:GraduationCap,tone:'primary'},
 {to:'/reviews',title:'复习与错题',description:'回顾错题，做专项练习与模拟卷',icon:RotateCcw,tone:'secondary'},
 {to:'/bookmarks',title:'我的收藏',description:'回看收藏的题目与章节',icon:Bookmark,tone:'accent'},
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
