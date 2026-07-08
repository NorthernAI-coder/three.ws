import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight } from '../multiplayer/src/vehicles.js';

const rapier = await initRapier();
const world = new PhysicsWorld(rapier);
world.addGround(0, 200);
const spec = vehicleSpec('sedan');
const y = vehicleRestHeight('sedan') + 0.1;
const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });

for (let i = 0; i < 120; i++) {
	vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false });
	world.step(1/60);
	if (i % 20 === 0) {
		const t = vehicle.transform();
		const contacts = [0,1,2,3].map(w => vehicle.controller.wheelIsInContact(w));
		const susp = [0,1,2,3].map(w => vehicle.controller.wheelSuspensionLength(w));
		const eng = [0,1,2,3].map(w => vehicle.controller.wheelEngineForce(w));
		console.log(`i=${i} y=${t.y.toFixed(3)} z=${t.z.toFixed(3)} speed=${t.speed.toFixed(3)} contacts=${contacts} susp=${susp.map(s=>s?.toFixed(3))} eng=${eng}`);
	}
}
process.exit(0);
