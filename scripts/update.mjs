import path from 'node:path';
import {ROOT,config,readJson,validateData,exportData,buildStatic,chinaDate,chinaHour,acquireLock,atomicJson} from './news-lib.mjs';
import {researchNews} from './research.mjs';
import {publishNews} from './publish.mjs';

const flags=new Set(process.argv.slice(2));
for(const flag of flags)if(!['--scheduled','--collect-only','--publish-only','--validate-only','--force-research'].includes(flag))throw Error(`Unknown option ${flag}`);
if(flags.has('--collect-only')&&flags.has('--publish-only'))throw Error('Choose collect-only or publish-only');
const options=await config(),sources=await readJson(path.join(ROOT,'config/sources.json'));
if(flags.has('--validate-only')){
  const data=await readJson(path.join(ROOT,'data/news.json')),exported=await readJson(path.join(ROOT,'public/data/news.json'));
  validateData(data,sources);validateData(exported,sources);
  if(JSON.stringify(data)!==JSON.stringify(exported))throw Error('Canonical and public data differ');
  console.log(JSON.stringify({ok:true,articles:data.articles.length,runs:data.runs.length,dataVersion:data.publication?.dataVersion}));
}else await update();

async function update(){
  const release=await acquireLock();
  let runId='not-started';
  try{
    // The time and mutable snapshot are deliberately read only after acquiring the lock.
    const now=new Date(),today=chinaDate(now);
    const dailyId=`daily-${today}-1000`;
    runId=flags.has('--force-research')?`${dailyId}-manual-${now.toISOString().replace(/[^0-9]/g,'').slice(8,14)}`:dailyId;
    const data=await readJson(path.join(ROOT,'data/news.json'));validateData(data,sources);
    if(flags.has('--scheduled')&&chinaHour(now)<10){console.log(JSON.stringify({skipped:true,reason:'Before 10:00 Asia/Shanghai'}));return;}
    const published=await readJson(path.join(ROOT,'.runtime/last-published.json'),{optional:true});
    if(flags.has('--scheduled')&&published?.runId===dailyId){console.log(JSON.stringify({skipped:true,reason:'Today was already collected, pushed and verified',runId}));return;}
    let existingRun=data.runs.find(r=>r.runId===runId);
    if(!flags.has('--publish-only')&&!existingRun){
      const startedAt=new Date().toISOString();
      const research=await researchNews(data,options,{runId,now});
      const completedAt=new Date().toISOString();
      const run={runId,startedAt,completedAt,status:research.status,addedCount:research.articles.length,checkedSources:research.checkedSources,failures:research.failures,note:research.note};
      if(data.articles.length+research.articles.length>options.maxStoredArticles)throw Error('The retained archive reached its configured maximum; review archive storage before adding records. Existing records were not deleted.');
      data.articles=[...research.articles,...data.articles];
      data.runs=[run,...data.runs].slice(0,120);data.generatedAt=completedAt;data.settings.lastSuccessfulCollectionAt=completedAt;
      validateData(data,sources);await exportData(data);existingRun=run;
    }
    if(flags.has('--publish-only'))existingRun=data.runs[0];
    if(!existingRun)throw Error('No completed collection is available to publish');
    if(existingRun.runId.startsWith('daily-')){
      const audit=await readJson(path.join(ROOT,'.runtime/research',existingRun.runId,'verification.json'),{optional:true});
      if(audit&&audit.checkedSources>=options.minCheckedSources)await atomicJson(path.join(ROOT,'.runtime/last-collection.json'),{ok:true,runId:existingRun.runId,completedAt:existingRun.completedAt,dataVersion:data.publication.dataVersion,checkedSources:existingRun.checkedSources,addedCount:existingRun.addedCount});
    }
    const task=await readJson(path.join(ROOT,'.runtime/task-registration.json'),{optional:true});
    if(task?.registered)data.settings.schedule={enabled:true,time:'10:00',timezone:'Asia/Shanghai',mode:'local',verified:!!published?.verifiedAt};
    validateData(data,sources);await exportData(data);await buildStatic();
    if(flags.has('--collect-only'))console.log(JSON.stringify({ok:true,collected:true,published:false,run:existingRun,dataVersion:data.publication.dataVersion}));
    else{
      const publication=await publishNews(data,options,{runId:existingRun.runId});
      console.log(JSON.stringify({ok:true,collected:!flags.has('--publish-only'),published:true,publication}));
    }
  }catch(error){
    const failure={ok:false,runId,failedAt:new Date().toISOString(),message:error.message};
    await atomicJson(path.join(ROOT,'.runtime/last-failure.json'),failure);console.error(JSON.stringify(failure));process.exitCode=1;
  }finally{await release();}
}
