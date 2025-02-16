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
let canvas;
let isPlaying = false;

const scoreElement = document.getElementById("score");
const instructionsElement = document.getElementById("instructions");
const resultsElement = document.getElementById("results");

awake();

// Determines how precise the game is on autopilot
function setRobotPrecision() {
	robotPrecision = Math.random() * 1 - 0.5;
}

function getBlockColor(index) {
	return new THREE.Color(`hsl(${30 + index * 4}, 100%, 50%)`);
}

function getWashedColor(color) {
	const washedOut = color.clone();
	// Convert to HSL to reduce saturation and increase lightness
	const hsl = {};
	washedOut.getHSL(hsl);
	return washedOut.setHSL(hsl.h, hsl.s * 0.8, Math.min(hsl.l * 1.2, 0.95));
}

function updateCameraAspect() {
	const aspect = window.innerWidth / window.innerHeight;

	// Base width that looks good on desktop
	let width = 10;

	// Adjust width for mobile screens
	if (window.innerWidth < 768) {
		width = 6.5; // Increase base width on mobile for better visibility
	}

	const height = width / aspect;

	camera.left = width / -2;
	camera.right = width / 2;
	camera.top = height / 2;
	camera.bottom = height / -2;
	camera.updateProjectionMatrix();
}

function setupRenderer() {
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for better performance
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(update);

	// Store canvas reference and add specific class
	canvas = renderer.domElement;
	canvas.classList.add("game-canvas");
	document.body.appendChild(canvas);

	window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
	renderer.setSize(window.innerWidth, window.innerHeight);
	updateCameraAspect();
}

function awake() {
	autopilot = true;
	gameEnded = false;
	isPlaying = false;
	lastTime = 0;
	stack = [];
	overhangs = [];
	setRobotPrecision();

	if (instructionsElement) instructionsElement.style.display = "flex";
	if (resultsElement) resultsElement.style.display = "none";
	if (scoreElement) scoreElement.innerText = 0;

	// Initialize CannonJS
	world = new CANNON.World();
	world.gravity.set(0, -10, 0); // Gravity pulls things down
	world.broadphase = new CANNON.NaiveBroadphase();
	world.solver.iterations = 40;

	// Initialize ThreeJs
	const aspect = window.innerWidth / window.innerHeight;
	// NB Make it mobile responsive
	const width = window.innerWidth < 768 ? 5 : 10;
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

	// Adjust camera position based on screen size
	const cameraDistance = window.innerWidth < 768 ? 15 : 6;
	camera.position.set(cameraDistance, cameraDistance, cameraDistance);
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
	setupRenderer();
	addEventListeners();
}

function start() {
	autopilot = false;
	gameEnded = false;
	isPlaying = true;
	lastTime = 0;
	stack = [];
	overhangs = [];
	setRobotPrecision();

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

	removeEventListeners();
	addEventListeners();
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
	const color = getBlockColor(stack.length - 1);
	const material = new THREE.MeshLambertMaterial({ color });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(x, y, z);
	scene.add(mesh);

	// Update scene background with washed out version of the current block color
	if (!falls) {
		// Only update for new blocks, not overhangs
		const bgColor = getWashedColor(color);
		scene.background = bgColor;
	}

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

function removeEventListeners() {
	window.removeEventListener("mousedown", eventHandler);
	window.removeEventListener("touchstart", eventHandler);
	canvas.removeEventListener("mousedown", eventHandler);
	canvas.removeEventListener("touchstart", eventHandler);
}

function addEventListeners() {
	removeEventListeners();

	// Canvas Event Listeners
	canvas.addEventListener("mousedown", eventHandler);
	canvas.addEventListener("touchstart", eventHandler);

	// Add keyboard event listeners
	window.addEventListener("keydown", handleKeyDown);
}

function handleKeyDown(event) {
	if (event.key === " " || event.key === "Spacebar") {
		event.preventDefault();

		if (autopilot) {
			start();
		} else if (isPlaying && !gameEnded) {
			CoreGameLoop();
		}
	}

	if (event.key === "R" || event.key === "r") {
		event.preventDefault();
		start();
	}
}

function eventHandler(event) {
	event.preventDefault();

	// Only handle events from canvas or when in autopilot
	if (!event.target.classList.contains("game-canvas") && !autopilot) {
		return;
	}

	if (autopilot) {
		start();
		addEventListeners();
	}

	if (isPlaying && !gameEnded) {
		CoreGameLoop();
	}
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
	isPlaying = true;
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
	updateCameraAspect();
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.render(scene, camera);
});

// Make sure device orientation changes are handled properly
window.addEventListener("orientationchange", () => {
	// Small delay to ensure new dimensions are available
	setTimeout(() => {
		updateCameraAspect();
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.render(scene, camera);
	}, 100);
});

// Add event listeners for the new UI controls
document.addEventListener("DOMContentLoaded", function () {
	const placeBlockBtn = document.getElementById("placeBlock");
	const replayButton = document.getElementById("replayButton");
	const startButton = document.getElementById("startButton"); // Correctly target 'startButton'

	placeBlockBtn.addEventListener("click", function (e) {
		e.preventDefault();
		if (autopilot) {
			start();
		} else if (isPlaying && !gameEnded) {
			CoreGameLoop();
		}
	});

	placeBlockBtn.addEventListener("touchstart", function (e) {});

	startButton.addEventListener("click", function (e) {
		// Correctly target 'startButton'
		e.preventDefault();
		start();
	});

	replayButton.addEventListener("click", function (e) {
		e.preventDefault();
		start();
	});
});
