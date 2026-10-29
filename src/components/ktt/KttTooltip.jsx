import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * KttTooltip — Thành phần tooltip chuẩn dùng chung cho phân hệ Hàng tại KTT.
 * 
 * Đặc điểm:
 * - Hiển thị qua Portal (document.body) với vị trí fixed, không bao giờ bị cắt bởi
 *   bất kỳ khung `overflow-hidden`, `overflow-x-auto` hay card border nào.
 * - Nền tối (#111827 / gray-900), chữ trắng, bo góc, cỡ chữ ~11px, z-index 99999.
 * - Hỗ trợ cả rê chuột (hover) và bàn phím (focus) qua tabIndex={0}, role="img", aria-label.
 * - Tự động đổi hướng căn lề (trái / phải / trên / dưới) khi sát mép màn hình.
 */
export default function KttTooltip({
  content,
  ariaLabel,
  children,
  className = '',
  tabIndex = 0,
  role = 'img',
  placement = 'auto', // 'top' | 'bottom' | 'auto'
  align = 'auto', // 'left' | 'right' | 'center' | 'auto'
  disabled = false,
  as: Component = 'div',
  onClick,
  onKeyDown,
  style,
  ...rest
}) {
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({
    top: 0,
    left: 0,
    transform: 'translate(-50%, -100%)',
    ready: false,
  });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const ttWidth = tooltipEl ? tooltipEl.offsetWidth : 220;
    const ttHeight = tooltipEl ? tooltipEl.offsetHeight : 64;

    const viewportWidth = window.innerWidth;

    // Xác định đặt trên hay dưới
    let isBottom = placement === 'bottom';
    if (placement === 'auto') {
      if (rect.top < ttHeight + 16) {
        isBottom = true;
      }
    }

    const top = isBottom ? rect.bottom + 8 : rect.top - 8;
    const translateY = isBottom ? '0%' : '-100%';

    // Xác định căn lề ngang (trái, phải hoặc giữa)
    let translateX = '-50%';
    let left = rect.left + rect.width / 2;

    if (align === 'left' || (align === 'auto' && rect.left < ttWidth / 2 + 12)) {
      left = Math.max(8, rect.left);
      translateX = '0%';
    } else if (
      align === 'right' ||
      (align === 'auto' && rect.right > viewportWidth - ttWidth / 2 - 12)
    ) {
      left = Math.min(viewportWidth - 8, rect.right);
      translateX = '-100%';
    } else {
      if (left - ttWidth / 2 < 8) {
        left = 8;
        translateX = '0%';
      } else if (left + ttWidth / 2 > viewportWidth - 8) {
        left = viewportWidth - 8;
        translateX = '-100%';
      }
    }

    setPos({
      top: Math.round(top),
      left: Math.round(left),
      transform: `translate(${translateX}, ${translateY})`,
      ready: true,
    });
  }, [placement, align]);

  // Đo đạc và tinh chỉnh vị trí ngay khi tooltip xuất hiện
  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, updatePosition]);

  // Cập nhật vị trí khi resize hoặc scroll
  useEffect(() => {
    if (!visible) return;

    const handleUpdate = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [visible, updatePosition]);

  const handleMouseEnter = () => {
    if (!disabled && content) {
      updatePosition();
      setVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setVisible(false);
  };

  const handleFocus = () => {
    if (!disabled && content) {
      updatePosition();
      setVisible(true);
    }
  };

  const handleBlur = () => {
    setVisible(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      setVisible(false);
    }
    if (onKeyDown) onKeyDown(e);
  };

  return (
    <>
      <Component
        ref={triggerRef}
        tabIndex={tabIndex}
        role={role}
        aria-label={ariaLabel}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKey}
        onClick={onClick}
        className={className}
        style={style}
        {...rest}
      >
        {children}
      </Component>

      {visible &&
        content &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              transform: pos.transform,
              zIndex: 99999,
              opacity: pos.ready ? 1 : 0,
            }}
            className="pointer-events-none bg-gray-900 text-white rounded-lg p-2.5 shadow-2xl text-[11px] leading-relaxed whitespace-nowrap border border-gray-700/80 transition-opacity duration-150 select-none"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
