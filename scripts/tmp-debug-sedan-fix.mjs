import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight } from '../multiplayer/src/vehicles.js';
const rapier = await initRapier();

for (const restMul of [1.0, 1.5, 2.0, 2.5]) {
	const world = new PhysicsWorld(rapier);
	world.addGround(0, 200);
	const base = vehicleSpec('sedan');
	const rest = base.suspension.rest * restMul;
	const spec = { ...base, suspension: { ...base.suspension, rest } };
	const y = 0.2 + rest + spec.wheel.radius + spec.dims.h * 0.2; // vehicleRestHeight formula, recomputed for new rest
	const vehicle = world.createVehicle({ position: { x: 0, y: y + 0.3, z: 0 }, yaw: 0, spec });
	for (let i = 0; i < 180; i++) { vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }); world.step(1 / 60); }
	const t = vehicle.transform();
	console.log(`rest x${restMul} (${rest.toFixed(2)}m) -> z=${t.z.toFixed(2)} speed=${t.speed.toFixed(2)} y=${t.y.toFixed(3)}`);
}
process.exit(0);
