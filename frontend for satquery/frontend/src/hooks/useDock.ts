import { useState } from 'react';
import type * as React from 'react';

export function useDock(
  initialWidth: number
) {
  const [
    width,
    setWidth
  ] = useState(initialWidth);

  const [
    previousWidth,
    setPreviousWidth
  ] = useState(initialWidth);

  const [
    collapsed,
    setCollapsed
  ] = useState(false);

  const resize = (
    event: React.PointerEvent,
    side: 'left' | 'right'
  ) => {
    event.preventDefault();

    const start = event.clientX;
    const initial = width;

    const move = (
      pointer: PointerEvent
    ) => {
      const next = Math.max(
        190,
        Math.min(
          440,
          side === 'left'
            ? initial +
            pointer.clientX -
            start
            : initial -
            pointer.clientX +
            start
        )
      );

      setWidth(next);
      setPreviousWidth(next);
    };

    const up = () =>
      window.removeEventListener(
        'pointermove',
        move
      );

    window.addEventListener(
      'pointermove',
      move
    );

    window.addEventListener(
      'pointerup',
      up,
      { once: true }
    );
  };

  const toggle = () => {
    if (collapsed) {
      setWidth(previousWidth);
      setCollapsed(false);
    } else {
      setPreviousWidth(width);
      setCollapsed(true);
    }
  };

  return {
    width,
    collapsed,
    resize,
    toggle
  };
}