/**
 * BYLDR ENGINE V0.4.0
 * FYZIKA, KOLIZE, ROTACE
 */

const UNIT = 1.0, BRICK_H = 1.2, PLATE_H = 0.4, PLAYER_EYE_H = 1.8;
const PLAYER_RADIUS = 0.4;

const COLORS = [
    { name: 'Red', hex: 0xff3b30 }, { name: 'Blue', hex: 0x007aff }, 
    { name: 'Green', hex: 0x34c759 }, { name: 'Yellow', hex: 0xffcc00 },
    { name: 'Purple', hex: 0xaf52de }, { name: 'White', hex: 0xffffff },
    { name: 'Black', hex: 0x222222 }, { name: 'Orange', hex: 0xff9500 }
];

const BRICK_TYPES = [
    { id: 'b11', name: 'Kostka', w: 1, l: 1, type: 'brick' },
    { id: 'b21', name: 'Kostka', w: 2, l: 1, type: 'brick' },
    { id: 'b41', name: 'Kostka', w: 4, l: 1, type: 'brick' },
    { id: 'b22', name: 'Kostka', w: 2, l: 2, type: 'brick' },
    { id: 'b24', name: 'Kostka', w: 2, l: 4, type: 'brick' },
    { id: 'p11', name: 'Plate', w: 1, l: 1, type: 'plate' },
    { id: 'p12', name: 'Plate', w: 1, l: 2, type: 'plate' }
];

let scene, camera, renderer, raycaster, clock;
let ghost, gridHelper, floor, gridMaterial;
let bricks = [], undoStack = [], redoStack = [];
let previewScenes = [];

let state = { 
    mode: 'BUILD', 
    colorIdx: 1, 
    brickTypeIdx: 0,
    brickRot: 0, 
    move: {x:0, y:0}, 
    rot: {y:0, p:0}, 
    vel: new THREE.Vector3(), 
    canJump: false,
    pos: new THREE.Vector3(5, PLAYER_EYE_H, 10)
};

const studGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 12);
const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 });

function createBrick(color, isGhost, brickType, rotation = 0) {
    const h = brickType.type === 'brick' ? BRICK_H : PLATE_H;
    const group = new THREE.Group();
    const mat = isGhost ? ghostMat.clone() : new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
    if(isGhost) mat.color.set(color);

    const actualW = rotation === 0 ? brickType.w : brickType.l;
    const actualL = rotation === 0 ? brickType.l : brickType.w;

    const bodyGeo = new THREE.BoxGeometry(actualW * UNIT, h, actualL * UNIT);
    const body = new THREE.Mesh(bodyGeo, mat);
    if(!isGhost) { 
        body.castShadow = true; 
        body.receiveShadow = true; 
        body.scale.set(0.99, 0.99, 0.99); 
    }
    group.add(body);

    const studOffsetX = (actualW - 1) * UNIT / 2;
    const studOffsetZ = (actualL - 1) * UNIT / 2;
    for(let x = 0; x < actualW; x++) {
        for(let z = 0; z < actualL; z++) {
            const s = new THREE.Mesh(studGeo, mat);
            s.position.set(-studOffsetX + x * UNIT, (h + 0.15) / 2, -studOffsetZ + z * UNIT);
            group.add(s);
        }
    }
    group.userData = { type: brickType.type, w: actualW, l: actualL, h: h };
    return group;
}

function initPreview(bt) {
    const container = document.getElementById(`preview-${bt.id}`);
    if (!container) return;
    
    const width = 100, height = 80;
    const pScene = new THREE.Scene();
    const pCam = new THREE.PerspectiveCamera(45, width/height, 0.1, 100);
    pCam.position.set(4, 3, 4);
    pCam.lookAt(0, 0, 0);

    const pRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    pRenderer.setSize(width, height);
    pRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(pRenderer.domElement);

    pScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const pLight = new THREE.DirectionalLight(0xffffff, 0.5);
    pLight.position.set(5, 5, 5);
    pScene.add(pLight);

    const model = createBrick(COLORS[state.colorIdx].hex, false, bt, 0);
    pScene.add(model);
    
    previewScenes.push({ scene: pScene, cam: pCam, renderer: pRenderer, model: model });
}

