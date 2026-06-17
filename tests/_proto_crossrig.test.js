import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it } from 'vitest';
import { Object3D, Bone, SkinnedMesh, Skeleton, BufferGeometry, Quaternion, Vector3, Matrix4, Euler, AnimationClip } from 'three';
import { retargetClipToObject } from '../src/animation-retarget.js';
import { canonicalizeBoneName } from '../src/glb-canonicalize.js';
import { CANONICAL_REST } from '../src/animation-canonical-rest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function parseGLBJson(p){
  const buf=fs.readFileSync(p);
  const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
  const c0Len=dv.getUint32(12,true);
  return JSON.parse(new TextDecoder().decode(buf.subarray(20,20+c0Len)));
}
function buildRigFromGLBJson(json){
  const jointIdx=new Set();
  for(const skin of json.skins||[]) for(const j of skin.joints||[]) jointIdx.add(j);
  const objs=json.nodes.map((n,i)=>{
    const o=jointIdx.has(i)?new Bone():new Object3D();
    o.name=n.name||('node'+i);
    if(n.matrix){ new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale); }
    else{ if(n.translation)o.position.fromArray(n.translation); if(n.rotation)o.quaternion.fromArray(n.rotation); if(n.scale)o.scale.fromArray(n.scale); }
    return o;
  });
  json.nodes.forEach((n,i)=>{ if(Array.isArray(n.children)) for(const c of n.children) objs[i].add(objs[c]); });
  const root=new Object3D();
  const childSet=new Set(); json.nodes.forEach(n=>{if(n.children)n.children.forEach(c=>childSet.add(c));});
  json.nodes.forEach((n,i)=>{ if(!childSet.has(i)) root.add(objs[i]); });
  const bones=[...jointIdx].map(i=>objs[i]);
  if(bones.length){ const sm=new SkinnedMesh(new BufferGeometry()); sm.bind(new Skeleton(bones)); root.add(sm); }
  root.updateMatrixWorld(true);
  return root;
}
function buildSyntheticRig(armatureQuat){
  const root=new Object3D();
  const arm=new Object3D(); arm.name='Armature'; arm.quaternion.copy(armatureQuat); root.add(arm);
  const names=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot'];
  const map={};
  for(const nm of names){ const b=new Bone(); b.name=nm; if(CANONICAL_REST[nm])b.quaternion.fromArray(CANONICAL_REST[nm]); map[nm]=b; }
  map.Hips.position.set(0,1,0);
  arm.add(map.Hips);
  for(const nm of names) if(nm!=='Hips') map.Hips.add(map[nm]);
  const sm=new SkinnedMesh(new BufferGeometry()); sm.bind(new Skeleton(names.map(n=>map[n]))); root.add(sm);
  root.updateMatrixWorld(true);
  return root;
}
function loadClip(name){ const c=AnimationClip.parse(JSON.parse(fs.readFileSync(path.join(ROOT,'public/animations/clips',name+'.json')))); c.name=name; return c; }
function findHips(root){ let h=null; root.traverse(n=>{ if(!h&&n.isBone&&canonicalizeBoneName(n.name||'')==='Hips')h=n; }); return h; }
function worldHipNet(root,clip){
  const hips=findHips(root); root.updateMatrixWorld(true);
  const restY=Math.abs(new Vector3().setFromMatrixPosition(hips.matrixWorld).y)||1;
  const parentWorld=hips.parent.matrixWorld.clone();
  const res=retargetClipToObject(clip,root,{minCoverage:0});
  const track=res.clip.tracks.find(t=>t.name===hips.name+'.position');
  const v=track.values, n=v.length/3;
  const p0=new Vector3(v[0],v[1],v[2]).applyMatrix4(parentWorld);
  const pN=new Vector3(v[(n-1)*3],v[(n-1)*3+1],v[(n-1)*3+2]).applyMatrix4(parentWorld);
  return pN.sub(p0).divideScalar(restY);
}
function authoredNet(clip){ const t=clip.tracks.find(t=>/Hips\.position/i.test(t.name)); const v=t.values,n=v.length/3; return new Vector3(v[(n-1)*3]-v[0],v[(n-1)*3+1]-v[1],v[(n-1)*3+2]-v[2]); }

describe('proto', ()=>{
  it('numbers', ()=>{
    const cz=buildRigFromGLBJson(parseGLBJson(path.join(ROOT,'public/avatars/cz.glb')));
    const mi=buildRigFromGLBJson(parseGLBJson(path.join(ROOT,'public/avatars/michelle.glb')));
    const tilt=new Quaternion().setFromEuler(new Euler(25*Math.PI/180,40*Math.PI/180,15*Math.PI/180,'XYZ'));
    const rigC=buildSyntheticRig(tilt);
    const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),30*Math.PI/180);
    const rigD=buildSyntheticRig(yaw);
    const rigs={cz,michelle:mi,tilted:rigC,yawed:rigD};
    for(const clipName of ['av-walk-crouching','jumpdown2','idle','celebrate','walk','jump']){
      const clip=loadClip(clipName); const A=authoredNet(clip), An=A.clone().normalize();
      console.log('=== '+clipName+' authoredNet '+A.toArray().map(x=>x.toFixed(3))+' |A| '+A.length().toFixed(3));
      for(const[name,root] of Object.entries(rigs)){
        const W=worldHipNet(root,clip);
        const cos=A.length()>1e-3? W.clone().normalize().dot(An):NaN;
        console.log('  '+name.padEnd(9)+' W '+W.toArray().map(x=>x.toFixed(4)).join(',').padEnd(26)+' cos '+(isNaN(cos)?'  -  ':cos.toFixed(5))+' XZ '+Math.hypot(W.x,W.z).toFixed(5)+' Y '+W.y.toFixed(5));
      }
    }
  });
});
