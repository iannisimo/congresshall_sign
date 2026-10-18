import { useLayoutEffect, useRef, useState } from 'react';
import type { ScheduledEvent, Settings } from '../../shared/model.ts';
import { CARD_HEIGHT, CARD_WIDTH, EventCard } from '../sign/EventCard.tsx';
import { MarqueeSettings } from '../sign/Marquee.tsx';

/** An event card exactly as the sign draws it, scaled down to the available width. */
export function SignCardPreview({
  event,
  roomNames,
  now,
  settings,
}: {
  event: ScheduledEvent;
  roomNames: string[];
  now: number;
  settings: Settings;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const measure = () => setScale(element.clientWidth / (CARD_WIDTH * rem));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="rounded-xl bg-canvas p-3">
      <div ref={ref} style={{ height: `${CARD_HEIGHT * scale}rem` }}>
        <div className="origin-top-left" style={{ width: `${CARD_WIDTH}rem`, transform: `scale(${scale})` }}>
          <MarqueeSettings.Provider value={settings}>
            <EventCard event={event} roomNames={roomNames} now={now} />
          </MarqueeSettings.Provider>
        </div>
      </div>
    </div>
  );
}
