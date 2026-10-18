import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { Settings } from '../../shared/model.ts';
import { DEFAULT_SETTINGS, REFERENCE_REM_PX } from '../../shared/settings.ts';

/** Space between the end of the text and the copy that follows it, in rem. */
const GAP = 3;
const FADE = 'linear-gradient(to right, black calc(100% - 1.5rem), transparent)';
const canAnimate = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

export const MarqueeSettings = createContext<Settings>(DEFAULT_SETTINGS);

/** Told how long a full scroll cycle lasts (ms), so a page of cards can stay up until it ends. */
export const MarqueeCycle = createContext<((ms: number) => void) | null>(null);

/**
 * One line of text that scrolls when it doesn't fit its space: it waits at the start, then moves left
 * until a copy of the text has taken its place, so the loop starts again without a jump.
 * Without the Web Animations API (some old TV browsers) the text is cut with an ellipsis instead.
 */
export function Marquee({ text, className = '' }: { text: string; className?: string }) {
  const { marqueeSpeed, marqueePause } = useContext(MarqueeSettings);
  const reportCycle = useContext(MarqueeCycle);
  const box = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLSpanElement>(null);
  /** Width of the text in px when it doesn't fit, 0 when it does. */
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const boxElement = box.current;
    const textElement = first.current;
    if (!boxElement || !textElement) return;
    const measure = () => {
      const width = textElement.offsetWidth;
      setOverflow(width > boxElement.clientWidth + 1 ? width : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(boxElement);
    observer.observe(textElement);
    return () => observer.disconnect();
  }, [text]);

  useLayoutEffect(() => {
    const trackElement = track.current;
    if (!overflow || !trackElement) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const distance = overflow + GAP * rem;
    const speed = (marqueeSpeed * rem) / REFERENCE_REM_PX; // px per second at this screen's size
    const waiting = marqueePause * 1000;
    const duration = waiting + (distance / speed) * 1000;
    const animation = trackElement.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: waiting / duration },
        { transform: `translateX(${-distance}px)`, offset: 1 },
      ],
      { duration, iterations: Infinity, easing: 'linear' },
    );
    reportCycle?.(duration);
    return () => animation.cancel();
  }, [overflow, marqueeSpeed, marqueePause, reportCycle]);

  if (!canAnimate) return <span className={`block truncate ${className}`}>{text}</span>;
  return (
    <span
      ref={box}
      className={`block overflow-hidden whitespace-nowrap ${className}`}
      // A soft right edge tells the text goes on, like an ellipsis would.
      style={overflow > 0 ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
    >
      <span ref={track} className="inline-block will-change-transform">
        <span ref={first} className="inline-block">
          {text}
        </span>
        {overflow > 0 && (
          <span aria-hidden="true" className="inline-block" style={{ paddingLeft: `${GAP}rem` }}>
            {text}
          </span>
        )}
      </span>
    </span>
  );
}

/** Font sizes tried between `size` and `minSize`, largest first. */
const FIT_STEPS = 6;
const FADE_DOWN = 'linear-gradient(to bottom, black calc(100% - 1.5rem), transparent)';

/**
 * Text wrapped on up to `lines` lines. When it doesn't fit, it shrinks in steps from `size` down to
 * `minSize` (rem); past that it scrolls up, like `Marquee` does sideways: it waits at the start, then
 * moves up until a copy of the text has taken its place.
 */
export function FitText({ text, lines, size, minSize, leading, className = '' }: {
  text: string;
  lines: number;
  size: number;
  minSize: number;
  /** Line height, relative to the font size. */
  leading: number;
  className?: string;
}) {
  const { marqueeSpeed, marqueePause } = useContext(MarqueeSettings);
  const reportCycle = useContext(MarqueeCycle);
  const box = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ size, overflow: 0 });
  /** The space for the text, in rem: `lines` lines at the largest size. */
  const maxHeight = lines * leading * size;

  useLayoutEffect(() => {
    const boxElement = box.current;
    const textElement = first.current;
    if (!boxElement || !textElement) return;
    // Keeps the same object when nothing changed, so the animation isn't restarted.
    const update = (next: { size: number; overflow: number }) =>
      setFit((prev) => (prev.size === next.size && prev.overflow === next.overflow ? prev : next));
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const limit = maxHeight * rem + 1;
      for (let i = 0; i <= FIT_STEPS; i++) {
        const candidate = size - ((size - minSize) * i) / FIT_STEPS;
        boxElement.style.fontSize = `${candidate}rem`;
        if (textElement.offsetHeight <= limit) return update({ size: candidate, overflow: 0 });
      }
      update({ size: minSize, overflow: canAnimate ? textElement.offsetHeight : 0 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(boxElement);
    return () => observer.disconnect();
  }, [text, size, minSize, maxHeight]);

  useLayoutEffect(() => {
    const trackElement = track.current;
    if (!fit.overflow || !trackElement) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const distance = fit.overflow + leading * minSize * rem;
    const speed = (marqueeSpeed * rem) / REFERENCE_REM_PX;
    const waiting = marqueePause * 1000;
    const duration = waiting + (distance / speed) * 1000;
    const animation = trackElement.animate(
      [
        { transform: 'translateY(0)', offset: 0 },
        { transform: 'translateY(0)', offset: waiting / duration },
        { transform: `translateY(${-distance}px)`, offset: 1 },
      ],
      { duration, iterations: Infinity, easing: 'linear' },
    );
    reportCycle?.(duration);
    return () => animation.cancel();
  }, [fit, leading, minSize, marqueeSpeed, marqueePause, reportCycle]);

  return (
    <span
      ref={box}
      className={`block overflow-hidden ${className}`}
      style={{
        fontSize: `${fit.size}rem`,
        lineHeight: leading,
        maxHeight: `${maxHeight}rem`,
        ...(fit.overflow > 0 ? { height: `${maxHeight}rem`, maskImage: FADE_DOWN, WebkitMaskImage: FADE_DOWN } : {}),
      }}
    >
      <span ref={track} className="block will-change-transform">
        <span ref={first} className="block">
          {text}
        </span>
        {fit.overflow > 0 && (
          <span aria-hidden="true" className="block" style={{ paddingTop: `${leading}em` }}>
            {text}
          </span>
        )}
      </span>
    </span>
  );
}
