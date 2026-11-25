import {useEffect,useRef,useState} from 'react';
import {localState} from '../../api/browser-state.mjs';

export const celebrations = {
  classic: '经典多彩纸屑',
  double: '左右双礼炮',
  stars: '星光几何彩带',
  green: '清新绿金',
  off: '关闭彩带',
} as const;
export type CelebrationStyle = keyof typeof celebrations;
type EffectStyle = Exclude<CelebrationStyle, 'off'>;
const key = 'cs-lab-celebration';
export const celebrationPalettes: Record<EffectStyle, string[]> = {
  classic: ['#ff5478','#59b9ff','#ffcb55','#69e4a8','#ad8bff'],
  double: ['#ff6c57','#ffb84d','#55dbff','#638aff'],
  stars: ['#ffcd62','#d2a0ff','#7f96ff','#75e0ed'],
  green: ['#27946e','#55cf9a','#afe4b6','#ffc456','#fce094'],
};

function readPreference(): CelebrationStyle {
  try {
    const saved = localState.getItem(key);
    if (saved && Object.hasOwn(celebrations, saved)) return saved as CelebrationStyle;
  } catch { /* Fall back to the default in this tab. */ }
  return 'classic';
}

function animate(style: EffectStyle, preview: boolean, onStop: () => void) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.className = 'lab-celebration';
  canvas.setAttribute('aria-hidden','true');
  context.scale(scale, scale);
  document.body.append(canvas);

  const colors = celebrationPalettes[style];
  const particles = Array.from({length: preview ? 60 : 124}, (_, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const speed = Math.sqrt(height / 850);
    return {
      x: width * (style === 'double' ? side === 1 ? .08 : .92 : .5) + (Math.random() - .5) * width * .12,
      vx: style === 'double' ? side * (60 + Math.random() * 340) : (Math.random() - .5) * Math.min(width, 1100) * .8,
      vy: -(330 + Math.random() * 410) * speed,
      size: 4 + Math.random() * 7,
      angle: Math.random()*Math.PI,
      spin: (Math.random() - .5) * 13,
      delay: Math.random() * .24,
      color: colors[index % colors.length],
      shape: style === 'stars' ? index % 3 : style === 'green' ? 2 : 0,
    };
  });
  const duration = 2450;
  const gravity = 610;
  const start = performance.now();
  let frame = 0;

  function stop() {
    cancelAnimationFrame(frame);
    canvas.remove();
    canvas.width = 0;
    canvas.height = 0;
    onStop();
  }
  function draw(now: number) {
    const elapsed = now - start;
    if (elapsed >= duration) {stop(); return;}
    context!.clearRect(0, 0, width, height);
    context!.globalAlpha = Math.min(1, (duration - elapsed) / 700);
    for (const particle of particles) {
      const t = elapsed/1000 - particle.delay;
      if (t < 0) continue;
      const y = height + 12 + particle.vy * t + gravity * t * t / 2;
      context!.save();
      context!.translate(particle.x + particle.vx*t + Math.sin(t*5+particle.angle)*13, y);
      context!.rotate(particle.angle + particle.spin*t);
      context!.fillStyle = particle.color;
      const radius = particle.size;
      if (particle.shape === 1) {
        context!.beginPath();
        for (let point = 0; point < 10; point++) {
          const angle = point * Math.PI / 5;
          const length = point % 2 ? radius * .43 : radius;
          context!.lineTo(Math.cos(angle)*length, Math.sin(angle)*length);
        }
        context!.closePath();
        context!.fill();
      } else if (particle.shape === 2) {
        context!.beginPath();
        context!.ellipse(0, 0, radius * .8, radius * .35, 0, 0, Math.PI*2);
        context!.fill();
      } else {
        context!.fillRect(-radius/2, -radius/4, radius, radius/2);
      }
      context!.restore();
    }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  return stop;
}

export function useLabCelebration() {
  const [style,setStyle] = useState(readPreference);
  const stop = useRef<() => void>(undefined);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => {if (reduced.matches) stop.current?.();};
    reduced.addEventListener('change',cancel);
    return () => {mounted.current = false; stop.current?.(); reduced.removeEventListener('change',cancel);};
  },[]);

  function play(next = style, preview = false) {
    stop.current?.();
    if (!mounted.current || next === 'off' || document.documentElement.dataset.motion === 'reduce'
      || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    stop.current = animate(next,preview,()=>{stop.current = undefined;});
  }
  function choose(next: CelebrationStyle) {
    setStyle(next);
    try {localState.setItem(key,next);} catch { /* The selection still works in this tab. */ }
    play(next,true);
  }
  return {style,play,choose};
}
