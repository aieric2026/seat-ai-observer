import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const CATEGORIES=['整椅','骨架','核心件','电机','执行器','发泡','面套','线束','开关','控制器'];
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
export const chinaDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const chinaHour=(date=new Date())=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(date));
export async function readJson(file,{optional=false}={}){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(optional&&error.code==='ENOENT')return null;throw new Error(`Cannot read valid JSON: ${path.relative(ROOT,file)} (${error.code??'invalid JSON'})`);}}
const writes=new Map();
export async function atomicJson(file,value){
  const previous=writes.get(file)??Promise.resolve();
  const write=previous.catch(()=>{}).then(async()=>{
    await fs.mkdir(path.dirname(file),{recursive:true});
    const temporary=path.join(path.dirname(file),`.tmp-${path.basename(file)}-${process.pid}-${crypto.randomBytes(5).toString('hex')}`);
    const handle=await fs.open(temporary,'wx',0o600);
    try{await handle.writeFile(JSON.stringify(value,null,2)+'\n','utf8');await handle.sync();}finally{await handle.close();}
    try{for(let attempt=0;;attempt++){try{await fs.rename(temporary,file);break;}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt===24)throw error;await sleep(20);}}}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  });
  writes.set(file,write);try{await write;}finally{if(writes.get(file)===write)writes.delete(file);}
}
export async function config(){return {...await readJson(path.join(ROOT,'config/update-config.json')),...await readJson(path.join(ROOT,'.runtime/local-config.json'),{optional:true})};}
export function plain(value,name,max=1600){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error(`Invalid ${name}`);return value.trim();}
export function canonicalUrl(value,sources){
  const u=new URL(plain(value,'URL',2048));
  if(u.protocol!=='https:'||u.username||u['pass'+'word']||u.port||u.hostname==='localhost'||!sources.some(s=>u.hostname===s.domain||u.hostname.endsWith('.'+s.domain)))throw Error('Source URL is outside the configured public official domains');
  u.hash='';for(const key of [...u.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(key))u.searchParams.delete(key);return u.toString();
}
export function sourceDomain(url,sources){const host=new URL(canonicalUrl(url,sources)).hostname;return sources.filter(s=>host===s.domain||host.endsWith('.'+s.domain)).sort((a,b)=>b.domain.length-a.domain.length)[0].domain;}
export function validateArticle(raw,{sources,now=new Date(),newArticle=false,backfillDays=7}={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid article');
  if(!CATEGORIES.includes(raw.category))throw Error('Unsupported category');
  if(!['direct','enabling','adjacent'].includes(raw.aiRelation))throw Error('Unsupported AI relation');
  const related=raw.relatedCategories??[];if(!Array.isArray(related)||related.length>9||related.some(c=>!CATEGORIES.includes(c)))throw Error('Invalid related categories');
  if(!Array.isArray(raw.tags)||raw.tags.length>8)throw Error('Invalid tags');
  const publishedAt=raw.publishedAt??null;
  if(publishedAt!==null){if(typeof publishedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)||new Date(`${publishedAt}T00:00:00Z`).toISOString().slice(0,10)!==publishedAt||publishedAt>chinaDate(now))throw Error('Invalid original publication date');}
  if(newArticle){const oldest=chinaDate(new Date(now.getTime()-backfillDays*86400000));if(publishedAt===null||publishedAt<oldest)throw Error('New daily news must have a verified original date within the backfill window');}
  const url=canonicalUrl(raw.url,sources);
  return {id:raw.id&&typeof raw.id==='string'?raw.id:'n_'+sha256(url).slice(0,24),url,title:plain(raw.title,'title',180),summary:plain(raw.summary,'summary'),category:raw.category,relatedCategories:[...new Set(related)].filter(c=>c!==raw.category),aiRelation:raw.aiRelation,sourceName:plain(raw.sourceName,'sourceName',100),publishedAt,collectedAt:raw.collectedAt&&Number.isFinite(Date.parse(raw.collectedAt))?raw.collectedAt:now.toISOString(),evidenceNote:plain(raw.evidenceNote,'evidenceNote'),tags:[...new Set(raw.tags.map(t=>plain(t,'tag',50)))]};
}
export function validateData(data,sources){
  if(!data||!Array.isArray(data.articles)||!Array.isArray(data.runs)||!data.settings||typeof data.settings!=='object')throw Error('Invalid news dataset');
  const seen=new Set();for(const item of data.articles){const article=validateArticle(item,{sources});if(seen.has(article.url))throw Error('Duplicate article URL');seen.add(article.url);}
  for(const run of data.runs){if(!run.runId||!['success','partial','failed'].includes(run.status)||!Number.isInteger(run.addedCount)||!Number.isInteger(run.checkedSources)||!Array.isArray(run.failures)||!Number.isFinite(Date.parse(run.completedAt)))throw Error('Invalid update run');}
  return true;
}
export async function acquireLock(){
  const file=path.join(ROOT,'.runtime/update.lock');await fs.mkdir(path.dirname(file),{recursive:true});
  for(let attempt=0;attempt<2;attempt++){
    try{const handle=await fs.open(file,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await handle.close();return async()=>{await fs.rm(file,{force:true});};}
    catch(error){if(error.code!=='EEXIST')throw error;const current=await readJson(file);let alive=true;try{process.kill(current.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw Error('Another updater is running; the overlap was rejected');await fs.rm(file,{force:true});}
  }throw Error('Unable to acquire update lock');
}
export async function command(executable,args,{cwd=ROOT,input='',timeoutMs=120000,logFile,env={}}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',...env}});
    const chunks=[];let count=0,timedOut=false;
    child.stdout.on('data',b=>{count+=b.length;if(count<10_000_000)chunks.push(b)});child.stderr.on('data',b=>{count+=b.length;if(count<10_000_000)chunks.push(b)});
    const timer=setTimeout(()=>{timedOut=true;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill('SIGTERM');},timeoutMs);
    child.once('error',e=>{clearTimeout(timer);reject(e)});
    child.once('close',async code=>{clearTimeout(timer);const output=Buffer.concat(chunks).toString('utf8');if(logFile){await fs.mkdir(path.dirname(logFile),{recursive:true});await fs.writeFile(logFile,output,'utf8');}if(timedOut)reject(Error(`Command timed out: ${path.basename(executable)}`));else if(code!==0)reject(Error(`Command failed (${code}): ${path.basename(executable)}${logFile?`; see ${path.relative(ROOT,logFile)}`:''}`));else resolve(output);});
    child.stdin.on('error',()=>{});child.stdin.end(input,'utf8');
  });
}
export async function buildStatic(){const vite=path.join(ROOT,'node_modules/vite/bin/vite.js');await fs.access(vite);await command(process.execPath,[vite,'build'],{timeoutMs:600000,logFile:path.join(ROOT,'.runtime/logs/build.log')});}
export async function exportData(data){const fingerprint=sha256(JSON.stringify({articles:data.articles,runs:data.runs,settings:data.settings,generatedAt:data.generatedAt}));data.publication={dataVersion:fingerprint};await atomicJson(path.join(ROOT,'data/news.json'),data);await atomicJson(path.join(ROOT,'public/data/news.json'),data);return fingerprint;}
export function stripHtml(html){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v))).replace(/&#x([a-f\d]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/\s+/g,' ').trim();}
export async function fetchOfficial(url,sources,timeoutSeconds=25){
  let target=canonicalUrl(url,sources);
  for(let redirect=0;redirect<5;redirect++){
    const response=await fetch(target,{redirect:'manual',headers:{'User-Agent':'SeatAI-Observer/1.0 (public-source research)','Accept':'text/html,application/xhtml+xml,application/json;q=0.8'},signal:AbortSignal.timeout(timeoutSeconds*1000)});
    if([301,302,303,307,308].includes(response.status)){target=canonicalUrl(new URL(response.headers.get('location'),target).toString(),sources);continue;}
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const type=response.headers.get('content-type')??'';if(!/text\/html|application\/(?:json|xhtml\+xml)/i.test(type))throw Error('Source did not return readable HTML/JSON');
    if(Number(response.headers.get('content-length')??0)>5_000_000)throw Error('Source response exceeds 5 MB');
    const reader=response.body.getReader();const parts=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000){await reader.cancel();throw Error('Source response exceeds 5 MB');}parts.push(value);}
    const html=Buffer.concat(parts).toString('utf8'),text=stripHtml(html);if(text.length<120)throw Error('Source content was empty or a challenge page');return{url:target,html,text,sha256:sha256(html)};
  }throw Error('Too many source redirects');
}
export function verifyEvidence(raw,page){
  const norm=s=>stripHtml(s).toLowerCase().replace(/[‘’]/g,"'").replace(/[“”]/g,'"');
  const quote=plain(raw.evidenceQuote,'original evidence quote',220),dateQuote=plain(raw.dateEvidenceQuote,'original date quote',180);
  if(quote.split(/\s+/).length>25)throw Error('Original evidence quote is too long');
  if(!norm(page.text).includes(norm(quote)))throw Error('Original evidence quote was not found on the fetched source');
  if(!norm(page.text).includes(norm(dateQuote))&&!norm(page.html).includes(norm(dateQuote)))throw Error('Original date evidence was not found on the fetched source');
  const date=raw.publishedAt;
  const numbers=date?.split('-').map(Number);if(!numbers)throw Error('Missing original publication date');
  const [year,month,day]=numbers,months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const normalizedDateQuote=norm(dateQuote);
  const monthPattern=`(?:${months[month-1]}|${months[month-1].slice(0,3)})`;
  const patterns=[new RegExp(`${year}[-/.年]0?${month}[-/.月]0?${day}(?:日)?`),new RegExp(`${monthPattern}\\.?\\s+0?${day}(?:st|nd|rd|th)?[ ,]+${year}`),new RegExp(`0?${day}(?:st|nd|rd|th)?\\s+${monthPattern}[ ,]+${year}`)];
  if(!patterns.some(p=>p.test(normalizedDateQuote)))throw Error('Date evidence does not substantiate the proposed original date');
  if(raw.aiRelation==='direct'&&!/\bartificial intelligence\b|\bmachine learning\b|\bdeep learning\b|\bgenerative ai\b|\bai\b|人工智能|机器学习|深度学习|生成式/i.test(page.text))throw Error('Direct AI classification lacks AI wording in the source');
  return{url:page.url,sourceHash:page.sha256,evidenceQuote:quote,dateEvidenceQuote:dateQuote};
}
