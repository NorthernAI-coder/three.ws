import { Vector3 } from 'three';
import { Mannequin } from './src/pose-mannequin.js';
const PI = Math.PI, HALF = PI/2;

const NEW = {
  clap: {
    chest: { x: -0.04, y: 0, z: 0 },
    shoulderL: { x: -0.62, y: -0.55, z: 0.22 },
    shoulderR: { x: -0.62, y: 0.55, z: -0.22 },
    elbowL: { x: -1.55, y: 0, z: 0 },
    elbowR: { x: -1.55, y: 0, z: 0 },
    head: { x: 0.05, y: 0, z: 0 },
  },
  shrug: {
    shoulderL: { x: -0.12, y: -0.25, z: 0.48 },
    shoulderR: { x: -0.12, y: 0.25, z: -0.48 },
    elbowL: { x: -1.45, y: 0.30, z: 0 },
    elbowR: { x: -1.45, y: -0.30, z: 0 },
    wristL: { x: 0, y: 0, z: 0.45 },
    wristR: { x: 0, y: 0, z: -0.45 },
    head: { x: 0.12, y: 0, z: 0 },
  },
  bow: {
    pelvis: { x: 0.48, y: 0, z: 0 },
    spine: { x: 0.22, y: 0, z: 0 },
    chest: { x: 0.14, y: 0, z: 0 },
    head: { x: -0.30, y: 0, z: 0 },
    shoulderL: { x: -0.30, y: 0, z: 0.10 },
    shoulderR: { x: -0.30, y: 0, z: -0.10 },
    elbowL: { x: -0.20, y: 0, z: 0 },
    elbowR: { x: -0.20, y: 0, z: 0 },
  },
  victory: {
    chest: { x: -0.06, y: -0.10, z: 0 },
    head: { x: -0.18, y: -0.10, z: 0 },
    shoulderL: { x: 0.15, y: 0, z: 0.12 },
    shoulderR: { x: -0.30, y: 0, z: -PI * 0.86 },
    elbowR: { x: -1.70, y: 0, z: 0 },
    wristR: { x: -0.20, y: 0, z: 0 },
    hipL: { x: 0.04, y: 0, z: 0.04 },
  },
  zombie: {
    shoulderL: { x: -HALF, y: 0, z: 0.10 },
    shoulderR: { x: -HALF, y: 0, z: -0.10 },
    elbowL: { x: -0.18, y: 0, z: 0 },
    elbowR: { x: -0.18, y: 0, z: 0 },
    head: { x: 0.05, y: 0, z: 0 },
  },
  disco: {
    pelvis: { x: 0, y: 0, z: 0.10 },
    chest: { x: 0, y: -0.18, z: -0.04 },
    head: { x: -0.10, y: 0.10, z: 0 },
    shoulderR: { x: -0.35, y: 0, z: -PI * 0.80 },
    elbowR: { x: -0.12, y: 0, z: 0 },
    wristR: { x: -0.15, y: 0, z: 0 },
    shoulderL: { x: 0.45, y: 0, z: 0.18 },
    elbowL: { x: -0.25, y: 0, z: 0 },
    hipR: { x: -0.06, y: 0, z: 0.04 },
  },
};

function handTip(m, side){ m.root.updateMatrixWorld(true); return m.joints['wrist'+side].localToWorld(new Vector3(0,-0.18,0)); }
function jw(m,n){ m.root.updateMatrixWorld(true); return m.joints[n].getWorldPosition(new Vector3()); }

for (const [id, pose] of Object.entries(NEW)) {
  const m = new Mannequin({ build:'male' });
  m.applyPose(pose);
  const head = jw(m,'head');
  const L = handTip(m,'L'), R = handTip(m,'R');
  const ok = L.y > -0.30 && R.y > -0.30 && head.y > 0.2;
  console.log(id.padEnd(8), ok?'OK ':'BAD',
    'head.y', head.y.toFixed(2),
    '| Lhand', L.x.toFixed(2), L.y.toFixed(2), L.z.toFixed(2),
    '| Rhand', R.x.toFixed(2), R.y.toFixed(2), R.z.toFixed(2),
    '| LR-dist', L.distanceTo(R).toFixed(2),
    '| R-head', R.distanceTo(head).toFixed(2));
}
