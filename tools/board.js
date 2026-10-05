// Builds the visual asset board: every Tripo model as the white model the player finds and as its finished
// textured self, above three frames of the environment.
// Load the game with tools/record_server.py running and the walkthrough frames already rendered, wait for
// CLICK TO ENTER, then in the console:  (await import('/tools/board.js')).build()
// The result is saved as video/stills/asset_board.jpg and .png.

const W = 3840, H = 2160, CELL = 440;

// The colour of a model is driven by a uniform its materials were built with. Reach it through the material,
// so this works for the hand and the flower too, which share the world's value instead of having their own.
function setLife(obj, v) {
  obj.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
    const holder = { uniforms: {}, vertexShader: '', fragmentShader: '' };
    o.material.onBeforeCompile(holder);
    if (holder.uniforms.uLife) holder.uniforms.uLife.value = v;
  });
  obj.traverse(o => { if (o.isLineSegments) { o.material.opacity = 0.5; o.material.visible = v === 0; } });
}

export async function build() {
  const rz = window.rz, T = rz.THREE;
  if (rz.G.state !== 'ready') throw new Error('load the page fresh and wait for CLICK TO ENTER first');
  rz.manual();

  const stage = new T.Scene();
  stage.background = new T.Color(0x0e1014);
  stage.environment = rz.scene.environment;
  stage.environmentIntensity = 0.9;
  stage.add(new T.HemisphereLight(0xfff1e0, 0x3a3f4a, 1.3));
  const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 4); stage.add(key);
  const rim = new T.DirectionalLight(0x9fd0ff, 0.8); rim.position.set(4, 2, -4); stage.add(rim);
  const cam = new T.PerspectiveCamera(28, 1, 0.05, 400);

  // [name, object, turn, tilt toward the camera] - the flat pieces are tipped up so their faces show
  const items = [
    ['Phoenix', rz.creations[0].group, 0.55, 0],
    ['Guardian', rz.creations[1].group, 0.5, 0],
    ['Ruined temple', rz.creations[2].group, 0.6, 0],
    ['Stone hand', rz.palm, 2.6, 0.5],
    ['Folding fan', rz.fragments[0].group, 0.35, 1.2],
    ['Arched door', rz.fragments[2].group, 1.2, 1.25],
    ['Leaf', rz.fragments[3].group, 0.5, 1.0],
    ['Flower', rz.flower, 0.6, 0.35],
  ];
  rz.sockets.forEach(s => { s.ring.visible = false; });

  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#0e1014'; ctx.fillRect(0, 0, W, H);
  const label = (text, x, y, px, weight = 400, colour = '#ffffff', align = 'left', spacing = 0) => {
    ctx.font = weight + ' ' + px + 'px "Segoe UI", Arial, sans-serif';
    try { ctx.letterSpacing = spacing + 'px'; } catch (e) { /* older browsers */ }
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  };
  label('RENDER ZERO', 120, 96, 84, 300, '#ffffff', 'left', 22);
  label('Visual asset board', 120, 172, 34, 400, '#aab4c0', 'left', 4);
  label('Every model generated with Tripo  ·  shown as the white model the player finds, and as the form it takes once saved', W - 120, 172, 30, 400, '#aab4c0', 'right', 1);

  rz.renderer.setPixelRatio(1);
  rz.renderer.setSize(CELL, CELL, false);
  const box = new T.Box3(), size = new T.Vector3(), centre = new T.Vector3();
  const shot = () => {
    box.makeEmpty();
    stage.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) box.expandByObject(o); });
    box.getSize(size); box.getCenter(centre);
    const d = Math.max(size.x, size.y, size.z) * 0.62 / Math.tan(cam.fov * Math.PI / 360) * 1.12;
    cam.position.set(centre.x, centre.y + d * 0.22, centre.z + d);
    cam.lookAt(centre);
    cam.updateMatrixWorld(true);
    rz.renderer.render(stage, cam);
  };

  for (let i = 0; i < items.length; i++) {
    const [name, obj, yaw, tilt] = items[i];
    const keep = { parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone(), vis: obj.visible };
    const glows = [];                                     // halos and beacons belong to the game, not to a model sheet
    obj.traverse(o => { if (o.isSprite && o.visible) { glows.push(o); o.visible = false; } });
    stage.add(obj);
    obj.visible = true;
    obj.position.set(0, 0, 0); obj.rotation.set(tilt, yaw, 0, 'YXZ'); obj.scale.setScalar(1);
    obj.updateMatrixWorld(true);
    const x0 = 120 + (i % 4) * 920, y0 = 250 + Math.floor(i / 4) * 560;
    setLife(obj, 0);
    shot();
    ctx.drawImage(rz.renderer.domElement, x0, y0, CELL, CELL);
    setLife(obj, 1);
    shot();
    ctx.drawImage(rz.renderer.domElement, x0 + CELL, y0, CELL, CELL);
    label(name, x0 + 8, y0 + CELL + 36, 34, 500);
    label('white model   →   textured', x0 + CELL * 2 - 8, y0 + CELL + 36, 24, 400, '#8f9aa6', 'right', 1);
    // put it back as the game had it
    setLife(obj, name === 'Flower' ? 1 : 0);
    glows.forEach(o => { o.visible = true; });
    if (keep.parent) keep.parent.add(obj); else stage.remove(obj);
    obj.position.copy(keep.pos); obj.quaternion.copy(keep.quat); obj.scale.copy(keep.scale); obj.visible = keep.vis;
  }
  rz.sockets.forEach(s => { s.ring.visible = true; });

  // three frames of the environment, taken from the rendered walkthrough
  const frames = [['/video/frames/f_00165.jpg', 'The archive: unfinished generations waiting for deletion'],
    ['/video/frames/f_01137.jpg', 'After the first save: a new world arrives as points of light'],
    ['/video/stills/world_clean.jpg', 'After the last: a living world, generated with World Labs Marble']];
  const fw = 1160, fh = Math.round(fw * 9 / 16), fy = 250 + 2 * 560 + 40;
  for (let i = 0; i < frames.length; i++) {
    const img = new Image();
    img.src = frames[i][0];
    await img.decode().catch(() => {});
    const x = 120 + i * (fw + 60);
    if (img.naturalWidth) ctx.drawImage(img, x, fy, fw, fh);
    label(frames[i][1], x + 8, fy + fh + 36, 28, 400, '#c9d1da');
  }

  const a = await fetch('/save?b64=1&name=' + encodeURIComponent('stills/asset_board.jpg'), { method: 'POST', body: out.toDataURL('image/jpeg', 0.93) });
  const b = await fetch('/save?b64=1&name=' + encodeURIComponent('stills/asset_board.png'), { method: 'POST', body: out.toDataURL('image/png') });
  return [a.status, b.status];
}
