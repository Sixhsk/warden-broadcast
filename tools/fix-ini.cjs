const fs=require('fs');const ini=process.argv[2];
let lines=fs.readFileSync(ini,'utf8').split(/\r?\n/);
const want={BaseCX:'1920',BaseCY:'1080',OutputCX:'1920',OutputCY:'1080',ScaleType:'lanczos'};
let sec='';const seen={};
for(let i=0;i<lines.length;i++){
 const m=lines[i].match(/^\[(.+)\]\s*$/);
 if(m){sec=m[1].trim();continue}
 if(sec==='Video'){const kv=lines[i].match(/^([A-Za-z0-9_]+)=/);
  if(kv&&want[kv[1]]!==undefined){lines[i]=kv[1]+'='+want[kv[1]];seen[kv[1]]=1}}
}
const missing=Object.keys(want).filter(k=>!seen[k]);
if(missing.length){const idx=lines.findIndex(l=>/^\[Video\]\s*$/.test(l));const add=missing.map(k=>k+'='+want[k]);if(idx>=0)lines.splice(idx+1,0,...add);else lines.push('[Video]',...add)}
fs.writeFileSync(ini,lines.join('\r\n'));console.log('ok, added:',missing.join(',')||'none');
