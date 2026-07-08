import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight, VEHICLE_TYPE_IDS } from '../multiplayer/src/vehicles.js';
const rapier = await initRapier();
for (const type of VEHICLE_TYPE_IDS) {
	const world = new PhysicsWorld(rapier);
	world.addGround(0, 200);
	const spec = vehicleSpec(type);
	const y = vehicleRestHeight(type) + 0.1;
	const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });
	for (let i = 0; i < 180; i++) { vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }); world.step(1 / 60); }
	const t = vehicle.transform();
	console.log(`${type}: after 3s stock throttle -> z=${t.z.toFixed(2)}m speed=${t.speed.toFixed(2)} m/s (topSpeed spec=${spec.topSpeed})`);
}
process.exit(0);
