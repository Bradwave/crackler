// Crackler: Pure camera-motion correction from reference marks of something that does not move in the scene.
// One reference gives the shift of the origin; a second one also gives the rotation of the axes.
// Points are mapped back to the image as it was at the base frame, then calibration works as usual.

// cam: { a: trackId, b: trackId | null, base: frame }.
// refs(trackId, frame) -> [x, y] or null (the caller interpolates between marked frames).
// Returns { a0, af, d } for the frame, or null when the references are not available.
function cameraFrame(cam, refs, frame) {
  if (!cam) return null;
  const a0 = refs(cam.a, cam.base),
    af = refs(cam.a, frame);
  if (!a0 || !af) return null;
  let d = 0;
  if (cam.b != null) {
    const b0 = refs(cam.b, cam.base),
      bf = refs(cam.b, frame);
    if (b0 && bf) d = Math.atan2(bf[1] - af[1], bf[0] - af[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
  }
  return { a0, af, d };
}
function rot(v, a) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}
// A point seen at this frame -> where it would be at the base frame.
function toBase(p, cf) {
  if (!cf) return p;
  const v = rot([p[0] - cf.af[0], p[1] - cf.af[1]], -cf.d);
  return [cf.a0[0] + v[0], cf.a0[1] + v[1]];
}
// A point of the base-frame image -> where it appears at this frame.
function fromBase(p, cf) {
  if (!cf) return p;
  const v = rot([p[0] - cf.a0[0], p[1] - cf.a0[1]], cf.d);
  return [cf.af[0] + v[0], cf.af[1] + v[1]];
}

export { cameraFrame, toBase, fromBase };
