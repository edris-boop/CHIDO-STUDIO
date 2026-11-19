import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  danger?: boolean;
  dividerAbove?: boolean;
  onSelect: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
}

interface StudioContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
}

export function StudioContextMenu({ menu, onClose }: StudioContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const menuWidth = 350;
  const estHeight = menu.items.length * 44 + (menu.title ? 42 : 16);
  const clampedX = typeof window !== 'undefined'
    ? Math.max(12, Math.min(menu.x, window.innerWidth - menuWidth - 12))
    : menu.x;
  const clampedY = typeof window !== 'undefined'
    ? Math.max(12, Math.min(menu.y, window.innerHeight - estHeight - 12))
    : menu.y;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={menu.title || 'منوی راست‌کلیک CHIDO Studio'}
      style={{ top: clampedY, left: clampedX, width: menuWidth }}
      className="fixed z-[70] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-2xl py-1.5 backdrop-blur-sm"
    >
      {menu.title && (
        <div className="px-3.5 py-2 border-b border-[var(--border-hairline)] text-xs font-semibold text-[var(--ink-muted)] truncate">
          {menu.title}
        </div>
      )}
      <div className="py-1">
        {menu.items.map((item) => (
          <div key={item.id}>
            {item.dividerAbove && (
              <div className="my-1 border-t border-[var(--border-hairline)]" role="separator" />
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={`w-full px-3.5 py-2.5 text-right text-sm font-medium flex items-center justify-between gap-2.5 transition-colors ${
                item.danger
                  ? 'text-[var(--tone-rose-ink)] hover:bg-[var(--tone-rose-bg)]'
                  : 'text-[var(--ink-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0 leading-snug">
                {item.icon && <span className="shrink-0 opacity-85">{item.icon}</span>}
                <span>{item.label}</span>
              </span>
              {item.hint && (
                <span className="text-xs font-mono-tabular text-[var(--ink-muted)] shrink-0" dir="ltr">
                  {item.hint}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
