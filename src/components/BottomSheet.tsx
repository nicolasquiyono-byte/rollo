'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Bottom-sheet modal. Closes when the user:
 *   • taps the backdrop outside the sheet
 *   • swipes down on the drag handle / header area
 *   • presses Escape (desktop)
 *
 * Uses CSS transform for slide-in/out and only renders into the DOM while
 * mounted, so it can live next to the page content unconditionally.
 */
export function BottomSheet({ open, onClose, children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  // Mount/unmount with a short delay so the slide-out transition can play
  // before the sheet is removed from the DOM.
  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      // Match the 380ms slide-out so the sheet stays mounted through the
      // full transition before being removed from the DOM.
      const t = setTimeout(() => setMounted(false), 380);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape key (desktop niceness).
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  function handleTouchStart(e: React.TouchEvent) {
    dragStart.current = e.touches[0].clientY;
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (dragStart.current === null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    // Only let the user drag downward.
    if (dy > 0) setDragOffset(dy);
  }
  function handleTouchEnd() {
    if (dragOffset > 120) onClose();
    setDragOffset(0);
    dragStart.current = null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-end transition-colors duration-300 ${
        visible ? 'bg-black/60' : 'bg-black/0'
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92dvh] overflow-hidden rounded-t-3xl bg-rollo-bg text-white shadow-2xl"
        style={{
          transform: visible
            ? `translateY(${dragOffset}px)`
            : 'translateY(100%)',
          // Slower, smoother slide-in than the previous 250ms snap. The cubic
          // bezier mimics the iOS sheet curve — quick to start, eased finish.
          transition: dragStart.current === null
            ? 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'none',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        }}
      >
        {/* Drag handle — also covers the top area so swipe-down works from
            anywhere near the top of the sheet, not just the tiny pill. */}
        <div
          className="flex justify-center pt-3 pb-1 touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 24px)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
