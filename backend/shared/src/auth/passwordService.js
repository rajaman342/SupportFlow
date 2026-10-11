import argon2 from 'argon2';

// OWASP recommended parameters for Argon2id
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,       // 2 iterations
  parallelism: 1
};

// Pre-computed constant Argon2id hash for timing attack mitigation
let dummyHash = null;

async function getDummyHash() {
  if (!dummyHash) {
    dummyHash = await argon2.hash('DummyConstantPasswordForTimingMitigation123!', ARGON2_OPTIONS);
  }
  return dummyHash;
}

export async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function verifyDummyPassword(password) {
  try {
    const dummy = await getDummyHash();
    await argon2.verify(dummy, password);
  } catch {
    // Intentionally ignore
  }
}
