/**
 * 注册 @material/web 的自定义元素。
 *
 * 这些 import 只为副作用：每个模块把自己注册成 md-* 元素，
 * 之后页面里写 <md-filled-button> 就得到官方按钮（含状态层、涟漪、焦点环、
 * 无障碍与动效节奏），不需要我们自己实现任何交互外观。
 */
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/button/elevated-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/tabs/tabs.js';
import '@material/web/tabs/primary-tab.js';
import '@material/web/dialog/dialog.js';
import '@material/web/switch/switch.js';
import '@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js';
import '@material/web/labs/segmentedbutton/outlined-segmented-button.js';