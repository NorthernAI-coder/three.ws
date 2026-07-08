import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight } from '../multiplayer/src/vehicles.js';
const rapier = await initRapier();
const world = new PhysicsWorld(rapier);
world.addGround(0, 200);
const spec = { ...vehicleSpec('pickup'), engineForce: 60000 };
const y = vehicleRestHeight('pickup') + 0.1;
const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });
for (let i = 0; i < 120; i++) {
	vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false });
	world.step(1/60);
	if (i % 10 === 0) {
		const lv = vehicle.body.linvel();
		const t = vehicle.body.translation();
		console.log(`i=${i} pos=(${t.x.toFixed(3)},${t.y.toFixed(3)},${t.z.toFixed(3)}) linvel=(${lv.x.toFixed(3)},${lv.y.toFixed(3)},${lv.z.toFixed(3)}) ctrlSpeed=${vehicle.controller.currentVehicleSpeed().toFixed(3)}`);
	}
}
process.exit(0);
