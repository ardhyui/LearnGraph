/**
 * The details panel next to a graph (concept or domain). On wide screens it
 * sits beside the graph; on phones (below 768px) it is a bottom sheet over the
 * lower part of the screen, so the graph keeps its full width (Roadmap,
 * cross-milestone mobile). Escape or the close button closes it.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

const WIDE = '(min-width: 768px)';

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

export function GraphDetailPanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const wide = useWide();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const motionProps = wide
    ? {
        initial: { opacity: 0, x: 20, width: 0 },
        animate: { opacity: 1, x: 0, width: '33.333%' },
        exit: { opacity: 0, x: 20, width: 0 },
        className: 'glass-card shrink-0 overflow-y-auto p-5',
        style: { height: '600px' },
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: { type: 'tween' as const, duration: 0.2 },
        className:
          'glass-card fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-b-none border-t border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl',
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.section key="graph-detail-panel" aria-labelledby={headingId} data-testid="graph-detail-panel" data-layout={wide ? 'side' : 'sheet'} {...motionProps}>
          {!wide && <div className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />}
          <div className="mb-4 flex items-start justify-between gap-3">
            <h3 id={headingId} className="text-lg font-bold text-foreground">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {children}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
