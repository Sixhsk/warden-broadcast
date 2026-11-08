const fs = require('fs');

/* ---------- App.tsx 文案与细节 ---------- */
let p = 'src/console/App.tsx';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
  'sub="OBS 用这一页；预览里带模拟画面，OBS 里画面区是透空的"',
  'sub="OBS 浏览器源用这一页；预览里是模拟画面，正式画面按下面的底色设置"',
);

s = s.replace(
  'OBS → 来源 → <b>+</b> → <b>浏览器</b>：宽 <b>1920</b>、高 <b>1080</b>、FPS 60，URL 粘贴上面的地址，勾选「关闭源时关闭页面」。画面区默认透明，游戏采集放在叠加层下面即可。',
  'OBS → 来源 → <b>+</b> → <b>浏览器</b>：宽 <b>1920</b>、高 <b>1080</b>、FPS 60，URL 粘贴上面的地址，勾选「关闭源时关闭页面」。底色选「纯黑黑场」时画面区不透明；要露出下面的游戏采集，切到「完全透明」。',
);

// 焦点行补一行备注（只读，编辑在设置里）
s = s.replace(
  `                {on && <span className="fnow">播出中</span>}
                {offline && <span className="fhint">Offline · 不可切换</span>}
              </div>`,
  `                {on && <span className="fnow">播出中</span>}
                {offline && <span className="fhint">Offline · 不可切换</span>}
              </div>
              {p.note ? <span className="fnote">{p.note}</span> : <span className="fnote empty">未填写说明</span>}`,
);

fs.writeFileSync(p, s);

/* ---------- CSS ---------- */
p = 'src/console/console.css';
s = fs.readFileSync(p, 'utf8');

s = s.replace(
  `/* ------------------------------------------------- 主界面：比赛信息简报 */
.cmain {
  grid-template-columns: minmax(560px, 1fr) 620px;
}`,
  `/* ------------------------------------------------- 主界面：比赛信息简报 */
.cmain {
  grid-template-columns: minmax(540px, 1fr) 660px;
}`,
);

s = s.replace(
  `.mbody > * {
  flex: 1 1 420px;
  min-width: 380px;
}`,
  `.mbody {
  flex-direction: column;
  flex-wrap: nowrap;
}

.mbody > * {
  flex: none;
  width: 100%;
  min-width: 0;
}

/* 焦点行备注 */
.fnote {
  grid-column: 2;
  font-size: 11px;
  color: var(--t3);
  line-height: 1.5;
}

.fnote.empty {
  opacity: 0.45;
}`,
);

s = s.replace(`.modal {
  display: flex;
  flex-direction: column;
  width: min(1360px, 100%);`, `.modal {
  display: flex;
  flex-direction: column;
  width: min(1560px, 100%);`);

fs.writeFileSync(p, s);
console.log('polish ok');