import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';
import { vehicleSpec, vehicleRestHeight } from '../multiplayer/src/vehicles.js';

const rapier = await initRapier();
const world = new PhysicsWorld(rapier);
world.addGround(0, 200);
const spec = vehicleSpec('sedan');
const y = vehicleRestHeight('sedan') + 0.1;
const vehicle = world.createVehicle({ position: { x: 0, y, z: 0 }, yaw: 0, spec });
console.log('indexUpAxis readback:', vehicle.controller.indexUpAxis);
console.log('indexForwardAxis readback:', vehicle.controller.indexForwardAxis);
console.log('numWheels:', vehicle.controller.numWheels());
for (let i=0;i<4;i++) console.log(' wheel', i, 'conn', vehicle.controller.wheelChassisConnectionPointCs(i), 'axle', vehicle.controller.wheelAxleCs(i), 'dir', vehicle.controller.wheelDirectionCs(i));
process.exit(0);
