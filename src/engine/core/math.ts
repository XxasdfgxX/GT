/** Plain vec/quat helpers. Hot paths write into caller-owned objects. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** One sRGB channel, 0 to 1, as the linear value the renderer blends with. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number, out: Vec3): void {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
}

/** Column-major 4x4. Yaw is a rotation around Y, matching quatFromYaw. */
export function writeYawMatrix(
  out: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const o = index * 16;
  out[o] = c;
  out[o + 1] = 0;
  out[o + 2] = -s;
  out[o + 3] = 0;
  out[o + 4] = 0;
  out[o + 5] = 1;
  out[o + 6] = 0;
  out[o + 7] = 0;
  out[o + 8] = s;
  out[o + 9] = 0;
  out[o + 10] = c;
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}

export function quatFromYaw(yaw: number, out: Quat): void {
  const half = yaw * 0.5;
  out.x = 0;
  out.y = Math.sin(half);
  out.z = 0;
  out.w = Math.cos(half);
}

/** Yaw around Y, then pitch around local X. Positive pitch lifts local +Z. Scale is full size of a unit mesh. */
export function writeTransformMatrix(
  out: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const cy = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const o = index * 16;
  out[o] = cy * sx;
  out[o + 1] = 0;
  out[o + 2] = -syaw * sx;
  out[o + 3] = 0;
  out[o + 4] = -syaw * sp * sy;
  out[o + 5] = cp * sy;
  out[o + 6] = -cy * sp * sy;
  out[o + 7] = 0;
  out[o + 8] = syaw * cp * sz;
  out[o + 9] = sp * sz;
  out[o + 10] = cy * cp * sz;
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}

export function quatFromYawPitch(yaw: number, pitch: number, out: Quat): void {
  const hy = yaw * 0.5;
  const hp = pitch * 0.5;
  const sy = Math.sin(hy);
  const cy = Math.cos(hy);
  const sp = Math.sin(hp);
  const cp = Math.cos(hp);
  out.x = -cy * sp;
  out.y = sy * cp;
  out.z = sy * sp;
  out.w = cy * cp;
}

export function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number,
  out: Quat,
): void {
  const half = angle * 0.5;
  const s = Math.sin(half);
  out.x = ax * s;
  out.y = ay * s;
  out.z = az * s;
  out.w = Math.cos(half);
}

export function quatMul(a: Quat, b: Quat, out: Quat): void {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  const aw = a.w;
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  const bw = b.w;
  out.x = aw * bx + ax * bw + ay * bz - az * by;
  out.y = aw * by - ax * bz + ay * bw + az * bx;
  out.z = aw * bz + ax * by - ay * bx + az * bw;
  out.w = aw * bw - ax * bx - ay * by - az * bz;
}

export function rotateVec3ByQuat(q: Quat, v: Vec3, out: Vec3): void {
  const vx = v.x;
  const vy = v.y;
  const vz = v.z;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  out.x = vx + q.w * tx + (q.y * tz - q.z * ty);
  out.y = vy + q.w * ty + (q.z * tx - q.x * tz);
  out.z = vz + q.w * tz + (q.x * ty - q.y * tx);
}

function normalizeQuat(out: Quat): void {
  const length = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  out.x /= length;
  out.y /= length;
  out.z /= length;
  out.w /= length;
}

export function slerpQuat(a: Quat, b: Quat, t: number, out: Quat): void {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    out.x = a.x + t * (bx - a.x);
    out.y = a.y + t * (by - a.y);
    out.z = a.z + t * (bz - a.z);
    out.w = a.w + t * (bw - a.w);
    normalizeQuat(out);
    return;
  }
  const theta = Math.acos(Math.min(1, dot));
  const sin = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / sin;
  const w2 = Math.sin(t * theta) / sin;
  out.x = a.x * w1 + bx * w2;
  out.y = a.y * w1 + by * w2;
  out.z = a.z * w1 + bz * w2;
  out.w = a.w * w1 + bw * w2;
}
