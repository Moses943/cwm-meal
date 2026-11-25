'use client';
import { useEffect, useRef } from 'react';
// Looping nature video wallpaper carried over from the CWM MEAL app.
export default function Background() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const v = ref.current; if (v) { v.muted = true; v.play().catch(() => {}); } }, []);
  return (<>
    <video ref={ref} className="bgv" src="/wallpaper.mp4" poster="/wallpaper-poster.jpg" autoPlay muted loop playsInline preload="auto" aria-hidden="true" />
    <div className="bgs" />
  </>);
}
