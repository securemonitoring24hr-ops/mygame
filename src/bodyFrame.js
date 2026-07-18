// Builds a per-frame body-local coordinate frame from 3D world landmarks so
// punch/guard direction can be judged relative to the player's own torso
// orientation instead of raw camera axes (which flip/rotate as the player
// turns or the phone is held differently).
//
// Returns { origin, up, right, forward, scale } where up/right/forward are
// unit vectors and scale is the shoulder width in world units (meters-ish),
// used elsewhere to normalize speeds/distances across different body sizes
// and camera distances.

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function length(a) {
  return Math.sqrt(dot(a, a));
}
function normalize(a) {
  const len = length(a);
  if (len < 1e-6) return { x: 0, y: 1, z: 0 };
  return scale(a, 1 / len);
}

export { sub, add, scale, dot, cross, length, normalize };

// world: object with left_shoulder, right_shoulder, left_hip, right_hip, nose (each {x,y,z}).
// Returns null if not enough of the torso is visible.
export function computeBodyFrame(world) {
  const ls = world.left_shoulder;
  const rs = world.right_shoulder;
  const lh = world.left_hip;
  const rh = world.right_hip;
  if (!ls || !rs || !lh || !rh) return null;

  const shoulderMid = scale(add(ls, rs), 0.5);
  const hipMid = scale(add(lh, rh), 0.5);

  const shoulderWidthVec = sub(rs, ls);
  const scaleLen = length(shoulderWidthVec);
  if (scaleLen < 0.02) return null; // degenerate, too little of the torso visible

  let up = normalize(sub(shoulderMid, hipMid));

  // Orthogonalize the shoulder line against `up` (Gram-Schmidt) so `right`
  // is a clean lateral axis even if the torso is tilted.
  const rightRaw = sub(rs, ls);
  let right = normalize(sub(rightRaw, scale(up, dot(rightRaw, up))));

  let forward = normalize(cross(up, right));

  // MediaPipe's raw axis handedness isn't something we want to hard-code a
  // sign convention for, so self-correct: the nose is always roughly in
  // front of the torso, never behind it.
  if (world.nose) {
    const toNose = sub(world.nose, shoulderMid);
    if (dot(toNose, forward) < 0) {
      forward = scale(forward, -1);
      right = scale(right, -1); // keep the frame right-handed
    }
  }

  return { origin: hipMid, shoulderMid, up, right, forward, scale: scaleLen };
}
