const fs = require('fs');

const css = `
/* ------------------------------------------------- 主界面：比赛信息简报 */
.cmain {
  grid-template-columns: minmax(560px, 1fr) 620px;
}

.msum {
  display: flex;
  flex-direction: column;
}

.msum-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--hair);
  font-size: 13px;
  color: var(--t2);
}

.msum-row:last-child {
  border-bottom: 0;
}

.msum-k {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--t3);
  text-transform: uppercase;
}

.msum-name {
  font-size: 15px;
  color: var(--t1);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.msum-vs {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--t1);
  flex-wrap: wrap;
}

.msum-vs em {
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--t3);
  padding: 0 2px;
}

.vt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  border: 1px solid currentColor;
  border-radius: 2px;
}

.vt.a {
  color: var(--a);
}

.vt.b {
  color: var(--b);
}

/* ------------------------------------------------- 焦点行（含状态开关） */
.frows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.frow {
  display: grid;
  grid-template-columns: 44px 1fr;
  grid-template-areas:
    'shot name'
    'shot ctl';
  gap: 2px 12px;
  padding: 10px 12px;
  background: var(--l1);
  border: 1px solid var(--hair);
  border-left: 2px solid transparent;
  border-radius: 3px;
}

.frow.on {
  border-left-color: var(--a);
  background: var(--l2);
}

.frow.off {
  opacity: 0.62;
}

.fshot {
  grid-area: shot;
  width: 44px;
  height: 44px;
  padding: 0;
  background: #0a0d11;
  border: 1px solid var(--hair);
  border-radius: 2px;
  color: var(--t3);
  font-size: 15px;
  overflow: hidden;
  cursor: pointer;
}

.fshot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.fshot:disabled {
  cursor: not-allowed;
}

.fnameline {
  grid-area: name;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
}

.fname-btn {
  padding: 0;
  background: none;
  border: 0;
  color: var(--t1);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.fname-btn:hover:not(:disabled) {
  color: var(--a-b);
}

.fname-btn:disabled {
  cursor: not-allowed;
  color: var(--t3);
}

.fid {
  font-size: 10px;
  color: var(--t3);
}

.fnow {
  padding: 1px 5px;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: #06222a;
  background: var(--a);
  border-radius: 2px;
  font-weight: 700;
}

.fhint {
  font-size: 10px;
  color: var(--danger);
}

.fctl {
  grid-area: ctl;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

/* --------------------------------------------------------- 设置弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(4, 6, 9, 0.78);
}

.modal {
  display: flex;
  flex-direction: column;
  width: min(1360px, 100%);
  max-height: 100%;
  background: var(--l0);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
}

.modal-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--hair);
}

.modal-head b {
  font-size: 15px;
  color: var(--t1);
  letter-spacing: 0.04em;
}

.modal-head span {
  font-size: 11px;
  color: var(--t3);
}

.modal-head .spacer {
  flex: 1;
}

.mtabs {
  display: flex;
  gap: 2px;
  padding: 10px 18px 0;
  border-bottom: 1px solid var(--hair);
}

.mtabs button {
  padding: 8px 14px;
  margin-bottom: -1px;
  background: none;
  border: 1px solid transparent;
  color: var(--t3);
  font-size: 12px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.mtabs button:hover {
  color: var(--t2);
}

.mtabs button.on {
  color: var(--a-b);
  border-color: var(--hair);
  border-bottom-color: var(--l0);
  background: var(--l0);
}

.mbody {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 18px 20px;
  overflow: auto;
  align-items: start;
}

.mbody > * {
  flex: 1 1 420px;
  min-width: 380px;
}
`;

fs.appendFileSync('src/console/console.css', css);
console.log('css appended, bytes =', fs.statSync('src/console/console.css').size);