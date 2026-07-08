import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight } from '../multiplayer/src/vehicles.js';
const rapier = await initRapier();
const world = new PhysicsWorld(rapier);
world.addGround(0, 200);
const spec = { ...vehicleSpec('pickup'), engineForce: 60000 };
const y = vehicleRestHeight('pickup') + 0.1;
const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });
for (let i = 0; i < 40; i++) {
	vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false });
	world.step(1/60);
	if (i % 5 === 0) {
		const eng = [0,1,2,3].map(w => vehicle.controller.wheelEngineForce(w));
		const fwd = [0,1,2,3].map(w => vehicle.controller.wheelForwardImpulse(w)?.toFixed(2));
		const side = [0,1,2,3].map(w => vehicle.controller.wheelSideImpulse(w)?.toFixed(2));
		const brk = [0,1,2,3].map(w => vehicle.controller.wheelBrake(w));
		console.log(`i=${i} eng=${eng} fwd=${fwd} side=${side} brk=${brk}`);
	}
}
process.exit(0);
