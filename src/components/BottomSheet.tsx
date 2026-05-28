'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// Animation timings & curves. Open uses Quart Out for a buttery glide —
// fast acceleration into a very long, gentle ease-out so the sheet drifts
// into place instead of arriving. Close stays snappier because modals
// dismiss faster than they appear. Snap-back after a partial drag uses
// the same Quart Out for consistency.
const OPEN_MS = 540;
const CLOSE_MS = 340;
const SNAP_MS = 320;
const OPEN_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CLOSE_EASE = 'cubic-bezier(0.4, 0, 0.6, 1)';
const SNAP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

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
  const [dragging, setDragging] = useState(false);
  const [justReleased, setJustReleased] = useState(false);
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  // Mount/unmount with a delay so the slide-out transition can play before
  // the sheet is removed from the DOM.
  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), CLOSE_MS);
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

  // Brief flag right after release so we can use the gentler snap-back
  // curve instead of the open-curve when settling.
  useEffect(() => {
    if (!justReleased) return;
    const t = setTimeout(() => setJustReleased(false), SNAP_MS + 20);
    return () => clearTimeout(t);
  }, [justReleased]);

  if (!mounted) return null;

  function handleTouchStart(e: React.TouchEvent) {
    dragStart.current = e.touches[0].clientY;
    setDragging(true);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (dragStart.current === null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0) setDragOffset(dy);
  }
  function handleTouchEnd() {
    const closed = dragOffset > 120;
    dragStart.current = null;
    setDragging(false);
    setDragOffset(0);
    if (closed) {
      onClose();
    } else {
      setJustReleased(true);
    }
  }

  // Compute current transition based on what's happening right now:
  //  - dragging: no transition, sheet follows finger 1:1
  //  - just released without dismiss: gentle snap-back ease
  //  - opening: long Apple-style ease
  //  - closing (open=false): shorter, sharper ease
  const transition = dragging
    ? 'none'
    : justReleased
      ? `transform ${SNAP_MS}ms ${SNAP_EASE}`
      : `transform ${open ? OPEN_MS : CLOSE_MS}ms ${open ? OPEN_EASE : CLOSE_EASE}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-end ${
        visible ? 'bg-black/60' : 'bg-black/0'
      }`}
      style={{
        transition: `background-color ${open ? OPEN_MS : CLOSE_MS}ms ${
          open ? OPEN_EASE : CLOSE_EASE
        }`,
      }}
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
          transition,
          // Hint the compositor so the slide stays on its own GPU layer.
          willChange: 'transform',
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