function setupUI() {
    const brickSel = document.getElementById('brick-selector');
    BRICK_TYPES.forEach((bt, i) => {
        const item = document.createElement('div');
        item.className = `brick-item ${i === state.brickTypeIdx ? 'active' : ''}`;
        item.innerHTML = `
            <div class="preview-canvas-container" id="preview-${bt.id}"></div>
            <div class="brick-name">${bt.name}</div>
            <div class="brick-dim">${bt.w}x${bt.l}</div>
        `;
        item.onclick = () => {
            state.brickTypeIdx = i;
            document.querySelectorAll('.brick-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            updateGhost();
        };
        brickSel.appendChild(item);
    });

    setTimeout(() => { BRICK_TYPES.forEach(bt => initPreview(bt)); }, 100);

    const colorSel = document.getElementById('color-selector');
    COLORS.forEach((c, i) => {
        const circle = document.createElement('div');
        circle.className = `color-circle ${i === state.colorIdx ? 'active' : ''}`;
        circle.style.backgroundColor = '#' + c.hex.toString(16).padStart(6, '0');
        circle.onclick = () => {
            state.colorIdx = i;
            document.querySelectorAll('.color-circle').forEach(el => el.classList.remove('active'));
            circle.classList.add('active');
            updateGhost();
        };
        colorSel.appendChild(circle);
    });

    document.getElementById('btn-open-inventory').onclick = () => document.getElementById('inventory-panel').classList.add('show');
    document.getElementById('close-inventory').onclick = () => document.getElementById('inventory-panel').classList.remove('show');

    document.getElementById('btn-rotate').onclick = () => {
        state.brickRot = state.brickRot === 0 ? 1 : 0;
        updateGhost();
    };

    nipplejs.create({ 
        zone: document.getElementById('joy-container'), 
        mode: 'static', position: {left: '50px', bottom: '50px'}, size: 80, color: 'white'
    }).on('move', (e, d) => { state.move.x = d.vector.x; state.move.y = d.vector.y; })
      .on('end', () => { state.move.x = 0; state.move.y = 0; });

    let isDragging = false, startX, startY;
    window.addEventListener('mousedown', e => {
        if(!e.target.closest('.panel-row, #joy-container, .jump-btn, #inventory-panel')) { 
            isDragging = true; startX = e.clientX; startY = e.clientY; 
        }
    });
    window.addEventListener('mousemove', e => {
        if(!isDragging) return;
        state.rot.y -= (e.clientX - startX) * 0.005;
        state.rot.p = Math.max(-1.4, Math.min(1.4, state.rot.p - (e.clientY - startY) * 0.005));
        startX = e.clientX; startY = e.clientY;
    });
    window.addEventListener('mouseup', e => {
        if(isDragging && Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) performAction();
        isDragging = false;
    });

    window.addEventListener('touchstart', e => {
        const t = e.touches[0];
        if(!e.target.closest('.panel-row, #joy-container, .jump-btn, #inventory-panel')) { 
            isDragging = true; startX = t.clientX; startY = t.clientY; 
        }
    });
    window.addEventListener('touchmove', e => {
        if(!isDragging) return;
        const t = e.touches[0];
        state.rot.y -= (t.clientX - startX) * 0.005;
        state.rot.p = Math.max(-1.4, Math.min(1.4, state.rot.p - (t.clientY - startY) * 0.005));
        startX = t.clientX; startY = t.clientY;
    });
    window.addEventListener('touchend', () => isDragging = false);

    document.getElementById('mode-build').onclick = () => { state.mode = 'BUILD'; updateUI(); };
    document.getElementById('mode-erase').onclick = () => { state.mode = 'ERASE'; updateUI(); };
    document.getElementById('btn-undo').onclick = undo;
    document.getElementById('btn-redo').onclick = redo;
    document.getElementById('jump-btn').onclick = () => { if(state.canJump) { state.vel.y = 12; state.canJump = false; } };
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 25, 120);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(30, 60, 30);
    sun.castShadow = true;
    sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
    scene.add(sun);

    floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    gridMaterial = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x007aff) }, uPlayerPos: { value: new THREE.Vector3() }, uRadius: { value: 30.0 } },
        transparent: true,
        vertexShader: `varying vec3 vPos; void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform vec3 uPlayerPos; uniform float uRadius; varying vec3 vPos; void main() { float dist = distance(vPos.xz, uPlayerPos.xz); float fade = clamp(1.0 - (dist / uRadius), 0.0, 1.0); vec2 grid = abs(fract(vPos.xz + 0.5) - 0.5) / fwidth(vPos.xz); float line = min(grid.x, grid.y); float mask = 1.0 - smoothstep(0.0, 1.5, line); if (fade < 0.01 || mask < 0.01) discard; gl_FragColor = vec4(uColor, mask * fade * 0.4); }`
    });
    const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), gridMaterial);
    gridPlane.rotation.x = -Math.PI / 2; gridPlane.position.y = 0.005;
    scene.add(gridPlane);

    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();

    setupUI();
    updateGhost();
    updateUI();
    
    window.addEventListener('resize', onWindowResize);
    animate();
}

