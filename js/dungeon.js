"use strict";
function Dungeon(scene, player, levelName) {
	var self = this;
	this.loaded = false;
	this.objects = [];
	this.monsters = [];
	this.anims = [];
	var dummy_material = new THREE.MeshBasicMaterial({ color: 0x000000 });
	var debug_material = new THREE.MeshBasicMaterial({ color: 0xff00ff });
	var dead_material = new THREE.MeshLambertMaterial({ color: 0x222222, ambient: 0x222222 });

	function objectHandler(level, pos, ang, def) {
		return function(geometry) {
			if (!def) def = {};
			var obj, mass = def.mass || 0;

			// Preprocessing
			if (def.character) mass = 100000;
			var scale = 1.0;
			if (def.randScale) {
				scale += randf(-def.randScale, def.randScale);
				mass *= scale;
			}
			if (def.animation && def.animation.type === "morph") geometry.computeMorphNormals();
			if (!geometry.boundingBox) geometry.computeBoundingBox();

			// Handle materials
			for (var m = 0; m < geometry.materials.length; ++m) {
				fixAnisotropy(geometry.materials[m]);
				// Handle animation stuff
				if (def.animation) {
					if (def.animation.type === "morph") {
						geometry.materials[m].morphTargets = true;
						geometry.materials[m].morphNormals = true;
					} else if (def.animation.type === "bones") {
						geometry.materials[m].skinning = true;
					}
				}
			}
			var mat = geometry.materials.length > 1 ? new THREE.MeshFaceMaterial() : geometry.materials[0];

			// Mesh creation
			if (def.collision) {
				var material = Physijs.createMaterial(mat, 0.7, 0.2); // friction, restition
				if (def.collision == "plane")
					obj = new Physijs.PlaneMesh(geometry, material, mass);
				else if (def.collision == "box")
					obj = new Physijs.BoxMesh(geometry, material, mass);
				else if (def.collision == "sphere")
					obj = new Physijs.SphereMesh(geometry, material, mass);
				else if (def.collision == "cylinder")
					obj = new Physijs.CylinderMesh(geometry, material, mass);
				else if (def.collision == "cone")
					obj = new Physijs.ConeMesh(geometry, material, mass);
				else if (def.collision == "convex")
					obj = new Physijs.ConvexMesh(geometry, material, mass);
				else if (def.collision == "concave")
					obj = new Physijs.ConcaveMesh(geometry, material, mass);
				else throw "Unsupported collision mesh type " + def.collision;
				self.objects.push(obj);
			} else {
				obj = new THREE.Mesh(geometry, mat);
			}

			// Positioning
			if (def.door) {
				// Fix door positions
				pos.x = Math.floor(pos.x) + 0.5;
				pos.z = Math.floor(pos.z) + 0.5;
			}
			pos.x *= level.gridSize;
			pos.z *= level.gridSize;
			if (!pos.y && pos.y !== 0) { // Auto-height
				pos.y = 0.5 * (geometry.boundingBox.max.y - geometry.boundingBox.min.y) + 0.001;
			}
			obj.position.copy(pos);
			if (ang) obj.rotation.y = ang / 180 * Math.PI;

			// Other attributes
			obj.scale.set(scale, scale, scale);
			if (!def.noShadows && !def.animation) {
				obj.castShadow = true;
				obj.receiveShadow = true;
			}
			if (mass === 0) {
				obj.matrixAutoUpdate = false;
				obj.updateMatrix();
			}

			// Handle animated meshes
			if (def.animation) {
				obj.visible = false;
				if (def.animation.type === "morph") {
					obj.mesh = new THREE.MorphAnimMesh(geometry, mat);
					obj.mesh.duration = def.animation.duration;
					obj.mesh.time = obj.mesh.duration * Math.random();
				} else if (def.animation.type === "bones") {
					obj.mesh = new THREE.SkinnedMesh(geometry, mat); // TODO: useVertexTexture?
					THREE.AnimationHandler.add(geometry.animation);
					obj.animation = new THREE.Animation(obj.mesh, "walk");
					//obj.animation.play();
				}
				if (!def.noShadows) {
					obj.mesh.castShadow = true;
					obj.mesh.receiveShadow = true;
				}
				obj.add(obj.mesh);
				self.anims.push(obj);
			}

			if (def.character) {
				if (def.character.hp) obj.hp = def.character.hp;
				self.monsters.push(obj);
			}

			// Character collision callbacks
			if (def.sound) {
				obj.addEventListener('collision', function(other, vel, rot) {
					if (vel.lengthSq() < 1) return;
					if (other.damage) soundManager.play(def.sound);
					if (this.dead) return;
					if (this.hp && other.damage) {
						this.hp -= other.damage;
						// Check for death
						if (this.hp <= 0) {
							soundManager.play("robot-death");
							this.dead = true;
							if (this.animation) this.animation.stop();
							this.setAngularFactor({ x: 1, y: 1, z: 1 });
							this.mass = 2000;
							this.mesh.material = dead_material;
						} else {
							// Hit effect
							// TODO: Can't do this because the material is shared
							//var mats = this.mesh.geometry.materials, m;
							//for (m = 0; m < mats.length; ++m) {
							//	mats[m].color.r += 0.05;
							//	mats[m].ambient.r += 0.05;
							//}
						}
					}
				});
			}

			// Finalize
			scene.add(obj);
			if (def.character && def.collision) obj.setAngularFactor({ x: 0, y: 0, z: 0 });
			if (def.character) obj.speed = def.character.speed;
			if (def.door) {
				obj.setAngularFactor({ x: 0, y: 1, z: 0 });
				// Hinge
				var hingepos = obj.position.clone();
				var hingedist = 0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x) - 0.1
				hingepos.x -= Math.cos(obj.rotation.y) * hingedist;
				hingepos.z += Math.sin(obj.rotation.y) * hingedist;
				var constraint = new Physijs.HingeConstraint(
					obj,
					hingepos,
					new THREE.Vector3(0, 1, 0) // Hinge axisAxis along which the hinge lies - in this case it is the X axis
				);
				scene.addConstraint(constraint);
				constraint.setLimits(
					-Math.PI / 2 * 0.95 + obj.rotation.y, // minimum angle of motion, in radians
					Math.PI / 2 * 0.95 + obj.rotation.y, // maximum angle of motion, in radians
					0.3, // bias_factor, applied as a factor to constraint error
					0.01 // relaxation_factor, controls bounce at limit (0.0 == no bounce)
				);
			}
		};
	}

	this.generateMesh = function(level) {
		var sqrt2 = Math.sqrt(2);
		var block_mat = cache.getMaterial(level.materials.wall);
		var block_params = {};
		if (assets.materials[level.materials.wall] && assets.materials[level.materials.wall].roughness)
			block_params.roughness = assets.materials[level.materials.wall].roughness;

		// Level geometry
		var geometry = new THREE.Geometry(), mesh;
		var cell, px, nx, pz, nz, py, ny, tess, cube, hash, rot;
		for (var j = 0; j < level.depth; ++j) {
			for (var i = 0; i < level.width; ++i) {
				px = nx = pz = nz = py = ny = 0;
				cell = level.map.get(i, j, OPEN);
				if (cell === OPEN) continue;
				if (cell === WALL || cell === DIAG) {
					px = level.map.get(i + 1, j) == OPEN ? 1 : 0;
					nx = level.map.get(i - 1, j) == OPEN ? 2 : 0;
					pz = level.map.get(i, j + 1) == OPEN ? 4 : 0;
					nz = level.map.get(i, j - 1) == OPEN ? 8 : 0;
					// If wall completely surrounded by walls, skip
					hash = px + nx + pz + nz;
					if (hash === 0) continue;
					tess = block_params.roughness ? 10 : 0;
					rot = 0;
					if (cell === DIAG && (hash == 5 || hash == 6 || hash == 9 || hash == 10)) {
						cube = new PlaneGeometry(level.gridSize * sqrt2, level.roomHeight, tess, tess,
							"px", level.gridSize * sqrt2 / 2, level.roomHeight / 2, block_params.roughness);
						if (hash == 5) rot = -45 / 180 * Math.PI;
						else if (hash == 6) rot = -135 / 180 * Math.PI;
						else if (hash == 9) rot = 45 / 180 * Math.PI;
						else if (hash == 10) rot = 135 / 180 * Math.PI;
						cube.materials = [ block_mat ];
					} else {
						cube = new BlockGeometry(level.gridSize, level.roomHeight, level.gridSize,
							tess, tess, tess, block_mat,
							{ px: px, nx: nx, py: 0, ny: 0, pz: pz, nz: nz },
							level.gridSize/2, level.roomHeight/2, block_params.roughness);
					}
					mesh = new THREE.Mesh(cube);
					mesh.position.x = (i + 0.5) * level.gridSize;
					mesh.position.y = 0.5 * level.roomHeight;
					mesh.position.z = (j + 0.5) * level.gridSize;
					mesh.rotation.y = rot;
					THREE.GeometryUtils.merge(geometry, mesh);

					// Collision body
					if (cell === DIAG) {
						cube = new THREE.CubeGeometry(0.01, level.roomHeight, level.gridSize * sqrt2);
					} else {
						// Bounding box needs tweaking if there is only one side in the block
						cube.computeBoundingBox();
						if (Math.abs(cube.boundingBox.max.x - cube.boundingBox.min.x) <= 0.5) {
							cube.boundingBox.min.x = -0.5 * level.gridSize;
							cube.boundingBox.max.x = 0.5 * level.gridSize;
						}
						if (Math.abs(cube.boundingBox.max.z - cube.boundingBox.min.z) <= 0.5) {
							cube.boundingBox.min.z = -0.5 * level.gridSize;
							cube.boundingBox.max.z = 0.5 * level.gridSize;
						}
					}
					var wallbody = new Physijs.BoxMesh(cube, dummy_material, 0);
					wallbody.position.copy(mesh.position);
					wallbody.visible = false;
					scene.add(wallbody);
					if (cell === DIAG) {
						wallbody.rotation.y = rot;
						wallbody.__dirtyRotation = true;
					}
				}
			}
		}

		// Ceiling
		var ceiling_plane = new Physijs.PlaneMesh(
			new PlaneGeometry(level.gridSize * level.width, level.gridSize * level.depth,
				1, 1, "ny", level.width, level.depth),
			Physijs.createMaterial(cache.getMaterial(level.materials.ceiling), 0.9, 0.0), // friction, restitution
			0 // mass
		);
		ceiling_plane.position.set(level.gridSize * level.width * 0.5, level.roomHeight, level.gridSize * level.depth * 0.5);
		ceiling_plane.matrixAutoUpdate = false;
		ceiling_plane.updateMatrix();
		scene.add(ceiling_plane);

		// Floor
		var floor_plane = new Physijs.PlaneMesh(
			new PlaneGeometry(level.gridSize * level.width, level.gridSize * level.depth,
				1, 1, "py", level.width, level.depth),
			Physijs.createMaterial(cache.getMaterial(level.materials.floor), 0.9, 0.0), // friction, restitution
			0 // mass
		);
		floor_plane.position.set(level.gridSize * level.width * 0.5, 0.0, level.gridSize * level.depth * 0.5);
		floor_plane.receiveShadow = true;
		floor_plane.matrixAutoUpdate = false;
		floor_plane.updateMatrix();
		scene.add(floor_plane);

		// Level mesh
		geometry.computeTangents();
		mesh = new THREE.Mesh(geometry, new THREE.MeshFaceMaterial());
		mesh.receiveShadow = true;
		mesh.matrixAutoUpdate = false;
		mesh.updateMatrix();
		scene.add(mesh);

		// Exit
		//cache.loadModel("assets/models/teleporter/teleporter.js",
		//	objectHandler(level, new THREE.Vector3().set(level.exit[0], null, level.exit[1]), 0, assets.objects.teleporter));
		//if (CONFIG.particles)
		//	this.exitParticles = createTeleporterParticles(
		//		new THREE.Vector3(level.exit[0] * level.gridSize, 0.5, level.exit[1] * level.gridSize));
	};

	this.addLights = function(level) {
		// Torch model load callback
		function torchHandler(pos, rot) {
			return function(geometry) {
				for (var m = 0; m < geometry.materials.length; ++m)
					fixAnisotropy(geometry.materials[m]);
				var mat = geometry.materials.length > 1 ? new THREE.MeshFaceMaterial() : geometry.materials[0];
				var obj = new Physijs.CylinderMesh(geometry, mat, 0);
				obj.position.copy(pos);
				obj.rotation.y = rot;
				//obj.castShadow = true;
				//obj.receiveShadow = true;
				obj.matrixAutoUpdate = false;
				obj.updateMatrix();
				scene.add(obj);
			};
		}

		// Ambient
		scene.add(new THREE.AmbientLight(0x444444));

		// Point lights
		var vec = new THREE.Vector2();
		var target = new THREE.Vector3();
		for (var i = 0; i < level.lights.length; ++i) {
			if (level.lights[i].position.y === undefined)
				level.lights[i].position.y = 2;
			// Actual light
			var light = new THREE.PointLight(0xffffaa, 1, 2 * level.gridSize);
			light.position.copy(level.lights[i].position);
			var torch = "assets/models/wall-lamp/wall-lamp.js";

			// Snap to wall
			// Create wall candidates for checking which wall is closest to the light
			vec.set(level.lights[i].position.x|0, level.lights[i].position.z|0);
			var candidates = [
				{ x: vec.x + 0.5, y: vec.y, a: Math.PI },
				{ x: vec.x + 1.0, y: vec.y + 0.5, a: Math.PI/2 },
				{ x: vec.x + 0.5, y: vec.y + 1.0, a: 0 },
				{ x: vec.x, y: vec.y + 0.5, a: -Math.PI/2 }
			];
			vec.set(level.lights[i].position.x, level.lights[i].position.z);
			// Find the closest
			var snapped = { d: 1000 };
			for (var j = 0; j < candidates.length; ++j) {
				candidates[j].d = vec.distanceToSquared(candidates[j]);
				if (candidates[j].d < snapped.d) snapped = candidates[j];
			}
			// Position the light to the wall
			light.position.x = snapped.x;
			light.position.z = snapped.y;
			// Get wall normal vector
			vec.set((level.lights[i].position.x|0) + 0.5, (level.lights[i].position.z|0) + 0.5);
			vec.subSelf(snapped).multiplyScalar(2);
			// Check if there actually is a wall
			if (level.map.get((light.position.x - vec.x * 0.5)|0, (light.position.z - vec.y * 0.5)|0) == WALL) {
				// Move out of the wall
				light.position.x += vec.x * 0.08;
				light.position.z += vec.y * 0.08;
				target.set(light.position.x + vec.x , light.position.y - 1, light.position.z + vec.y);
			} else {
				// Switch to ceiling hanging light
				torch = "assets/models/ceiling-lamp/ceiling-lamp.js";
				light.position.x = (level.lights[i].position.x|0) + 0.5;
				light.position.y = level.roomHeight;
				light.position.z = (level.lights[i].position.z|0) + 0.5;
				target.copy(light.position);
				target.y -= 1;
			}

			light.position.x *= level.gridSize;
			light.position.z *= level.gridSize;
			target.x *= level.gridSize;
			target.z *= level.gridSize;
			light.matrixAutoUpdate = false;
			light.updateMatrix();
			scene.add(light);
			lightManager.addLight(light);

			// Shadow casting light
			var light2 = new THREE.SpotLight(0xffffaa, light.intensity, light.distance);
			light2.position.copy(light.position);
			light2.position.y = level.roomHeight;
			light2.target.position.copy(target);
			light2.angle = Math.PI / 2;
			light2.castShadow = true;
			light2.onlyShadow = true;
			light2.shadowCameraNear = 0.1 * UNIT;
			light2.shadowCameraFar = light.distance * 1.5 * UNIT;
			light2.shadowCameraFov = 100;
			light2.shadowBias = -0.0002;
			light2.shadowDarkness = 0.3;
			light2.shadowMapWidth = 512;
			light2.shadowMapHeight = 512;
			light2.shadowCameraVisible = false;
			light2.matrixAutoUpdate = false;
			light2.updateMatrix();
			scene.add(light2);
			lightManager.addShadow(light2);

			// Mesh
			cache.loadModel(torch, torchHandler(new THREE.Vector3().copy(light.position), snapped.a));

			// Flame
			//if (CONFIG.particles)
			//	light.emitter = createTexturedFire(light);
		}

		// Player's torch
		player.light = new THREE.PointLight(0xccccaa, 1, level.gridSize * 3);
		scene.add(player.light);
		player.shadow = new THREE.SpotLight(player.light.color, player.light.intensity, player.light.distance);
		player.shadow.angle = Math.PI / 4;
		player.shadow.onlyShadow = true;
		player.shadow.castShadow = true;
		player.shadow.shadowCameraNear = 0.1 * UNIT;
		player.shadow.shadowCameraFar = 10 * UNIT;
		player.shadow.shadowCameraFov = 90;
		player.shadow.shadowBias = -0.0002;
		player.shadow.shadowDarkness = 0.3;
		player.shadow.shadowMapWidth = 1024;
		player.shadow.shadowMapHeight = 1024;
		player.shadow.shadowCameraVisible = false;
		scene.add(player.shadow);
	};

	this.addObjects = function(level) {
		if (!level.objects) return;
		for (var i = 0; i < level.objects.length; ++i) {
			var name = level.objects[i].name;
			cache.loadModel("assets/models/" + name + "/" + name + ".js",
				objectHandler(level, new THREE.Vector3().copy(level.objects[i].position),
					level.objects[i].angle, assets.objects[name]));
		}
	};

	this.addItems = function(level) {
		if (!level.items) return;
		var pos = new THREE.Vector3();
		for (var i = 0; i < level.items.length; ++i) {
			var name = level.items[i].name;
			pos.copy(level.items[i].position);
			pos.y = 1.2;
			cache.loadModel("assets/models/" + name + "/" + name + ".js",
				objectHandler(level, pos, 0, assets.items[name]));
		}
	};

	this.addMonsters = function(level) {
		if (!level.monsters) return;
		for (var i = 0; i < level.monsters.length; ++i) {
			var name = level.monsters[i].name;
			cache.loadModel("assets/monsters/" + name + "/" + name + ".js",
				objectHandler(level, new THREE.Vector3().copy(level.monsters[i].position), 0, assets.monsters[name]));
		}
	};

	this.getTriggerAt = function(pos) {
		if (!this.level || !this.level.triggers) return false;
		var triggers = this.level.triggers;
		for (var i = 0; i < triggers.length; ++i) {
			if (Math.abs(pos.x - triggers[i].position.x * this.level.gridSize) <= 1 &&
				Math.abs(pos.z - triggers[i].position.z * this.level.gridSize) <= 1)
					return triggers[i];
		}
	};

	this.isAtExit = function(pos) {
		return this.level &&
			Math.abs(pos.x - this.level.exit[0] * this.level.gridSize) < 0.5 &&
			Math.abs(pos.z - this.level.exit[1] * this.level.gridSize) < 0.5;
	};

	function processLevel(level) {
		if (typeof(level) == "string")
			level = JSON.parse(level);
		if (level.map instanceof Array)
			level.map = new Map(level.width, level.depth, level.map);

		player.geometry.computeBoundingBox();
		player.position.x = level.start[0] * level.gridSize;
		player.position.y = 0.5 * (player.geometry.boundingBox.max.y - player.geometry.boundingBox.min.y) + 0.001;
		player.position.z = level.start[1] * level.gridSize;
		if (level.startAngle)
			controls.setYAngle(level.startAngle);
		scene.add(pl);
		pl.setAngularFactor({ x: 0, y: 0, z: 0 });

		// Player gun
		cache.loadModel("assets/items/gun/gun.js", function(geometry) {
			player.rhand = new THREE.Mesh(geometry, new THREE.MeshFaceMaterial());
			player.rhand.position.copy(player.position);
			scene.add(player.rhand);
		});

		// Bullets
		cache.loadModel("assets/items/fork/fork.js", function(geometry) {
			self.forks = [];
			self.forkIndex = 0;
			for (var i = 0; i < 20; ++i) {
				var fork = new Physijs.BoxMesh(geometry, geometry.materials[0], 10);
				fork.damage = 1;
				self.forks.push(fork);
				fork.visible = false;
				scene.add(fork);
			}
		});

		self.generateMesh(level);
		self.addLights(level);
		self.addObjects(level);
		self.addItems(level);
		self.addMonsters(level);
		lightManager.update(pl);
		self.level = level;
		self.loaded = true;
	}

	levelName = levelName || hashParams.level || "test";
	if (levelName == "rand") {
		var gen = new MapGen();
		processLevel(gen.generate());
	} else if (levelName.length > 24) {
		var json = window.atob(levelName);
		processLevel(JSON.parse(json));
	} else {
		$.get("assets/levels/" + levelName + ".json", processLevel);
	}

	this.serialize = function() {
		return JSON.stringify(this.level);
	}

}
