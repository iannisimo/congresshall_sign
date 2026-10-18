import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { LogoCrop } from '../../shared/schemas.ts';
import { Button, Dialog } from './ui.tsx';

/** Side of the square frame, in CSS px. */
const FRAME = 320;
/** How close (CSS px) an edge or the centre must come to a guide to snap to it. */
const SNAP = 6;
const CHECKERBOARD = 'repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 0 0 / 16px 16px';

type Guide = 'start' | 'centre' | 'end';

/** A stretch of the image on one axis, in frame px from the image's own edge. */
interface Span {
  offset: number;
  length: number;
}

/**
 * Where an image placed at `at` snaps on one axis, and the guide it snaps to: any of `spans` (the logo
 * itself, the whole image) centred in the frame or touching one of its edges.
 */
function snap(at: number, spans: Span[]): { at: number; guide: Guide | null } {
  let best: { at: number; guide: Guide | null } = { at, guide: null };
  let distance = SNAP;
  for (const { offset, length } of spans) {
    const options: [number, Guide][] = [
      [(FRAME - length) / 2, 'centre'],
      [0, 'start'],
      [FRAME - length, 'end'],
    ];
    for (const [target, guide] of options) {
      const imageAt = target - offset;
      if (Math.abs(at - imageAt) < distance) {
        distance = Math.abs(at - imageAt);
        best = { at: imageAt, guide };
      }
    }
  }
  return best;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The part of the image that is the logo, in natural px: what differs from the top-left pixel (the
 * background, as the server's trim sees it) and isn't transparent. The whole image when it can't be read,
 * e.g. from another site that doesn't allow it.
 */
function contentBox(image: HTMLImageElement): Box {
  const whole = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
  try {
    const k = Math.min(1, 256 / Math.max(whole.w, whole.h));
    const w = Math.max(1, Math.round(whole.w * k));
    const h = Math.max(1, Math.round(whole.h * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return whole;
    context.drawImage(image, 0, 0, w, h);
    const data = context.getImageData(0, 0, w, h).data;
    const [r0, g0, b0, a0] = [data[0]!, data[1]!, data[2]!, data[3]!];
    let left = w;
    let top = h;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3]!;
        if (a < 16) continue;
        const diff = Math.abs(data[i]! - r0) + Math.abs(data[i + 1]! - g0) + Math.abs(data[i + 2]! - b0) + Math.abs(a - a0);
        if (diff <= 40) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < 0) return whole;
    return { x: left / k, y: top / k, w: (right + 1 - left) / k, h: (bottom + 1 - top) / k };
  } catch {
    return whole;
  }
}

/** A guide line across the frame; brighter while the image is snapped to it. */
function GuideLine({ axis, at, active }: { axis: 'x' | 'y'; at: number; active: boolean }) {
  const colour = active ? 'border-brand-600' : 'border-slate-400/60';
  return axis === 'x' ? (
    <div className={`absolute inset-y-0 border-l border-dashed ${colour}`} style={{ left: at }} />
  ) : (
    <div className={`absolute inset-x-0 border-t border-dashed ${colour}`} style={{ top: at }} />
  );
}

interface View {
  scale: number;
  x: number;
  y: number;
}

/**
 * Picks the square part of an image that becomes the logo: drag to move, wheel or slider to zoom. Zooming
 * out past the image leaves transparent space around it, so wide logos can be kept whole. The frame is
 * exactly the square logo the cards show.
 */
export function LogoCropper({
  src,
  busy,
  onCrop,
  onSkip,
  onClose,
}: {
  src: string | null;
  busy: boolean;
  onCrop: (crop: LogoCrop) => void;
  /** Upload as it is: no crop, uniform borders trimmed by the server. */
  onSkip: () => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  /** The logo inside the image, without its background. */
  const [content, setContent] = useState<Box>({ x: 0, y: 0, w: 1, h: 1 });
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  /** Guides the image is snapped to while dragging. */
  const [snapped, setSnapped] = useState<{ x: Guide | null; y: Guide | null }>({ x: null, y: null });

  useEffect(() => {
    setSize(null);
    setFailed(false);
  }, [src]);

  /** Whole logo, touching the frame on its longer side. */
  const fit = FRAME / Math.max(content.w, content.h);
  const cover = FRAME / Math.min(content.w, content.h);
  const minScale = size ? Math.min(fit, FRAME / Math.max(size.w, size.h)) / 2 : fit / 2;
  const maxScale = cover * 4;

  /** Centres the logo at `scale`. */
  const centred = (scale: number, c = content): View => ({
    scale,
    x: (FRAME - c.w * scale) / 2 - c.x * scale,
    y: (FRAME - c.h * scale) / 2 - c.y * scale,
  });

  /** Zooms keeping the centre of the frame still. */
  const zoomTo = (scale: number) =>
    setView((v) => {
      const next = Math.min(maxScale, Math.max(minScale, scale));
      const k = next / v.scale;
      return { scale: next, x: FRAME / 2 - (FRAME / 2 - v.x) * k, y: FRAME / 2 - (FRAME / 2 - v.y) * k };
    });

  // The slider moves on a log scale, so zooming feels even at both ends.
  const sliderValue = Math.log(view.scale / minScale) / Math.log(maxScale / minScale);

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
  };
  const onPointerMove = (e: PointerEvent) => {
    const start = drag.current;
    if (!start || !size) return;
    // Holding Alt moves freely.
    const free = (at: number) => ({ at, guide: null });
    const k = view.scale;
    const spansX = [{ offset: content.x * k, length: content.w * k }, { offset: 0, length: size.w * k }];
    const spansY = [{ offset: content.y * k, length: content.h * k }, { offset: 0, length: size.h * k }];
    const x = (e.altKey ? free : (at: number) => snap(at, spansX))(start.x + e.clientX - start.px);
    const y = (e.altKey ? free : (at: number) => snap(at, spansY))(start.y + e.clientY - start.py);
    setView((v) => ({ ...v, x: x.at, y: y.at }));
    setSnapped({ x: x.guide, y: y.guide });
  };
  const onPointerUp = () => {
    drag.current = null;
    setSnapped({ x: null, y: null });
  };

  const crop = (): LogoCrop | null =>
    size && { left: -view.x / view.scale / size.w, top: -view.y / view.scale / size.h, size: FRAME / view.scale / size.w };

  return (
    <Dialog
      open={src !== null}
      onClose={onClose}
      title="Ritaglia il logo"
      footer={
        <>
          <Button variant="ghost" onClick={onSkip} disabled={busy}>
            Senza ritaglio
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!size}
            onClick={() => {
              const c = crop();
              if (c) onCrop(c);
            }}
          >
            Carica
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative cursor-grab touch-none overflow-hidden rounded-lg ring-1 ring-slate-300 select-none active:cursor-grabbing"
          style={{ width: FRAME, height: FRAME, background: CHECKERBOARD }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={(e) => zoomTo(view.scale * Math.exp(-e.deltaY / 500))}
        >
          {src && !failed && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
              style={size ? { width: size.w, height: size.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } : { opacity: 0 }}
              onLoad={(e) => {
                const s = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
                if (!s.w || !s.h) return setFailed(true);
                const c = contentBox(e.currentTarget);
                setSize(s);
                setContent(c);
                setView(centred(FRAME / Math.max(c.w, c.h), c));
              }}
              onError={() => setFailed(true)}
            />
          )}
          {size && (
            <div className="pointer-events-none absolute inset-0">
              <GuideLine axis="x" at={FRAME / 2} active={snapped.x === 'centre'} />
              <GuideLine axis="y" at={FRAME / 2} active={snapped.y === 'centre'} />
              {snapped.x === 'start' && <GuideLine axis="x" at={0} active />}
              {snapped.x === 'end' && <GuideLine axis="x" at={FRAME - 1} active />}
              {snapped.y === 'start' && <GuideLine axis="y" at={0} active />}
              {snapped.y === 'end' && <GuideLine axis="y" at={FRAME - 1} active />}
            </div>
          )}
          {failed && (
            <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">
              Anteprima non disponibile: puoi caricarla senza ritaglio.
            </p>
          )}
        </div>
        <div className="flex w-full max-w-[320px] items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setView(centred(fit))} disabled={!size} title="Intera">
            <Minimize className="size-4" />
          </Button>
          <input
            type="range"
            className="flex-1 accent-brand-700"
            min={0}
            max={1}
            step={0.001}
            value={Number.isFinite(sliderValue) ? sliderValue : 0}
            disabled={!size}
            onChange={(e) => zoomTo(minScale * (maxScale / minScale) ** Number(e.target.value))}
            aria-label="Zoom"
          />
          <Button size="sm" variant="ghost" onClick={() => setView(centred(cover))} disabled={!size} title="Riempi il quadrato">
            <Maximize className="size-4" />
          </Button>
        </div>
        <p className="text-center text-xs text-slate-500">Trascina per spostare: i bordi del logo si agganciano al centro e ai lati del riquadro (tieni premuto Alt per muoverla liberamente). Rotellina o cursore per lo zoom.</p>
      </div>
    </Dialog>
  );
}