function checkCollisions(newPos) {
    if (newPos.y < PLAYER_EYE_H) {
        newPos.y = PLAYER_EYE_H;
        state.vel.y = 0;
        state.canJump = true;
    }

    const pMin = new THREE.Vector3(newPos.x - PLAYER_RADIUS, newPos.y - PLAYER_EYE_H, newPos.z - PLAYER_RADIUS);
    const pMax = new THREE.Vector3(newPos.x + PLAYER_RADIUS, newPos.y + 0.2, newPos.z + PLAYER_RADIUS);

    for (const brick of bricks) {
        const bw = brick.userData.w * UNIT;
        const bl = brick.userData.l * UNIT;
        const bh = brick.userData.h;
        
        const bMin = new THREE.Vector3(brick.position.x - bw/2, brick.position.y - bh/2, brick.position.z - bl/2);
        const bMax = new THREE.Vector3(brick.position.x + bw/2, brick.position.y + bh/2, brick.position.z + bl/2);

        if (pMax.x > bMin.x && pMin.x < bMax.x &&
            pMax.z > bMin.z && pMin.z < bMax.z &&
            pMax.y > bMin.y && pMin.y < bMax.y) {
            
            const overlapY = Math.min(pMax.y - bMin.y, bMax.y - pMin.y);
            const overlapX = Math.min(pMax.x - bMin.x, bMax.x - pMin.x);
            const overlapZ = Math.min(pMax.z - bMin.z, bMax.z - pMin.z);

            if (overlapY < overlapX && overlapY < overlapZ) {
                if (pMax.y > bMin.y && pMin.y < bMin.y) {
                    newPos.y = bMin.y - 0.2;
                    state.vel.y = 0;
                } else {
                    newPos.y = bMax.y + PLAYER_EYE_H;
                    state.vel.y = 0;
                    state.canJump = true;
                }
            } else if (overlapX < overlapZ) {
                if (newPos.x < brick.position.x) newPos.x = bMin.x - PLAYER_RADIUS;
                else newPos.x = bMax.x + PLAYER_RADIUS;
            } else {
                if (newPos.z < brick.position.z) newPos.z = bMin.z - PLAYER_RADIUS;
                else newPos.z = bMax.z + PLAYER_RADIUS;
            }
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    
    camera.rotation.set(state.rot.p, state.rot.y, 0);

    const moveDir = new THREE.Vector3(state.move.x, 0, -state.move.y).applyAxisAngle(new THREE.Vector3(0,1,0), state.rot.y).multiplyScalar(8 * dt);
    state.pos.add(moveDir);

    state.vel.y -= 30 * dt;
    state.pos.y += state.vel.y * dt;

    checkCollisions(state.pos);
    camera.position.copy(state.pos);

    if(gridMaterial) gridMaterial.uniforms.uPlayerPos.value.copy(camera.position);

    previewScenes.forEach(ps => { if (ps.model) ps.model.rotation.y += 0.01; ps.renderer.render(ps.scene, ps.cam); });

    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const intersects = raycaster.intersectObjects([floor, ...bricks], true);
    
    if (intersects.length > 0 && state.mode === 'BUILD' && ghost) {
        const hit = intersects[0];
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        const bt = BRICK_TYPES[state.brickTypeIdx];
        const actualW = state.brickRot === 0 ? bt.w : bt.l;
        const actualL = state.brickRot === 0 ? bt.l : bt.w;
        const h = bt.type === 'brick' ? BRICK_H : PLATE_H;

        const pos = hit.point.clone().add(normal.multiplyScalar(0.01));
        const offX = (actualW % 2 !== 0) ? 0.5 : 0;
        const offZ = (actualL % 2 !== 0) ? 0.5 : 0;
        const gx = Math.round(pos.x - offX) + offX;
        const gz = Math.round(pos.z - offZ) + offZ;
        
        let gy;
        if (hit.object === floor) gy = h / 2; 
        else {
            let target = hit.object;
            while(target.parent && target.parent !== scene) target = target.parent;
            const baseH = target.userData.h;
            if (normal.y > 0.5) gy = target.position.y + (baseH / 2) + (h / 2);
            else if (normal.y < -0.5) gy = Math.max(h/2, target.position.y - (baseH / 2) - (h / 2));
            else gy = target.position.y;
        }

        ghost.visible = true; ghost.position.set(gx, gy, gz);
        
        if(!gridHelper || gridHelper.userData.id !== bt.id + '_' + state.brickRot) {
            if(gridHelper) scene.remove(gridHelper);
            gridHelper = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(actualW, h, actualL)),
                new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
            );
            gridHelper.userData.id = bt.id + '_' + state.brickRot;
            scene.add(gridHelper);
        }
        gridHelper.visible = true; gridHelper.position.set(gx, gy, gz);
        gridHelper.material.color.set(0xffffff);
    } else if (state.mode === 'ERASE') {
        const brickHits = raycaster.intersectObjects(bricks, true);
        if (brickHits.length > 0) {
            let target = brickHits[0].object;
            while(target.parent && target.parent !== scene) target = target.parent;
            if (gridHelper) {
                gridHelper.visible = true; gridHelper.position.copy(target.position);
                gridHelper.material.color.set(0xff3b30);
                gridHelper.geometry.dispose();
                gridHelper.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(target.userData.w, target.userData.h, target.userData.l));
                gridHelper.userData.id = 'ERASE';
            }
            if (ghost) ghost.visible = false;
        } else if(gridHelper) gridHelper.visible = false;
    } else { if(ghost) ghost.visible = false; if(gridHelper) gridHelper.visible = false; }
    
    renderer.render(scene, camera);
}

