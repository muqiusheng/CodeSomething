import {hasUnreadUpdates} from './onboarding-state.mjs';

type FeatureUpdate = {
  version:string;date:string;title:string;description:string;href:string;actionLabel:string;
};

// Append an entry with a greater dotted numeric version to publish another update.
const updates = [
  {version:'2026.11.26.4',date:'2026-11-26',title:'收藏可以跨设备查看',description:'收藏实验题、错题和课外项目。换设备登录后，点收藏就能回到原位置。',href:'/bookmarks',actionLabel:'打开我的收藏'},
  {version:'2026.11.26.3',date:'2026-11-26',title:'数据库练习分为实验回顾和考试冲刺',description:'可逐题回顾实验，也可进入模拟考场。练题时可以按需打开参考答案和解析。',href:'/school',actionLabel:'打开课内实验'},
  {version:'2026.11.26.2',date:'2026-11-26',title:'必做题全通后可自选彩带',description:'进入实验工作台后，在「更多」中可预览、更换或关闭通关彩带。',href:'/school',actionLabel:'选择实验'},
  {version:'2026.11.26.1',date:'2026-11-26',title:'九套配色与明暗模式',description:'顶栏可以切换配色，浅色、深色和跟随系统可单独调整。',href:'/settings#appearance',actionLabel:'打开外观设置'},
] satisfies FeatureUpdate[];

export const changelog=[...updates].sort((a,b)=>
  hasUnreadUpdates(a.version,b.version)?1:hasUnreadUpdates(b.version,a.version)?-1:0);
export const LATEST_CHANGELOG_VERSION=changelog[0].version;
