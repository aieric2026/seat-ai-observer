import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,command,sleep,atomicJson} from './news-lib.mjs';

export async function publishNews(data,options,{runId}={}){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository??''))throw Error('Configure the verified GitHub repository owner/name before publishing');
  const repo=options.repository,expectedRemote=`https://github.com/${repo}.git`;
  const url=new URL(options.pagesUrl);if(url.protocol!=='https:'||url.username||url['pass'+'word']||!url.hostname.endsWith('.github.io'))throw Error('Configure the verified HTTPS github.io Pages URL');
  const git=options.gitExe??'git';
  const remote=(await command(git,['remote','get-url','origin'])).trim();
  if(![expectedRemote,expectedRemote.slice(0,-4)].includes(remote))throw Error('Refusing to push: origin does not match the configured GitHub repository');
  const staged=(await command(git,['diff','--cached','--name-only'])).trim().split(/\r?\n/).filter(Boolean);
  const publishPaths=['data/news.json','public/data/news.json'];
  if(staged.some(p=>!publishPaths.includes(p)))throw Error('Unrelated changes are staged; finish their review before the daily updater runs');
  // Authenticate non-interactively via the official Git credential helper set up by the owner.
  await command(git,['ls-remote','--heads','origin','main'],{timeoutMs:60000,logFile:path.join(ROOT,'.runtime/logs/git-access.log')});
  await command(git,['add','--',...publishPaths]);
  const changes=(await command(git,['diff','--cached','--name-only'])).trim();
  if(changes)await command(git,['commit','-m',`Update seat AI news ${runId}`],{timeoutMs:60000,logFile:path.join(ROOT,'.runtime/logs/git-commit.log')});
  const commit=(await command(git,['rev-parse','HEAD'])).trim();if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Unable to determine the exact source commit');
  await command(git,['push','origin','HEAD:main'],{timeoutMs:120000,logFile:path.join(ROOT,'.runtime/logs/git-push.log')});
  const expected=data.publication?.dataVersion;if(!/^[a-f0-9]{64}$/.test(expected??''))throw Error('Missing data-version fingerprint');
  const dataUrl=new URL('data/news.json',url.href.endsWith('/')?url.href:url.href+'/');
  const deadline=Date.now()+options.deploymentTimeoutMinutes*60000;let lastError='Not yet deployed';
  while(Date.now()<deadline){
    try{
      const attemptUrl=new URL(dataUrl);attemptUrl.searchParams.set('verify',expected.slice(0,16));attemptUrl.searchParams.set('t',String(Date.now()));
      const response=await fetch(attemptUrl,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error(`Pages HTTP ${response.status}`);
      const live=await response.json();
      if(live.publication?.dataVersion!==expected)throw Error('Pages still serves an earlier data version');
      if(live.articles?.length!==data.articles.length||!live.runs?.some(r=>r.runId===runId))throw Error('Pages readback did not match the expected run and article count');
      const status={ok:true,runId,commit,dataVersion:expected,articles:live.articles.length,verifiedAt:new Date().toISOString(),url:options.pagesUrl};
      await atomicJson(path.join(ROOT,'.runtime/last-published.json'),status);return status;
    }catch(error){lastError=error.message;}
    await sleep(20000);
  }
  throw Error(`Source pushed, but Pages deployment was not verified before timeout: ${lastError}. Retry with --publish-only; do not collect duplicate records.`);
}
