export const paletteDetails = {
  emerald: {name: '云杉翡翠', detail: '翡翠青 · 靛蓝 · 琥珀橙', badge: '默认主配色'},
  indigo: {name: '靛蓝极客', detail: '皇家靛蓝 · 冰青蓝 · 柔紫'},
  terracotta: {name: '暖砂琥珀', detail: '陶土焦糖 · 森林绿 · 暖金'},
  ocean: {name: '深海晴空', detail: '深海蔚蓝 · 薄荷青 · 珊瑚橙'},
  graphite: {name: '极昼极夜', detail: '曜石黑白 · 钴蓝高亮 · 翠绿'},
  forest: {name: '松林苔原', detail: '松针深绿 · 暖木棕 · 麦金'},
  rose: {name: '暮光樱桃', detail: '宝石玫红 · 紫罗兰 · 暖琥珀'},
  amber: {name: '黑金律动', detail: '琥珀暖金 · 青玉色 · 珊瑚红'},
  'cupcake-synthwave': {name: '薄荷霓虹', detail: '薄荷绿 · 樱花粉 · 赛博深紫（原版配色）', badge: '经典保留'},
};

export type PaletteId = keyof typeof paletteDetails;
