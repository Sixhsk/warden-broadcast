/**
 * Material 3 Web Components 的 React 薄封装
 *
 * 组件本体、状态层、涟漪、焦点环、动画节奏都由 @material/web 提供，
 * 这里只做三件事：把 React 的值同步成元素 property、把元素事件转成回调、
 * 统一成便于在页面里写的 API。没有自己重画按钮。
 */
import React, { useEffect, useRef } from 'react';
import './material';

type AnyEl = HTMLElement & Record<string, any>;

function useProperty(el: () => AnyEl | null, props: Record<string, unknown>, deps: unknown[]) {
  useEffect(() => {
    const node = el();
    if (!node) return;
    for (const [k, v] of Object.entries(props)) {
      if (node[k] !== v) node[k] = v;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ------------------------------------------------------------------ 按钮 */

export type BtnVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated';

export function MdButton({
  children,
  onClick,
  variant = 'outlined',
  disabled,
  type = 'button',
  className,
  trailingIcon,
  title,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  trailingIcon?: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<AnyEl>(null);
  useProperty(() => ref.current, { disabled: !!disabled }, [disabled]);

  useEffect(() => {
    const node = ref.current;
    if (!node || !onClick) return;
    const h = () => onClick();
    node.addEventListener('click', h);
    return () => node.removeEventListener('click', h);
  }, [onClick]);

  const tag =
    variant === 'filled'
      ? 'md-filled-button'
      : variant === 'tonal'
        ? 'md-filled-tonal-button'
        : variant === 'text'
          ? 'md-text-button'
          : variant === 'elevated'
            ? 'md-elevated-button'
            : 'md-outlined-button';

  return React.createElement(
    tag,
    { ref, type, class: className, title, style },
    children,
    trailingIcon ? React.createElement('span', { slot: 'icon', className: 'md-trailing' }, trailingIcon) : null
  );
}

export function MdIconButton({
  icon,
  onClick,
  label,
  disabled,
  selected,
  toggle,
}: {
  icon: string;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
  selected?: boolean;
  toggle?: boolean;
}) {
  const ref = useRef<AnyEl>(null);
  useProperty(() => ref.current, { disabled: !!disabled, selected: !!selected, toggle: !!toggle }, [
    disabled,
    selected,
    toggle,
  ]);
  useEffect(() => {
    const node = ref.current;
    if (!node || !onClick) return;
    const h = () => onClick();
    node.addEventListener('click', h);
    return () => node.removeEventListener('click', h);
  }, [onClick]);
  return React.createElement('md-icon-button', { ref, 'aria-label': label, title: label }, icon);
}

/* -------------------------------------------------------------- 文本输入 */

/**
 * MD3 outlined text field。
 *
 * 输入 bug 的修法（xing → xxixing）：这个组件的文本只有一个真源——元素自己。
 *  - 用户输入时绝不把外部 value 写回元素（聚焦期间忽略回写）；
 *  - 每次按键只更新本地文本，并在 200ms 静止后提交一次；
 *  - 失焦立即提交，提交后元素保留用户看到的文本。
 * 旧写法是 `<input value={state} onChange={e => send(...)}/>`：服务端快照回写成
 * 上一字符的值，下一次按键落在被回退的文本上，于是字符被翻倍。
 */
export function MdField({
  label,
  value,
  onValue,
  onCommit,
  maxLength,
  supportingText,
  placeholder,
  disabled,
  className,
  mono,
  type = 'text',
  commitDelay = 200,
}: {
  label?: string;
  value: string;
  onValue?: (v: string) => void;
  onCommit?: (v: string) => void;
  maxLength?: number;
  supportingText?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  mono?: boolean;
  type?: 'text' | 'password' | 'number';
  commitDelay?: number;
}) {
  const ref = useRef<AnyEl>(null);
  const focused = useRef(false);
  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const applying = useRef(false);
  const commitRef = useRef(onCommit);
  const valueRef = useRef(onValue);

  commitRef.current = onCommit;
  valueRef.current = onValue;

  const flush = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const v = pending.current;
    pending.current = null;
    if (v !== null) commitRef.current?.(v);
  };

  // 静态属性
  useProperty(
    () => ref.current,
    {
      label: label ?? '',
      maxlength: maxLength ?? undefined,
      supportingText: supportingText ?? '',
      placeholder: placeholder ?? '',
      disabled: !!disabled,
      type,
    },
    [label, maxLength, supportingText, placeholder, disabled, type]
  );

  // 外部值回写：只在没有焦点、也没有待提交内容时进行
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (focused.current || pending.current !== null) return;
    const next = value ?? '';
    // 程序化赋值不触发 input，label 会停在不浮动的位置，且首次挂载时
    // shadow root 可能还没建立。这里统一下发一次 input 让 MD3 重算标签浮起。
    applying.current = true;
    if ((node.value ?? '') !== next) node.value = next;
    const sync = () => {
      const inner = (node.shadowRoot as ShadowRoot | null)?.querySelector('input');
      if (inner && inner.value !== next) {
        inner.value = next;
        inner.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    };
    sync();
    // rAF 里再补一次：首帧 shadow root 可能还没建立，且这次派发不能被
    // onInput 当成用户输入提交（否则会用空值把服务端昵称清掉）。
    const raf = requestAnimationFrame(() => {
      sync();
      applying.current = false;
    });
    return () => {
      cancelAnimationFrame(raf);
      applying.current = false;
    };
  }, [value]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onInput = () => {
      if (applying.current) return;
      const v = node.value ?? '';
      pending.current = v;
      valueRef.current?.(v);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, commitDelay);
    };
    const onFocus = () => {
      focused.current = true;
    };
    const onBlur = () => {
      focused.current = false;
      flush();
    };

    node.addEventListener('input', onInput);
    node.addEventListener('focus', onFocus, true);
    node.addEventListener('blur', onBlur, true);
    node.addEventListener('change', onBlur);
    return () => {
      node.removeEventListener('input', onInput);
      node.removeEventListener('focus', onFocus, true);
      node.removeEventListener('blur', onBlur, true);
      node.removeEventListener('change', onBlur);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitDelay]);

  return React.createElement('md-outlined-text-field', {
    ref,
    class: className,
    'data-mono': mono ? '1' : undefined,
  });
}

/* ------------------------------------------------------------ 分段选择器 */

/**
 * MD3 segmented button（@material/web labs，outlined 变体）。
 * 单选语义由组件自己保证：点击后 set 会派发 segmented-button-set-selection，
 * detail 里带 index / selected，这里只把 index 翻成业务值。
 */
export function MdSeg({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<AnyEl>(null);

  useEffect(() => {
    const set = ref.current;
    if (!set) return;
    const btns = Array.from(set.querySelectorAll('md-outlined-segmented-button')) as AnyEl[];
    btns.forEach((b, i) => {
      const want = options[i]?.v === value;
      if (b.selected !== want) b.selected = want;
      b.disabled = !!disabled;
    });
  }, [value, options, disabled]);

  useEffect(() => {
    const set = ref.current;
    if (!set) return;
    const h = (e: Event) => {
      const idx = (e as CustomEvent<{ index: number }>).detail?.index;
      if (typeof idx === 'number' && options[idx]) onChange(options[idx].v);
    };
    set.addEventListener('segmented-button-set-selection', h);
    return () => set.removeEventListener('segmented-button-set-selection', h);
  }, [options, onChange]);

  return React.createElement(
    'md-outlined-segmented-button-set',
    // key 绑定当前值：值一变就重建整组，MD3 分组按钮的内部 selected 状态
    // 只认挂载时的属性，重建比逐个改 property 可靠（改 property 会出现
    // 服务端已变、界面仍停在旧选中的情况）。
    { key: value, ref },
    options.map((o) => React.createElement('md-outlined-segmented-button', { key: o.v, label: o.l }))
  );
}

/* ------------------------------------------------------------------ 页签 */

export function MdTabs({
  tabs,
  index,
  onChange,
  className,
}: {
  tabs: string[];
  index: number;
  onChange: (i: number) => void;
  className?: string;
}) {
  const ref = useRef<AnyEl>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.activeTabIndex !== index) node.activeTabIndex = index;
  }, [index]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const h = () => onChange(node.activeTabIndex ?? 0);
    node.addEventListener('change', h);
    return () => node.removeEventListener('change', h);
  }, [onChange]);

  return React.createElement(
    'md-tabs',
    { ref, class: className },
    tabs.map((t) => React.createElement('md-primary-tab', { key: t }, t))
  );
}

/* ------------------------------------------------------------------ 弹窗 */

export function MdDialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return React.createElement(
    'div',
    {
      className: 'sheet-mask',
      onMouseDown: (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
      },
    },
    React.createElement('div', { className: `sheet ${className ?? ''}`.trim() }, children)
  );
}

/* ------------------------------------------------------------------ 开关 */

export function MdSwitch({
  selected,
  onChange,
  label,
}: {
  selected: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  const ref = useRef<AnyEl>(null);
  useProperty(() => ref.current, { selected }, [selected]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const h = () => onChange(!!node.selected);
    node.addEventListener('change', h);
    return () => node.removeEventListener('change', h);
  }, [onChange]);
  return React.createElement('md-switch', { ref, 'aria-label': label ?? '' });
}