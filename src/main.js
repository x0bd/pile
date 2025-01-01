// Uses Cannon.js and Three.js, these models MUST kept in sync

import * as THREE from "three";
import * as CANNON from "cannon";

window.focus(); // Capture keys right away (by default focus is on editor)

let camera, scene, renderer;
let world;
let lastTime;
let stack;
let overhangs;
const boxHeight = 1;
const originalBoxSize = 3;
let autopilot;
let gameEnded;
let robotPrecision; // Determines how precise the game is on autopilot

const scoreElement = document.getElementById("score");
const instructionsElement = document.getElementById("instructions");
const resultsElement = document.getElementById("results");

awake();

// Determines how precise the game is on autopilot
function setRobotPrecision() {
	robotPrecision = Math.random() * 1 - 0.5;
}

function awake() {
	autopilot = true;
	gameEnded = false;
	lastTime = 0;
	stack = [];
	overhangs = [];
	setRobotPrecision();

	// Initialize CannonJS
	world = new CANNON.World();
	world.gravity.set(0, -10, 0); // Gravity pulls things down
	world.broadphase = new CANNON.NaiveBroadphase();
	world.solver.iterations = 40;

	// Initialize ThreeJs
	const aspect = window.innerWidth / window.innerHeight;
	const width = 10;
	const height = width / aspect;

	// Orthogonal Camera Yay!!!
	camera = new THREE.OrthographicCamera(
		width / -2,
		width / 2,
		height / 2,
		height / -2,
		0,
		100
	);

	camera.position.set(4, 4, 4);
	camera.lookAt(0, 0, 0);

	scene = new THREE.Scene();

	// Foundational Layer
	addLayer(0, 0, originalBoxSize, originalBoxSize);

	// First layer
	addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

	// Set up lights
	const ambientLight = new THREE.AmbientLight(0xffffff, 2);
	scene.add(ambientLight);

	const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
	dirLight.position.set(10, 20, 0);
	scene.add(dirLight);

	// Set up renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(update);
	document.body.appendChild(renderer.domElement);
}

function start() {
	autopilot = false;
	gameEnded = false;
	lastTime = 0;
	stack = [];
	overhangs = [];

	if (instructionsElement) instructionsElement.style.display = "none";
	if (resultsElement) resultsElement.style.display = "none";
	if (scoreElement) scoreElement.innerText = 0;

	// Remove Objects and Mesh from the world and scene respectively
	if (world) {
		while (world.bodies.length > 0) {
			world.remove(world.bodies[0]);
		}
	}

	if (scene) {
		while (scene.children.find((c) => c.type == "Mesh")) {
			const mesh = scene.children.find((c) => c.type == "Mesh");
			scene.remove(mesh);
		}

		// Foundational Layer
		addLayer(0, 0, originalBoxSize, originalBoxSize);

		// First layer
		addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");
	}

	if (camera) {
		camera.position.set(4, 4, 4);
		camera.lookAt(0, 0, 0);
	}
}

function addLayer(x, z, width, depth, direction) {
	const y = boxHeight * stack.length; // Add the new box one layer higher
	const layer = generateBox(x, y, z, width, depth, false);
	layer.direction = direction;
	stack.push(layer);
}

function addOverhang(x, z, width, depth) {
	const y = boxHeight * (stack.length - 1); // Add the new box one the same layer
	const overhang = generateBox(x, y, z, width, depth, true);
	overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
	// ThreeJS
	const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
	const color = new THREE.Color(`hsl(${30 + stack.length * 4}, 100%, 50%)`);
	const material = new THREE.MeshLambertMaterial({ color });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(x, y, z);
	scene.add(mesh);

	// CannonJS
	const shape = new CANNON.Box(
		new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
	);
	let mass = falls ? 5 : 0; //
	mass *= width / originalBoxSize;
	mass *= depth / originalBoxSize;
	const body = new CANNON.Body({ mass, shape });
	body.position.set(x, y, z);
	world.addBody(body);

	return {
		threejs: mesh,
		cannonjs: body,
		width,
		depth,
	};
}

function cutBox(topLayer, overlap, size, delta) {
	const direction = topLayer.direction;
	const newWidth = direction == "x" ? overlap : topLayer.width;
	const newDepth = direction == "z" ? overlap : topLayer.depth;

	topLayer.width = newWidth;
	topLayer.depth = newDepth;

	// Update ThreeJS model
	topLayer.threejs.scale[direction] = overlap / size;
	topLayer.threejs.position[direction] -= delta / 2;

	// Update CannonJS model
	topLayer.cannonjs.position[direction] -= delta / 2;

	// Update Cannon.js differently
	const shape = new CANNON.Box(
		new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
	);
	topLayer.cannonjs.shapes = [];
	topLayer.cannonjs.addShape(shape);
}

