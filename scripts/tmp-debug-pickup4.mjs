import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight } from '../multiplayer/src/vehicles.js';
const rapier = await initRapier();

// Test A: spawn much higher to rule out initial chassis-ground embedding.
{
	const world = new PhysicsWorld(rapier);
	world.addGround(0, 200);
	const spec = { ...vehicleSpec('pickup'), engineForce: 60000 };
	const vehicle = world.createVehicle({ position: { x: 0, y: vehicleRestHeight('pickup') + 1.0, z: 0 }, yaw: 0, spec });
	for (let i = 0; i < 150; i++) { vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }); world.step(1 / 60); }
	const t = vehicle.transform();
	console.log('A) spawn+1.0m higher -> z=', t.z.toFixed(3), 'speed=', t.speed.toFixed(3), 'y=', t.y.toFixed(3));
}

// Test B: much larger suspension rest length (more clearance).
{
	const world = new PhysicsWorld(rapier);
	world.addGround(0, 200);
	const spec = { ...vehicleSpec('pickup'), engineForce: 60000, suspension: { ...vehicleSpec('pickup').suspension, rest: 0.9 } };
	const vehicle = world.createVehicle({ position: { x: 0, y: vehicleRestHeight('pickup') + 0.5, z: 0 }, yaw: 0, spec });
	for (let i = 0; i < 150; i++) { vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }); world.step(1 / 60); }
	const t = vehicle.transform();
	console.log('B) suspension.rest=0.9 -> z=', t.z.toFixed(3), 'speed=', t.speed.toFixed(3), 'y=', t.y.toFixed(3));
}
process.exit(0);
