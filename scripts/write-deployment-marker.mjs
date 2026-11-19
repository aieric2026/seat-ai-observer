import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,atomicJson} from './news-lib.mjs';

export function deploymentMarker(commit){
  if(typeof commit!=='string'||!/^[a-f0-9]{40}$/i.test(commit))throw Error('Deployment commit must be a complete 40-character hexadecimal SHA');
  return {commit};
}
export function verifyDeploymentMarker(marker,expectedCommit){
  deploymentMarker(expectedCommit);
  if(!marker||typeof marker!=='object'||Array.isArray(marker)||Object.keys(marker).join(',')!=='commit')throw Error('Pages deployment marker must contain only its commit');
  deploymentMarker(marker.commit);
  if(marker.commit!==expectedCommit)throw Error('Pages still serves a different deployment commit');
  return marker.commit;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const marker=deploymentMarker(process.env.GITHUB_SHA);
  await atomicJson(path.join(ROOT,'dist','deployment.json'),marker);
  console.log(JSON.stringify({ok:true,commit:marker.commit}));
}
