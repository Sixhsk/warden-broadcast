/// <reference types="react" />

/**
 * @material/web 使用自定义元素，标签名不在 React 的内置类型里。
 * 这里只声明实际用到的标签，避免 any 扩散到业务代码。
 */
declare namespace JSX {
  interface IntrinsicElements {
    'md-filled-button': any;
    'md-filled-tonal-button': any;
    'md-outlined-button': any;
    'md-text-button': any;
    'md-elevated-button': any;
    'md-icon-button': any;
    'md-outlined-text-field': any;
    'md-filled-text-field': any;
    'md-outlined-segmented-button-set': any;
    'md-outlined-segmented-button': any;
    'md-tabs': any;
    'md-primary-tab': any;
    'md-secondary-tab': any;
    'md-dialog': any;
    'md-dialog-content': any;
    'md-dialog-actions': any;
    'md-switch': any;
    'md-checkbox': any;
    'md-radio': any;
    'md-chip-set': any;
    'md-filter-chip': any;
    'md-assist-chip': any;
    'md-suggestion-chip': any;
    'md-divider': any;
    'md-linear-progress': any;
    'md-circular-progress': any;
    'md-ripple': any;
    'md-focus-ring': any;
    'md-list': any;
    'md-list-item': any;
    'md-select': any;
    'md-select-option': any;
  }
}