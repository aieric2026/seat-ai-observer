import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {command} from './news-lib.mjs';

// Resolve a concrete executable afresh: application upgrades can remove versioned paths.
// This probes only installed files and `git --version`; it never reads credentials.
export async function resolveGit(options={},dependencies={}){
  const platform=dependencies.platform??process.platform;
  const paths=platform==='win32'?path.win32:path.posix;
  const environment=dependencies.environment??process.env;
  const home=dependencies.homeDirectory??os.homedir();
  const stat=dependencies.stat??fs.stat,readdir=dependencies.readdir??fs.readdir;
  const run=dependencies.run??command,candidates=[],seen=new Set();
  const absolute=value=>typeof value==='string'&&(platform==='win32'?/^[a-z]:[\\/]/i.test(value):paths.isAbsolute(value));
  function add(value,source){
    if(!absolute(value))return;
    const executable=paths.normalize(value),key=platform==='win32'?executable.toLowerCase():executable;
    if(!seen.has(key)){seen.add(key);candidates.push({executable,source});}
  }
  add(options.gitExe,'configured');
  const searchPath=Object.entries(environment).find(([key])=>key.toLowerCase()==='path')?.[1]??'';
  for(const directory of searchPath.split(platform==='win32'?';':':')){
    const cleaned=directory.trim().replace(/^"(.*)"$/,'$1');
    if(absolute(cleaned))add(paths.join(cleaned,platform==='win32'?'git.exe':'git'),'PATH');
  }
  if(platform==='win32'){
    for(const base of [environment.LOCALAPPDATA&&paths.join(environment.LOCALAPPDATA,'Programs','Git'),environment.ProgramFiles&&paths.join(environment.ProgramFiles,'Git'),environment['ProgramFiles(x86)']&&paths.join(environment['ProgramFiles(x86)'],'Git')]){
      if(base)add(paths.join(base,'cmd','git.exe'),'Git installation');
    }
    add(paths.join(home,'.cache','codex-runtimes','codex-primary-runtime','dependencies','native','git','cmd','git.exe'),'Codex runtime');
    add(paths.join(home,'Tools','MinGit','cmd','git.exe'),'MinGit installation');
  }
  async function probe(candidate){
    try{
      if(!(await stat(candidate.executable)).isFile())return null;
      const output=await run(candidate.executable,['--version'],{timeoutMs:10000});
      const version=output.split(/\r?\n/).find(line=>/^git version \d+\.\d+/i.test(line.trim()));
      if(!version)return null;
      return {...candidate,version:version.trim(),configuredPathUnavailable:!!options.gitExe&&candidate.source!=='configured'};
    }catch{return null;}
  }
  for(const candidate of candidates){const selected=await probe(candidate);if(selected)return selected;}
  if(platform==='win32'){
    const versions=paths.join(home,'.workbuddy','binaries','PortableGit','versions');
    try{
      const entries=(await readdir(versions,{withFileTypes:true})).filter(entry=>entry.isDirectory()).sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}));
      for(const entry of entries)add(paths.join(versions,entry.name,'cmd','git.exe'),'WorkBuddy PortableGit');
    }catch{}
    for(const candidate of candidates.filter(candidate=>candidate.source==='WorkBuddy PortableGit')){const selected=await probe(candidate);if(selected)return selected;}
  }
  throw Error('No working installed Git executable was found. Restore Git or re-run Configure-Local.ps1; existing news was preserved.');
}
