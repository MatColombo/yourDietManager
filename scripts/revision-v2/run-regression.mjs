import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const out='reports/revision_v2/R8/evidence/suite';await fs.mkdir(out,{recursive:true});
const tmp=path.resolve('reports/revision_v2/R8/evidence/tmp');await fs.mkdir(tmp,{recursive:true});
const all=(await fs.readdir('tests')).filter(f=>f.endsWith('.test.mjs')).sort();
const requested=process.argv.slice(2);if(requested.some(f=>!all.includes(f)))throw new Error('Arguments must be exact tests/*.test.mjs basenames');
const files=requested.length?requested:all;
let results=[];try{results=JSON.parse(await fs.readFile(`${out}/results.json`,'utf8'));}catch{}
for(const file of files){const started=Date.now();const result=await new Promise(resolve=>{let log='';const child=spawn(process.execPath,['--test',`tests/${file}`],{env:{...process.env,TMPDIR:process.env.TMPDIR||tmp}});child.stdout.on('data',data=>{log+=data;});child.stderr.on('data',data=>{log+=data;});let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},180000);child.on('error',error=>{log+=error.message;});child.on('close',code=>{clearTimeout(timer);resolve({log,exitCode:timedOut?124:code??1});});});await fs.writeFile(`${out}/${file.replace('.mjs','.log')}`,result.log);const row={file:`tests/${file}`,exitCode:result.exitCode,seconds:(Date.now()-started)/1000};results=results.filter(r=>r.file!==row.file);results.push(row);results.sort((a,b)=>a.file.localeCompare(b.file));await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');console.log(file,result.exitCode);}
if(results.some(r=>r.exitCode!==0))process.exitCode=1;
