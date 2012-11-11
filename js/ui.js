"use strict";
var renderStats, physicsStats, rendererInfo;

function initUI() {
	var container = document.getElementById('container');

	container.innerHTML = "";
	container.appendChild(renderer.domElement);

	renderStats = new Stats();
	renderStats.domElement.style.position = 'absolute';
	renderStats.domElement.style.bottom = '0px';
	container.appendChild(renderStats.domElement);

	physicsStats = new Stats();
	physicsStats.domElement.style.position = 'absolute';
	physicsStats.domElement.style.bottom = '0px';
	physicsStats.domElement.style.left = '85px';
	container.appendChild(physicsStats.domElement);

	rendererInfo = document.getElementById("renderer-info");

	container.requestPointerLock = container.requestPointerLock ||
			container.mozRequestPointerLock || container.webkitRequestPointerLock;

	container.requestFullscreen = container.requestFullscreen ||
		container.mozRequestFullscreen || container.mozRequestFullScreen || container.webkitRequestFullscreen;

	$(window).resize(onWindowResize);
	$(window).blur(pause);
	$(window).focus(resume);
	$("#instructions").click(function() {
		// Firefox doesn't support fullscreenless pointer lock, so resort to this hack
		if (/Firefox/i.test(navigator.userAgent)) {
			var onFullscreenChange = function(event) {
				if (document.fullscreenElement || document.mozFullscreenElement || document.mozFullScreenElement) {
					document.removeEventListener('fullscreenchange', onFullscreenChange);
					document.removeEventListener('mozfullscreenchange', onFullscreenChange);
					container.requestPointerLock();
				}
			};
			document.addEventListener('fullscreenchange', onFullscreenChange, false);
			document.addEventListener('mozfullscreenchange', onFullscreenChange, false);
			container.requestFullscreen();
		} else {
			container.requestPointerLock();
		}
	});

	document.addEventListener('pointerlockchange', onPointerLockChange, false);
	document.addEventListener('webkitpointerlockchange', onPointerLockChange, false);
	document.addEventListener('mozpointerlockchange', onPointerLockChange, false);
	$("#instructions").show();

	// GUI controls
	var gui = new dat.GUI();
	gui.add(CONFIG, "showStats").onChange(updateConfig);
	gui.add(CONFIG, "quarterMode").onChange(function() { updateConfig(); onWindowResize(); });
	gui.add(controls, "mouseFallback");
	gui.add(window, "editLevel");
	var guiRenderer = gui.addFolder("Renderer options (reload required)");
	guiRenderer.add(CONFIG, "antialias").onChange(updateConfig);
	guiRenderer.add(CONFIG, "physicalShading").onChange(updateConfig);
	guiRenderer.add(CONFIG, "normalMapping").onChange(updateConfig);
	guiRenderer.add(CONFIG, "specularMapping").onChange(updateConfig);
	guiRenderer.add(CONFIG, "particles").onChange(updateConfig);
	guiRenderer.add(window, "reload");
	var guiLighting = gui.addFolder("Light and shadow");
	guiLighting.add(CONFIG, "maxLights", 0, 6).step(1).onChange(updateConfig);
	guiLighting.add(CONFIG, "maxShadows", 0, 6).step(1).onChange(updateConfig);
	guiLighting.add(CONFIG, "shadows").onChange(updateMaterials);
	guiLighting.add(CONFIG, "softShadows").onChange(updateMaterials);
	var guiTextures = gui.addFolder("Texture options");
	guiTextures.add(CONFIG, "anisotropy", 1, renderer.getMaxAnisotropy()).step(1).onChange(updateTextures);
	guiTextures.add(CONFIG, "linearTextureFilter").onChange(updateTextures);
	var guiPostproc = gui.addFolder("Post-processing");
	guiPostproc.add(CONFIG, "postprocessing").onChange(updateConfig);
	guiPostproc.add(CONFIG, "SSAO").onChange(updateConfig);
	guiPostproc.add(CONFIG, "FXAA").onChange(updateConfig);
	guiPostproc.add(CONFIG, "bloom").onChange(updateConfig);
	gui.close();
}

function updateHUD() {
	$("#health").html(pl.hp);
	$("#bullets").html(pl.bullets);
	$("#clips").html(pl.clips);
}

var messageTimer = null;
function displayMessage(msg) {
	if (messageTimer)
		window.clearTimeout(messageTimer);
	$("#message").html(msg).fadeIn(2000);
	messageTimer = window.setTimeout(function() {
		$("#message").fadeOut(5000);
		messageTimer = null;
	}, 5000);
}

function displayMinorMessage(msg) {
	var elem = $("#minor-messages");
	if (!elem.is(':visible')) elem.html("");
	elem.stop(true, true);
	elem.prepend(msg + "<br/>").show();
	elem.fadeOut(5000);
}

function editLevel() {
	var url = "editor/index.html#level=" + window.btoa(dungeon.serialize());
	window.open(url, "_blank");
}

function onWindowResize() {
	var scale = CONFIG.quarterMode ? 0.5 : 1;
	pl.camera.aspect = window.innerWidth / window.innerHeight;
	pl.camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth * scale, window.innerHeight * scale);
	colorTarget = new THREE.WebGLRenderTarget(window.innerWidth * scale, window.innerHeight * scale, renderTargetParametersRGB);
	composer.reset(colorTarget);
	depthTarget = new THREE.WebGLRenderTarget(window.innerWidth * scale, window.innerHeight * scale, renderTargetParametersRGBA);
	depthPassPlugin.renderTarget = depthTarget;
	passes.ssao.uniforms.tDepth.value = depthTarget;
	passes.ssao.uniforms.size.value.set(window.innerWidth * scale, window.innerHeight * scale);
	passes.fxaa.uniforms.resolution.value.set(scale/window.innerWidth, scale/window.innerHeight);
	controls.handleResize();
}

function onPointerLockChange() {
	if (document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement) {
		controls.pointerLockEnabled = true;
		$("#instructions").hide();
	} else {
		controls.pointerLockEnabled = false;
		if (!pl.dead) $("#instructions").show();
	}
}

function pause() {
	controls.active = false;
}

function resume() {
	controls.active = true;
}

function reload() {
	updateConfig();
	window.location.reload();
}
