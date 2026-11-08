const fs = require('fs');
const p = 'src/console/App.tsx';
let s = fs.readFileSync(p, 'utf8');

const startMark = '            <div key={p.id} className={`frow ${on ? \'on\' : \'\'} ${offline ? \'off\' : \'\'}`}>';
const i = s.indexOf(startMark);
if (i < 0) throw new Error('row start not found');

// 定位该行结束：从行首开始扫描，遇到与之匹配的 "            </div>\n          );" 结构
const endMark = '          );\n        })}';
const j = s.indexOf(endMark, i);
if (j < 0) throw new Error('row end not found');

const row = `            <div
              key={p.id}
              className={\`frow \${on ? 'on' : ''} \${offline ? 'off' : ''}\`}
              role="button"
              tabIndex={offline ? -1 : 0}
              aria-pressed={on}
              aria-disabled={offline}
              title={offline ? '视频源 Offline，不可切换' : '点击卡片任意位置切换到该选手画面'}
              onClick={() => { if (!offline) send('player.focus', { playerId: p.id }); }}
              onKeyDown={(e) => {
                if (offline) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  send('player.focus', { playerId: p.id });
                }
              }}
            >
              <div className="fshot">
                {av ? <img src={av} alt="" /> : <span className="num">{p.id.slice(1)}</span>}
              </div>

              <div className="fnameline">
                <span className="fname-text">{p.nickname || '未命名'}</span>
                <span className="fid num">{p.id}</span>
                {on && <span className="fnow">播出中</span>}
                {offline && <span className="fhint">Offline · 不可切换</span>}
              </div>

              {/* 状态开关：独立的交互区，点它不会切换画面 */}
              <div className="fctl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <Seg
                  value={p.alive ? 'alive' : 'dead'}
                  options={[
                    { v: 'alive', l: '存活' },
                    { v: 'dead', l: '已淘汰' },
                  ]}
                  onChange={(v) => send('player.update', { playerId: p.id, patch: { alive: v === 'alive' } })}
                />
                <Seg
                  value={p.signal}
                  options={[
                    { v: 'online', l: '在线' },
                    { v: 'offline', l: 'Offline' },
                  ]}
                  onChange={(v) => send('player.update', { playerId: p.id, patch: { signal: v } })}
                />
              </div>
              {p.note && <span className="fnote">{p.note}</span>}
            </div>
`;

s = s.slice(0, i) + row + s.slice(j);
s = s.replace('sub="切队伍 · 改状态 · 点选手切画面"', 'sub="切队伍 · 改状态 · 点卡片任意位置切画面"');

fs.writeFileSync(p, s);
console.log('row replaced');