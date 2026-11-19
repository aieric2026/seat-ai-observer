import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,canonicalUrl,sourceDomain,validateArticle,verifyEvidence,atomicJson,readJson,validateData} from './news-lib.mjs';
import {researcherArguments,researcherOmittedEnvironmentKeys} from './research.mjs';
import {resolveGit} from './git-runtime.mjs';
import {publicArchive,verifyPublicArchive} from './publish.mjs';
import {deploymentMarker,verifyDeploymentMarker} from './write-deployment-marker.mjs';
const sources=[{domain:'example.com'}],now=new Date('2026-10-28T05:00:00Z');
const article={title:'测试：AI视觉检测',summary:'测试数据，不会发布。',category:'面套',relatedCategories:['面套','骨架','骨架'],aiRelation:'direct',sourceName:'测试来源',url:'https://example.com/article?utm_source=test#section',publishedAt:'2026-10-28',evidenceNote:'自检夹具，非真实资讯。',tags:['测试']};
let checks=0;
const deploymentCommit='a'.repeat(40),olderDeploymentCommit='b'.repeat(40);
assert.equal(verifyDeploymentMarker(deploymentMarker(deploymentCommit),deploymentCommit),deploymentCommit);checks++;
assert.throws(()=>verifyDeploymentMarker(deploymentMarker(olderDeploymentCommit),deploymentCommit),/different deployment commit/);checks++;
assert.throws(()=>verifyDeploymentMarker({commit:deploymentCommit,runId:'leaked-fixture'},deploymentCommit),/only its commit/);checks++;
assert.throws(()=>verifyDeploymentMarker({},deploymentCommit),/only its commit/);checks++;
assert.throws(()=>verifyDeploymentMarker({commit:'short'},deploymentCommit),/40-character/);checks++;
assert.throws(()=>verifyDeploymentMarker(null,deploymentCommit),/only its commit/);checks++;
assert.throws(()=>deploymentMarker('g'.repeat(40)),/40-character/);checks++;
assert.throws(()=>deploymentMarker(undefined),/40-character/);checks++;
assert.equal(canonicalUrl(article.url,sources),'https://example.com/article');checks++;
assert.equal(new Set(['https://www.example.com/a','https://news.example.com/b','https://example.com/c'].map(u=>sourceDomain(u,sources))).size,1);checks++;
const isolatedArgs=await researcherArguments({},'test-result.json');assert.ok(isolatedArgs.includes('mcp_servers={}')&&isolatedArgs.includes('--ignore-user-config')&&isolatedArgs.includes('--no-daemon')&&isolatedArgs.includes('model_provider="openai"'));checks++;
// Git resolution fixtures never execute Git or access real credentials/installations.
const gitHome='C:\\FixtureUser',configuredGit='C:\\OldGit\\cmd\\git.exe',pathGit='C:\\CurrentGit\\cmd\\git.exe';
function gitFixture({files=[],environment={PATH:'C:\\CurrentGit\\cmd'},outputs={},entries=[]}={}){
  const calls=[];
  return {calls,dependencies:{platform:'win32',homeDirectory:gitHome,environment,
    stat:async executable=>({isFile:()=>files.includes(executable)}),
    readdir:async()=>entries.map(name=>({name,isDirectory:()=>true})),
    run:async(executable,args)=>{calls.push({executable,args});if(outputs[executable] instanceof Error)throw outputs[executable];return outputs[executable]??'git version 2.52.0.windows.1\n';}
  }};
}
let gitCase=gitFixture({files:[configuredGit,pathGit]});
assert.equal((await resolveGit({gitExe:configuredGit},gitCase.dependencies)).executable,configuredGit);assert.deepEqual(gitCase.calls,[{executable:configuredGit,args:['--version']}]);checks++;
gitCase=gitFixture({files:[pathGit]});
assert.deepEqual(await resolveGit({gitExe:configuredGit},gitCase.dependencies),{executable:pathGit,source:'PATH',version:'git version 2.52.0.windows.1',configuredPathUnavailable:true});checks++;
gitCase=gitFixture({files:[pathGit],environment:{PATH:'.;relative;C:\\CurrentGit\\cmd'}});
assert.equal((await resolveGit({},gitCase.dependencies)).executable,pathGit);assert.equal(gitCase.calls.length,1);checks++;
const runtimeGit=path.win32.join(gitHome,'.cache','codex-runtimes','codex-primary-runtime','dependencies','native','git','cmd','git.exe');
gitCase=gitFixture({files:[runtimeGit],environment:{}});assert.equal((await resolveGit({gitExe:configuredGit},gitCase.dependencies)).source,'Codex runtime');checks++;
gitCase=gitFixture({files:[configuredGit,pathGit],outputs:{[configuredGit]:new Error('Cannot execute fixture')}});assert.equal((await resolveGit({gitExe:configuredGit},gitCase.dependencies)).executable,pathGit);checks++;
gitCase=gitFixture({files:[configuredGit,pathGit],outputs:{[configuredGit]:'Unrelated executable'}});assert.equal((await resolveGit({gitExe:configuredGit},gitCase.dependencies)).executable,pathGit);checks++;
const portableGit=path.win32.join(gitHome,'.workbuddy','binaries','PortableGit','versions','1.10.0','cmd','git.exe');
gitCase=gitFixture({files:[portableGit],environment:{},entries:['1.2.0','1.10.0']});assert.equal((await resolveGit({},gitCase.dependencies)).executable,portableGit);checks++;
gitCase=gitFixture({environment:{PATH:'.;relative'}});await assert.rejects(()=>resolveGit({gitExe:configuredGit},gitCase.dependencies),/No working installed Git/);assert.equal(gitCase.calls.length,0);checks++;
const fakeEnvironment={OPENAI_API_KEY:'SYNTHETIC',CODEX_API_KEY:'SYNTHETIC',CODEX_ACCESS_TOKEN:'SYNTHETIC',OPENAI_BASE_URL:'https://example.invalid',CHATGPT_BASE_URL:'https://example.invalid',CODEX_HOME:'keep-auth-location',PATH:'keep-path'};
assert.deepEqual(new Set(researcherOmittedEnvironmentKeys(fakeEnvironment)),new Set(['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','CHATGPT_BASE_URL']));checks++;
assert.equal(fakeEnvironment.CODEX_HOME,'keep-auth-location');checks++;
for(const url of ['http://example.com/a','https://example.com.evil.test/a','https://127.0.0.1/a','https://user:credential@example.com/a']){assert.throws(()=>canonicalUrl(url,sources));checks++;}
const normalized=validateArticle(article,{sources,now,newArticle:true});assert.deepEqual(normalized.relatedCategories,['骨架']);checks++;
const privateArchive={articles:[normalized],runs:[{runId:'private-fixture'}],settings:{private:'fixture'},publication:{dataVersion:'private-fingerprint'}};
const publicFixture=publicArchive(privateArchive);
assert.equal(verifyPublicArchive(publicFixture,privateArchive).verificationMode,'public-article-content-sha256');assert.deepEqual(publicFixture.runs,[]);assert.deepEqual(publicFixture.settings,{});assert.equal(publicFixture.publication,undefined);checks++;
assert.throws(()=>verifyPublicArchive({...publicFixture,articles:[]},privateArchive),/count/);checks++;
assert.throws(()=>verifyPublicArchive({...publicFixture,articles:[{...normalized,summary:'Changed same-count fixture'}]},privateArchive),/different article content/);checks++;
assert.throws(()=>verifyPublicArchive({...publicFixture,runs:[{runId:'leaked-fixture'}]},privateArchive),/articles-only contract/);checks++;
assert.throws(()=>verifyPublicArchive({...publicFixture,settings:{schedule:{enabled:true}}},privateArchive),/articles-only contract/);checks++;
assert.throws(()=>verifyPublicArchive({...publicFixture,settings:7},privateArchive),/articles-only contract/);checks++;
assert.throws(()=>verifyPublicArchive({...publicFixture,publication:{dataVersion:'leaked-fixture'}},privateArchive),/articles-only contract/);checks++;
assert.throws(()=>verifyPublicArchive({...publicFixture,articles:[{...normalized,internal:'leaked-fixture'}]},privateArchive),/article fields/);checks++;
const reorderedArticle=Object.fromEntries(Object.entries(normalized).reverse());
assert.equal(verifyPublicArchive({...publicFixture,articles:[reorderedArticle]},privateArchive).publicArchiveSha256,verifyPublicArchive(publicFixture,privateArchive).publicArchiveSha256);checks++;
const namedSources=[{domain:'example.com',name:'Example Official'}];
assert.equal(validateArticle(article,{sources:namedSources,now}).sourceName,'Example Official');checks++;
assert.equal(new Set([article,{...article,sourceName:'另一种显示名'}].map(a=>validateArticle(a,{sources:namedSources,now}).sourceName)).size,1);checks++;
assert.throws(()=>validateArticle({...article,publishedAt:'2026-10-29'},{sources,now,newArticle:true}));checks++;
assert.throws(()=>validateArticle({...article,publishedAt:null},{sources,now,newArticle:true}));checks++;
assert.throws(()=>validateArticle({...article,publishedAt:'2026-01-28'},{sources,now,newArticle:true}));checks++;
assert.throws(()=>validateArticle({...article,publishedAt:'2026-02-30'},{sources,now}));checks++;
assert.throws(()=>validateArticle({...article,category:'伪分类'},{sources,now}));checks++;
const proof={...article,evidenceQuote:'AI detects defects in seat leather',dateEvidenceQuote:'October 28, 2026'};
const page={url:article.url,html:'<time>October 28, 2026</time><p>AI detects defects in seat leather</p>',text:'October 28, 2026 AI detects defects in seat leather',sha256:'test'};
assert.equal(verifyEvidence(proof,page).sourceHash,'test');checks++;
assert.throws(()=>verifyEvidence({...proof,evidenceQuote:'Invented original claim'},page));checks++;
assert.throws(()=>verifyEvidence({...proof,publishedAt:'2026-10-27'},page));checks++;
assert.throws(()=>verifyEvidence(proof,{...page,text:'October 28, 2026 detects defects in seat leather'}));checks++;
const directory=path.join(ROOT,'.runtime','self-test-'+process.pid);await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'state.json');await atomicJson(file,{version:0});
await Promise.all(Array.from({length:50},(_,i)=>atomicJson(file,{version:i+1,articles:[normalized]})));
assert.equal((await readJson(file)).version,50);checks++;
assert.equal((await fs.readdir(directory)).some(n=>n.startsWith('.tmp-')),false);checks++;
assert.throws(()=>validateData({articles:[normalized,normalized],runs:[],settings:{}},sources));checks++;
const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.join(ROOT,'.runtime')+path.sep));await fs.rm(resolved,{recursive:true,force:true});
console.log(JSON.stringify({ok:true,checks,note:'Explicit synthetic fixtures only; no public data was written.'}));
