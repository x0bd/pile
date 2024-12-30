import * as CANNON from "cannon";
import * as THREE from "three";

// Init function
const awake = () => {
	// Scene
	const scene = new THREE.Scene();

	// Add a cube to the scene
	const geometry = new THREE.BoxGeometry(3, 1, 3);
	const material = new THREE.MeshLambertMaterial({ color: 0xfb8e00 });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(0, 0, 0);
	scene.add(mesh);

	// Set Up Lights
	const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
	scene.add(ambientLight);

	const directionalLight = new THREE.DirectionalLight(0xffffff, 2.25);
	directionalLight.position.set(10, 20, 0);
	scene.add(directionalLight);

	// Camera
	const width = 10;
	const height = width * (window.innerHeight / window.innerWidth);
	const camera = new THREE.OrthographicCamera(
		width / -2,
		width / 2,
		height / 2,
		height / -2
	);

	camera.position.set(4, 4, 4);
	camera.lookAt(0, 0, 0);

	// Renderer
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.render(scene, camera);

	// Add it to HTML
	document.body.appendChild(renderer.domElement);
};

awake();