function performAction() {
    if (state.mode === 'BUILD' && ghost && ghost.visible) {
        const b = createBrick(COLORS[state.colorIdx].hex, false, BRICK_TYPES[state.brickTypeIdx], state.brickRot);
        b.position.copy(ghost.position);
        scene.add(b); bricks.push(b);
        undoStack.push({ type: 'ADD', obj: b }); redoStack = [];
        updateUI();
    } else if (state.mode === 'ERASE') {
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        const hits = raycaster.intersectObjects(bricks, true);
        if (hits.length > 0) {
            let target = hits[0].object;
            while(target.parent && target.parent !== scene) target = target.parent;
            scene.remove(target); bricks = bricks.filter(b => b !== target);
            undoStack.push({ type: 'REMOVE', obj: target }); redoStack = [];
            updateUI();
        }
    }
}

function undo() {
    const action = undoStack.pop(); if(!action) return;
    if(action.type === 'ADD') { scene.remove(action.obj); bricks = bricks.filter(b => b !== action.obj); }
    else { scene.add(action.obj); bricks.push(action.obj); }
    redoStack.push(action); updateUI();
}

function redo() {
    const action = redoStack.pop(); if(!action) return;
    if(action.type === 'ADD') { scene.add(action.obj); bricks.push(action.obj); }
    else { scene.remove(action.obj); bricks = bricks.filter(b => b !== action.obj); }
    undoStack.push(action); updateUI();
}

function updateUI() {
    document.getElementById('mode-build').classList.toggle('active', state.mode === 'BUILD');
    document.getElementById('mode-erase').classList.toggle('active', state.mode === 'ERASE');
    document.getElementById('count').innerText = bricks.length;
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

function updateGhost() {
    if(ghost && scene) scene.remove(ghost);
    ghost = createBrick(COLORS[state.colorIdx].hex, true, BRICK_TYPES[state.brickTypeIdx], state.brickRot);
    if(scene) scene.add(ghost);
    if(gridHelper) { scene.remove(gridHelper); gridHelper = null; }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

document.getElementById('start-btn').onclick = () => {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    init();
};

