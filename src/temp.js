function updateCameraAspect() {
	const aspect = window.innerWidth / window.innerHeight;

	// Base width that looks good on desktop
	let width = 10;

	// Adjust width for mobile screens
	if (window.innerWidth < 768) {
		width = 15; // Increase base width on mobile for better visibility
	}

	const height = width / aspect;

	camera.left = width / -2;
	camera.right = width / 2;
	camera.top = height / 2;
	camera.bottom = height / -2;
	camera.updateProjectionMatrix();
}
