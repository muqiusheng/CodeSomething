export type TourKind='home'|'workbench';
type Step={target:string;title:string;description:string};
export const tours={
  home:{version:1,field:'homeTourVersion',steps:[
    {target:'home-hero',title:'从上次的实验继续',description:'首页会优先显示尚未完成的必做实验。点击主卡就能继续。'},
    {target:'home-trail',title:'查看七次实验进度',description:'进度条显示每个实验的必做完成度，点击任意实验可直接打开。'},
    {target:'home-interactions',title:'先试跑，再去复习',description:'在 SQL 沙盒切换查询并查看结果。旁边的复习雷达可打开实验错题与模拟卷。'},
    {target:'home-tools',title:'常用工具就在顶栏',description:'从导航打开「我的收藏」，按 Ctrl + K 快速前往页面。配色按钮可切换九套主题和明暗模式。'},
  ]},
  workbench:{version:1,field:'workbenchTourVersion',steps:[
    {target:'workbench-prompt',title:'先读题，再看表结构',description:'左侧题号目录可展开或收起。点开题干中的数据表，可查看表结构和样例。'},
    {target:'workbench-editor',title:'运行 SQL 并查看判分',description:'按 Ctrl + Enter 运行并判分。结果区可以放大，练题时也可展开参考答案和解析。'},
    {target:'workbench-bookmark',title:'把好题收进收藏',description:'点题目旁的收藏按钮。换设备登录后，可从「我的收藏」回到原题。'},
  ]},
} satisfies Record<TourKind,{version:number;field:'homeTourVersion'|'workbenchTourVersion';steps:Step[]}>;
