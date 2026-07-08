import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight } from '../multiplayer/src/vehicles.js';
const rapier = await initRapier();
const world = new PhysicsWorld(rapier);
world.addGround(0, 200);
const spec = { ...vehicleSpec('sedan'), engineForce: 35000 };
const y = vehicleRestHeight('sedan') + 0.1;
const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });
for (let i = 0; i < 120; i++) { vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }); world.step(1/60); }
const t = vehicle.transform();
console.log('F=35000 ->', 'z=' + t.z.toFixed(3), 'speed=' + t.speed.toFixed(3));
process.exit(0);
