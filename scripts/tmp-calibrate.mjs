import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight, VEHICLE_TYPE_IDS } from '../multiplayer/src/vehicles.js';

const rapier = await initRapier();

async function testForce(type, force) {
	const world = new PhysicsWorld(rapier);
	world.addGround(0, 200);
	const spec = { ...vehicleSpec(type), engineForce: force };
	const y = vehicleRestHeight(type) + 0.1;
	const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });
	for (let i = 0; i < 180; i++) { vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }); world.step(1 / 60); }
	const t = vehicle.transform();
	return t.speed;
}

for (const type of VEHICLE_TYPE_IDS) {
	const spec = vehicleSpec(type);
	console.log(`--- ${type} (mass=${spec.mass}, spec.engineForce=${spec.engineForce}) ---`);
	for (const mult of [1, 2, 3, 4, 5, 6, 8, 10]) {
		const f = spec.engineForce * mult;
		const speed = await testForce(type, f);
		console.log(`  x${mult} (F=${f}) -> speed@3s=${speed.toFixed(2)} m/s`);
	}
}
process.exit(0);
