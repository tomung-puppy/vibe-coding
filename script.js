import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0); // Make renderer background transparent
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        const orbitControls = new OrbitControls(camera, renderer.domElement);
        camera.position.z = 20;

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(8, 15, 10);
        scene.add(dirLight);

        const simulationGroup = new THREE.Group();
        scene.add(simulationGroup);

        const boxSize = 10;
        const boxOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(boxSize, boxSize, boxSize)), new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 2 }));
        simulationGroup.add(boxOutline);

        const rotationHandle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0x007bff }));
        rotationHandle.position.set(boxSize / 2, boxSize / 2, boxSize / 2);
        simulationGroup.add(rotationHandle);

        let spheres = [];
        let fadingSpheres = [];
        let particles = [];
        let selectedSpheres = [];
        let selectionBoxes = [];
        let currentMode = 'create';
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let isDraggingHandle = false, isCreatingBall = false, isSelecting = false;
        let dragStartPos = new THREE.Vector3();
        let arrowHelper;
        let previousMousePosition = { x: 0, y: 0 };
        const selectionBoxElement = document.getElementById('selection-box');
        const startPoint = new THREE.Vector2();

        const createControls = document.getElementById('create-controls');
        const deleteControls = document.getElementById('delete-controls');
        document.getElementsByName('mode').forEach(radio => {
            radio.addEventListener('change', (event) => {
                currentMode = event.target.value;
                orbitControls.enableRotate = (currentMode === 'create');
                orbitControls.enablePan = (currentMode === 'create');
                createControls.style.display = currentMode === 'create' ? 'block' : 'none';
                deleteControls.style.display = currentMode === 'delete' ? 'block' : 'none';
                clearSelection();
            });
        });

        document.getElementById('radius').addEventListener('input', (e) => {
            document.getElementById('radius-value').textContent = e.target.value;
        });

        const deleteButton = document.getElementById('delete-button');
        deleteButton.addEventListener('click', deleteSelectedSpheres);
        window.addEventListener('keydown', (event) => {
            if ((event.key === 'Delete' || event.key === 'Backspace') && currentMode === 'delete') {
                deleteSelectedSpheres();
            }
        });

        for (let i = 0; i < 20; i++) {
            const radius = Math.random() * 0.6 + 0.2;
            createSphere({
                radius: radius,
                color: new THREE.Color(Math.random(), Math.random(), Math.random()),
                position: new THREE.Vector3((Math.random() - 0.5) * (boxSize - 2), (Math.random() - 0.5) * (boxSize - 2), (Math.random() - 0.5) * (boxSize - 2)),
                velocity: new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1)
            });
        }

        function createSphere({radius, color, position, velocity}, isFading = false) {
            const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 1.0, metalness: 0.5, roughness: 0.5 });
            const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 32), material);
            sphere.position.copy(position);
            const mass = Math.pow(radius, 3);
            sphere.userData = { radius, velocity, isFading, mass };
            simulationGroup.add(sphere);
            if (isFading) fadingSpheres.push(sphere); else spheres.push(sphere);
        }

        function createExplosion(position, color) {
            const particleCount = 50;
            for (let i = 0; i < particleCount; i++) {
                const pGeo = new THREE.SphereGeometry(0.05, 8, 8);
                const pMat = new THREE.MeshBasicMaterial({ color, transparent: true });
                const particle = new THREE.Mesh(pGeo, pMat);
                particle.position.copy(position);
                particle.userData.velocity = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(Math.random() * 0.5);
                particle.userData.life = 1;
                particles.push(particle);
                simulationGroup.add(particle);
            }
        }

        function clearSelection() {
            selectedSpheres.forEach(sphere => {
                const box = selectionBoxes.find(b => b.sphereId === sphere.uuid);
                if(box) box.visible = false;
            });
            selectedSpheres = [];
        }

        function selectSphere(sphere, additive = false) {
            const index = selectedSpheres.indexOf(sphere);
            if (index > -1) {
                if (!additive) {
                    clearSelection();
                } else {
                    selectedSpheres.splice(index, 1);
                    const box = selectionBoxes.find(b => b.sphereId === sphere.uuid);
                    if(box) box.visible = false;
                }
            } else {
                if (!additive) clearSelection();
                selectedSpheres.push(sphere);
                let box = selectionBoxes.find(b => b.sphereId === sphere.uuid);
                if (!box) {
                    box = new THREE.BoxHelper(sphere, 0xdc3545); // Use delete button color
                    box.sphereId = sphere.uuid;
                    scene.add(box);
                    selectionBoxes.push(box);
                }
                box.visible = true;
            }
        }

        function deleteSelectedSpheres() {
            selectedSpheres.forEach(sphere => {
                createExplosion(sphere.position, sphere.material.color);
                simulationGroup.remove(sphere);
                spheres = spheres.filter(s => s !== sphere);
                const box = selectionBoxes.find(b => b.sphereId === sphere.uuid);
                if(box) box.visible = false;
            });
            selectedSpheres = [];
        }

        function get3DMousePosition(event) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
            raycaster.setFromCamera(mouse, camera);
            const intersectPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, intersectPoint);
            return intersectPoint;
        }

        function isInsideBox(localPoint) {
            const half = boxSize / 2;
            return Math.abs(localPoint.x) <= half && Math.abs(localPoint.y) <= half && Math.abs(localPoint.z) <= half;
        }

        renderer.domElement.addEventListener('mousedown', (event) => {
            if (event.target.type === 'radio' || event.target.type === 'range' || event.target.type === 'color' || event.target.tagName === 'BUTTON') return;

            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const handleIntersects = raycaster.intersectObject(rotationHandle);
            if (handleIntersects.length > 0) {
                isDraggingHandle = true;
                orbitControls.enabled = false;
                previousMousePosition = { x: event.clientX, y: event.clientY };
                return;
            }

            if (currentMode === 'delete') {
                const sphereIntersects = raycaster.intersectObjects(spheres);
                if (sphereIntersects.length > 0) {
                    selectSphere(sphereIntersects[0].object, event.ctrlKey || event.metaKey);
                } else {
                    isSelecting = true;
                    startPoint.set(event.clientX, event.clientY);
                    selectionBoxElement.style.left = `${event.clientX}px`;
                    selectionBoxElement.style.top = `${event.clientY}px`;
                    selectionBoxElement.style.width = '0px';
                    selectionBoxElement.style.height = '0px';
                    selectionBoxElement.style.display = 'block';
                }
                return;
            }

            if (currentMode === 'create') {
                isCreatingBall = true;
                orbitControls.enabled = false;
                dragStartPos = get3DMousePosition(event);
                if (arrowHelper) scene.remove(arrowHelper);
                arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), dragStartPos, 0, '#007bff');
                scene.add(arrowHelper);
            }
        });

        renderer.domElement.addEventListener('mousemove', (event) => {
            if (isDraggingHandle) {
                const deltaX = event.clientX - previousMousePosition.x;
                const deltaY = event.clientY - previousMousePosition.y;
                const rotationSpeed = 0.005;
                const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(deltaY * rotationSpeed, deltaX * rotationSpeed, 0, 'XYZ'));
                simulationGroup.quaternion.multiplyQuaternions(deltaRotationQuaternion, simulationGroup.quaternion);
                [...spheres, ...fadingSpheres, ...particles].forEach(obj => {
                    if(obj.userData.velocity) obj.userData.velocity.applyQuaternion(deltaRotationQuaternion);
                });
                previousMousePosition = { x: event.clientX, y: event.clientY };
            } else if (isCreatingBall) {
                const dragCurrentPos = get3DMousePosition(event);
                const direction = new THREE.Vector3().subVectors(dragCurrentPos, dragStartPos);
                arrowHelper.setDirection(direction.clone().normalize());
                arrowHelper.setLength(direction.length());
            } else if (isSelecting) {
                const ex = event.clientX;
                const ey = event.clientY;
                selectionBoxElement.style.left = `${Math.min(ex, startPoint.x)}px`;
                selectionBoxElement.style.top = `${Math.min(ey, startPoint.y)}px`;
                selectionBoxElement.style.width = `${Math.abs(ex - startPoint.x)}px`;
                selectionBoxElement.style.height = `${Math.abs(ey - startPoint.y)}px`;
            }
        });

        renderer.domElement.addEventListener('mouseup', (event) => {
            if (isCreatingBall) {
                const dragEndPos = get3DMousePosition(event);
                let velocity = new THREE.Vector3().subVectors(dragEndPos, dragStartPos).multiplyScalar(0.05);
                const worldPosition = dragStartPos.clone();
                const localPosition = simulationGroup.worldToLocal(worldPosition.clone());
                const inverseQuaternion = simulationGroup.quaternion.clone().invert();
                velocity.applyQuaternion(inverseQuaternion);
                createSphere({ radius: parseFloat(document.getElementById('radius').value), color: new THREE.Color(document.getElementById('color').value), position: localPosition, velocity }, !isInsideBox(localPosition));
                if (arrowHelper) scene.remove(arrowHelper);
            }
            if (isSelecting) {
                selectionBoxElement.style.display = 'none';
                const endPoint = new THREE.Vector2(event.clientX, event.clientY);
                const box = new THREE.Box2(new THREE.Vector2(Math.min(startPoint.x, endPoint.x), Math.min(startPoint.y, endPoint.y)), new THREE.Vector2(Math.max(startPoint.x, endPoint.x), Math.max(startPoint.y, endPoint.y)));
                if (!event.ctrlKey && !event.metaKey) clearSelection();
                spheres.forEach(sphere => {
                    const screenPos = new THREE.Vector3();
                    sphere.getWorldPosition(screenPos).project(camera);
                    const screenX = (screenPos.x + 1) / 2 * window.innerWidth;
                    const screenY = (-screenPos.y + 1) / 2 * window.innerHeight;
                    if (box.containsPoint(new THREE.Vector2(screenX, screenY))) {
                        if (selectedSpheres.indexOf(sphere) === -1) selectSphere(sphere, true);
                    }
                });
            }
            isDraggingHandle = false;
            isCreatingBall = false;
            isSelecting = false;
            if (currentMode === 'create' || orbitControls.target) orbitControls.enabled = true;
        });

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        function animate() {
            requestAnimationFrame(animate);

            particles.forEach((p, i) => { p.userData.life -= 0.02; if(p.userData.life <= 0) { simulationGroup.remove(p); particles.splice(i, 1); } else { p.position.add(p.userData.velocity); p.material.opacity = p.userData.life; } });
            fadingSpheres.forEach((s, i) => { s.material.opacity -= 0.015; if(s.material.opacity <= 0) { simulationGroup.remove(s); fadingSpheres.splice(i, 1); } });
            [...spheres, ...fadingSpheres].forEach(s => s.position.add(s.userData.velocity));

            for (let i = 0; i < spheres.length; i++) {
                const s1 = spheres[i];
                const { radius: r1, velocity: v1, mass: m1 } = s1.userData;
                if (Math.abs(s1.position.x) + r1 > boxSize / 2) { s1.position.x = Math.sign(s1.position.x) * (boxSize/2 - r1); v1.x *= -1; }
                if (Math.abs(s1.position.y) + r1 > boxSize / 2) { s1.position.y = Math.sign(s1.position.y) * (boxSize/2 - r1); v1.y *= -1; }
                if (Math.abs(s1.position.z) + r1 > boxSize / 2) { s1.position.z = Math.sign(s1.position.z) * (boxSize/2 - r1); v1.z *= -1; }

                for (let j = i + 1; j < spheres.length; j++) {
                    const s2 = spheres[j];
                    const { radius: r2, velocity: v2, mass: m2 } = s2.userData;
                    const distVec = new THREE.Vector3().subVectors(s1.position, s2.position);
                    const distance = distVec.length();
                    if (distance < r1 + r2) {
                        const overlap = r1 + r2 - distance;
                        const correction = distVec.clone().normalize().multiplyScalar(overlap / 2);
                        s1.position.add(correction);
                        s2.position.sub(correction);
                        const normal = distVec.normalize();
                        const v1_proj = v1.dot(normal);
                        const v2_proj = v2.dot(normal);
                        const v1_final_proj = ((m1 - m2) * v1_proj + 2 * m2 * v2_proj) / (m1 + m2);
                        const v2_final_proj = (2 * m1 * v1_proj - (m1 - m2) * v2_proj) / (m1 + m2);
                        v1.add(normal.clone().multiplyScalar(v1_final_proj - v1_proj));
                        v2.add(normal.clone().multiplyScalar(v2_final_proj - v2_proj));
                    }
                }
            }

            selectionBoxes.forEach(box => {
                if (box.visible) {
                    const sphere = spheres.find(s => s.uuid === box.sphereId) || selectedSpheres.find(s => s.uuid === box.sphereId);
                    if(sphere) box.update(); else box.visible = false;
                }
            });

            orbitControls.update();
            renderer.render(scene, camera);
        }

        animate();