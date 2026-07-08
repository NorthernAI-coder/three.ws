import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec } from '../multiplayer/src/vehicles.js';
const rapier = await initRapier();
function restHeightFor(spec) { return spec.dims.h/2*0.2 + spec.suspension.rest + spec.wheel.radius; }
async function test(type, restOverride) {
	const world = new PhysicsWorld(rapier);
	world.addGround(0, 200);
	const base = vehicleSpec(type);
	const spec = { ...base, suspension: { ...base.suspension, rest: restOverride } };
	const y = restHeightFor(spec) + 0.1;
	const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });
	for (let i = 0; i < 180; i++) { vehicle.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false }); world.step(1 / 60); }
	const t = vehicle.transform();
	console.log(`${type} rest=${restOverride} -> z=${t.z.toFixed(2)} speed=${t.speed.toFixed(2)} (top=${spec.topSpeed})`);
}
await test('coupe', 0.32); // stock
await test('coupe', 0.4);
await test('coupe', 0.44);
await test('coupe', 0.48);
console.log('---buggy sanity (should stay good, no change planned)---');
await test('buggy', 0.46);
process.exit(0);