window.addEventListener("mousedown", eventHandler);
window.addEventListener("touchstart", eventHandler);
window.addEventListener("keydown", function (event) {
	if (event.key == " ") {
		event.preventDefault();
		eventHandler();
		return;
	}
	if (event.key == "R" || event.key == "r") {
		event.preventDefault();
		start();
		return;
	}
});

function eventHandler() {
	if (autopilot) start();
	else CoreGameLoop();
}

function CoreGameLoop() {
	if (gameEnded) return;

	const topLayer = stack[stack.length - 1];
	const previousLayer = stack[stack.length - 2];
	const direction = topLayer.direction;

	const size = direction == "x" ? topLayer.width : topLayer.depth;
	const delta =
		topLayer.threejs.position[direction] -
		previousLayer.threejs.position[direction];
	const overhangSize = Math.abs(delta);
	const overlap = size - overhangSize;

	if (overlap > 0) {
		cutBox(topLayer, overlap, size, delta);

		// Overhang
		const overhangShift =
			(overlap / 2 + overhangSize / 2) * Math.sign(delta);
		const overhangX =
			direction == "x"
				? topLayer.threejs.position.x + overhangShift
				: topLayer.threejs.position.x;
		const overhangZ =
			direction == "z"
				? topLayer.threejs.position.z + overhangShift
				: topLayer.threejs.position.z;
		const overhangWidth = direction == "x" ? overhangSize : topLayer.width;
		const overhangDepth = direction == "z" ? overhangSize : topLayer.depth;

		addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

		// Next layer
		const nextX = direction == "x" ? topLayer.threejs.position.x : -10;
		const nextZ = direction == "z" ? topLayer.threejs.position.z : -10;
		const newWidth = topLayer.width; // New layer has the same size as the cut top layer
		const newDepth = topLayer.depth; // New layer has the same size as the cut top layer
		const nextDirection = direction == "x" ? "z" : "x";

		if (scoreElement) scoreElement.innerText = stack.length - 1;
		addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
	} else {
		miss();
	}
}

function miss() {
	const topLayer = stack[stack.length - 1];

	// Turn to top layer into an overhang and let it fall down
	addOverhang(
		topLayer.threejs.position.x,
		topLayer.threejs.position.z,
		topLayer.width,
		topLayer.depth
	);
	world.remove(topLayer.cannonjs);
	scene.remove(topLayer.threejs);

	gameEnded = true;
	if (resultsElement && !autopilot) resultsElement.style.display = "flex";
}

function update(time) {
	if (lastTime) {
		const timePassed = time - lastTime;
		const speed = 0.008;

		const topLayer = stack[stack.length - 1];
		const previousLayer = stack[stack.length - 2];

		const boxShouldMove =
			!gameEnded &&
			(!autopilot ||
				(autopilot &&
					topLayer.threejs.position[topLayer.direction] <
						previousLayer.threejs.position[topLayer.direction] +
							robotPrecision));

		if (boxShouldMove) {
			topLayer.threejs.position[topLayer.direction] += speed * timePassed;
			topLayer.cannonjs.position[topLayer.direction] +=
				speed * timePassed;

			// If the box went beyond the stack then show up the fail screen
			if (topLayer.threejs.position[topLayer.direction] > 10) {
				miss();
			}
		} else {
			// If it shouldn't move then is it because the autopilot reached the correct position?
			// Because if so then next level is coming
			if (autopilot) {
				CoreGameLoop();
				setRobotPrecision();
			}
		}

		// 4 is the initial camera height
		if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
			camera.position.y += speed * timePassed;
		}

		updatePhysics(timePassed);
		renderer.render(scene, camera);
	}
	lastTime = time;
}

function updatePhysics(timePassed) {
	world.step(timePassed / 1000);

	overhangs.forEach((element) => {
		element.threejs.position.copy(element.cannonjs.position);
		element.threejs.quaternion.copy(element.cannonjs.quaternion);
	});
}

window.addEventListener("resize", () => {
	// Adjust camera
	console.log("resize", window.innerWidth, window.innerHeight);
	const aspect = window.innerWidth / window.innerHeight;
	const width = 10;
	const height = width / aspect;

	camera.top = height / 2;
	camera.bottom = height / -2;

	// Reset renderer
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.render(scene, camera);
});
