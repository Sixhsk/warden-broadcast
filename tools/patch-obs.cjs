const fs=require('fs'),path=require('path');
const OBS=path.join(process.env.APPDATA,'obs-studio');
const scenesDir=path.join(OBS,'basic','scenes');
const files=fs.readdirSync(scenesDir).filter(f=>f.endsWith('.json'));
let patched=0,srcs=0;
for(const f of files){
  const p=path.join(scenesDir,f); const j=JSON.parse(fs.readFileSync(p,'utf8'));
  const arr=j.sources||[]; let touched=false;
  for(const s of arr){
    if(!/^SRC-/.test(s.name||''))continue;
    srcs++; touched=true;
    s.settings=s.settings||{};
    s.settings.buffering_mb=1;
    s.settings.reconnect_delay=0.5;
    s.settings.restart_on_activate=false;
    s.settings.close_when_inactive=false;
    s.settings.hw_decode=false;
    s.settings.ffmpeg_options='-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0';
  }
  if(touched){fs.copyFileSync(p,p+'.bak');fs.writeFileSync(p,JSON.stringify(j,null,4));patched++}
}
console.log('scenes patched:',patched,'sources:',srcs);
const profDir=path.join(OBS,'basic','profiles');
for(const prof of fs.readdirSync(profDir)){
  const ini=path.join(profDir,prof,'basic.ini');
  if(!fs.existsSync(ini))continue;
  let t=fs.readFileSync(ini,'utf8'); const before=t;
  const set=(sec,key,val)=>{const re=new RegExp('(\['+sec+'\][\s\S]*?)(\n'+key+'=)([^\r\n]*)');if(re.test(t))t=t.replace(re,(m,a,b)=>a+b+val);else{const sre=new RegExp('\['+sec+'\]');if(sre.test(t))t=t.replace(sre,'['+sec+']\n'+key+'='+val);else t+=`\n[${sec}]\n${key}=${val}`}};
  set('Video','BaseCX','1920');set('Video','BaseCY','1080');
  set('Video','OutputCX','1920');set('Video','OutputCY','1080');
  set('Video','ScaleType','lanczos');
  set('Video','ColorFormat','NV12');set('Video','ColorSpace','709');set('Video','ColorRange','1');
  if(t!==before){fs.copyFileSync(ini,ini+'.bak');fs.writeFileSync(ini,t);console.log('basic.ini patched:',prof)}
}
