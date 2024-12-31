import * as CANNON from "cannon";
import * as THREE from "three";
import { stack } from "three/tsl";

window.focus();

let camera, scene, renderer;
let world;
let lastTime;
let pile;
let overhangs;
const boxHeight = 1;
const originalBoxSize = 3;
let autopilot;
let gameEnded;
let robotPrecision; // Determines the precision on autopilot

// Capture DOM Elements
const scoreElement = document.getElementById("score");
const instructionElement = document.getElementById("instructions");
const resultsElement = document.getElementById("results");

// Robot Precision
const setRobotPrecision = () => {
	robotPrecision = Math.random() * 1 - 0.5;
};

const addLayer = (x, z, width, depth, direction) => {
	const y = boxHeight * pile.length;
	const layer = generateBox(x, y, z, width, depth, false);
	layer.direction = direction;
	pile.push(layer);
};

// Init function

const addOverhang = (x, z, width, depth) => {
	const y = boxHeight * (pile.length - 1);
	const overhang = generateBox(x, y, z, width, depth, true);
	overhangs.push(overhang);
};

const generateBox = (x, y, z, width, depth, falls) => {
	// Three.js Objects
	const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
	const color = new THREE.Color(`hsl(${30 + pile.length * 4}, 100%, 50%)`);
	const material = new THREE.MeshLambertMaterial({ color });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(x, y, z);
	scene.add(mesh);

	// Cannon.js Objects
	const shape = new CANNON.Box(
		new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
	);
	let mass = falls ? 5 : 0; // Only only have mass if it can fall
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
};

const cutBox = (topLayer, overlap, size, delta) => {
	const direction = topLayer.direction;
	const newWidth = direction == "x" ? overlap : topLayer.width;
	const newDepth = direction == "z" ? overlap : topLayer.depth;

	topLayer.width = newWidth;
	topLayer.height = newDepth;

	// Update THREE.js Metadata
	topLayer.threejs.scale[direction] = overlap / size;
	topLayer.threejs.position[direction] -= delta / 2;

	// Update CANNON.js Metadata
	topLayer.cannonjs.position[direction] -= delta / 2;

	// Replace shape as required by CANNON
	const shape = new CANNON.Box(
		new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
	);
	topLayer.cannonjs.shapes = [];
	topLayer.cannonjs.addShape(shape);
};

const start = () => {
	autopilot = false;
	gameEnded = false;
	lastTime = 0;
	pile = [];
	overhangs = [];

	if (instructionElement) instructionElement.style.display = "none";
	if (resultsElement) resultsElement.style.display = "none";
	if (scoreElement) scoreElement.innerText = 0;

	if (world) {
		// Remove all objects from world
		while (world.bodies.length > 0) {
			world.remove(world.bodies[0]);
		}
	}

	if (scene) {
		// Remove All Mesh from Scene
		while (scene.children.find((c) => c.type == "mesh")) {
			const mesh = scene.children.find((c) => c.type == "Mesh");
			scene.remove(mesh);
		}
	}

	// Foundational Layer
	addLayer(0, 0, originalBoxSize, originalBoxSize);

	// First Layer
	addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

	if (camera) {
		// Reset Camera positions
		camera.position.set(4, 4, 4);
		camera.lookAt(0, 0, 0);
	}
};

const update = (time) => {
	if (lastTime) {
		const timePassed = time - lastTime;
		const speed = 0.008;

		const topLayer = pile[pile.length - 1];
		const previousLayer = pile[pile.length - 2];

		// IMPORTANT MECHANIC HERE
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

			// If the box falls beyond the screen then it should fall
			if (topLayer.threejs.position[topLayer.direction] > 10) {
				miss();
			}
		} else {
			if (autopilot) {
				CoreGameLoop();
				setRobotPrecision();
			}
		}

		if (camera.position.y < boxHeight * (pile.length - 2) + 4) {
			camera.position.y += speed * timePassed;
		}

		updatePhysics(timePassed);
		renderer.render(scene, camera);
	}
	lastTime = time;
};

const miss = () => {
	const topLayer = pile[pile.length - 1];

	// Turn the top player into an overhang and let it fall!
	addOverhang(
		topLayer.threejs.position.x,
		topLayer.threejs.position.z,
		topLayer.width,
		topLayer.depth
	);

	world.remove(topLayer.cannonjs);
	world.remove(topLayer.threejs);

	gameEnded = true;
	if (resultsElement && !autopilot) resultsElement.style.display = "flex";
};

const CoreGameLoop = () => {
	if (gameEnded) return;

	const topLayer = pile[pile.length - 1];
	const previousLayer = pile[pile.length - 2];
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

		// Next Layer
		const nextX = direction == "x" ? topLayer.threejs.position.x : -10;
		const nextZ = direction == "z" ? topLayer.threejs.position.z : -10;
		const newWidth = topLayer.width;
		const newDepth = topLayer.depth;
		const nextDirection = direction == "x" ? "z" : "x";

		if (scoreElement) scoreElement.innerText = pile.length - 1;
		addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
	} else {
		miss();
	}
};

const eventHandler = () => {
	if (autopilot) start();
	else CoreGameLoop();
};

window.addEventListener("mousedown", eventHandler);
window.addEventListener("touchstart", eventHandler);
window.addEventListener("keydown", (e) => {
	if (e.key == " ") {
		e.preventDefault();
		eventHandler();
		return;
	}
	if (e.key == "R" || e.key == "r") {
		e.preventDefault();
		start();
		return;
	}
});

// Update is called 60fps etc

const updatePhysics = (timePassed) => {
	world.step(timePassed / 1000);

	overhangs.forEach((element) => {
		element.threejs.position.copy(element.cannonjs.position);
		element.threejs.quaternion.copy(element.cannonjs.quaternion);
	});
};

const awake = () => {
	autopilot = true;
	gameEnded = false;
	lastTime = 0;
	pile = [];
	overhangs = [];
	setRobotPrecision();

	// Initialize Cannon.js
	world = new CANNON.World();
	world.gravity.set(0, -10, 0);
	world.broadphase = new CANNON.NaiveBroadphase();
	world.solver.iterations = 40;

	// Initialize Three.js
	const aspectRatio = window.innerWidth / window.innerHeight;
	const width = 10;
	const height = width / aspectRatio;

	// Orthogonal Camera
	camera = new THREE.OrthographicCamera(
		width / -2,
		width / 2,
		height / 2,
		height / -2,
		0,
		100
	);

	camera.position.set(0, 0, 0);
	camera.lookAt(0, 0, 0);

	// Scene
	scene = new THREE.Scene();

	// Foundational Layer
	addLayer(0, 0, originalBoxSize, originalBoxSize);

	// First Layer
	addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

	// Lighting
	const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
	scene.add(ambientLight);

	const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
	dirLight.position.set(10, 20, 0);
	scene.add(dirLight);

	// Set Up Renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(update);
	document.body.appendChild(renderer.domElement);
};

window.addEventListener("resize", () => {
	const aspectRatio = window.innerWidth / window.innerHeight;
	const width = 10;
	const height = width / aspectRatio;

	camera.top = height / 2;
	camera.bottom = height / -2;

	// Reset Renderer
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.render(scene, camera);
});

awake();
