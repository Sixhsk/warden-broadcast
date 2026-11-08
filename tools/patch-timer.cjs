const fs = require('fs');
const p = 'server/server.mjs';
let s = fs.readFileSync(p, 'utf8');

const before = s.length;

// 1) 去掉 watchTimer 调用
s = s.replace(/\n\s*watchTimer\(\);/, '');

// 2) 替换 timer.set 分支
const startMark = "    case 'timer.set': {";
const endMark = "    case 'timer.cmd':";
const i = s.indexOf(startMark);
const j = s.indexOf(endMark, i);
if (i < 0 || j < 0) throw new Error('timer.set block not found');

const nextBlock = `    case 'timer.set': {
      // 正计时模式：手动校正已过时间
      const ms = clampDuration(payload.elapsedMs ?? 0);
      if (ms === null) return '时间无效';
      state.timer = {
        ...state.timer,
        accumulatedMs: ms,
        startedAt: state.timer.phase === 'running' ? Date.now() : null,
      };
      return null;
    }
    case 'feed.backdrop': {
      state.feedBackdrop = payload.value === 'transparent' ? 'transparent' : 'black';
      return null;
    }
`;
s = s.slice(0, i) + nextBlock + s.slice(j);

fs.writeFileSync(p, s);
console.log('patched', before, '->', s.length, 'watchTimer?', s.includes('watchTimer'), 'feed.backdrop?', s.includes('feed.backdrop'));