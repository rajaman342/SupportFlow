import argon2 from 'argon2';
import bcrypt from 'bcrypt';

async function runArgon2Spike() {
  console.log('--- Testing Argon2id ---');
  const password = 'CorrectHorseBatteryStaple123!';
  const wrongPassword = 'IncorrectPassword456!';

  // OWASP recommended parameters for Argon2id
  // memoryCost: 19456 KiB (19 MiB), timeCost: 2 iterations, parallelism: 1
  const options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  };

  const iterations = 5;
  const hashDurations = [];
  const verifyDurations = [];
  let sampleHash = '';

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    sampleHash = await argon2.hash(password, options);
    hashDurations.push(performance.now() - t0);

    const t1 = performance.now();
    const isValid = await argon2.verify(sampleHash, password);
    verifyDurations.push(performance.now() - t1);

    if (!isValid) throw new Error('Argon2 valid password verification failed');
  }

  const wrongCheck = await argon2.verify(sampleHash, wrongPassword);
  if (wrongCheck) throw new Error('Argon2 wrong password succeeded erroneously');

  const avgHash = (hashDurations.reduce((a, b) => a + b, 0) / iterations).toFixed(2);
  const avgVerify = (verifyDurations.reduce((a, b) => a + b, 0) / iterations).toFixed(2);

  console.log(`Argon2id sample hash: ${sampleHash.slice(0, 35)}...`);
  console.log(`Argon2id avg hash time: ${avgHash} ms (5 runs)`);
  console.log(`Argon2id avg verify time: ${avgVerify} ms (5 runs)`);
  console.log('Argon2id verification: SUCCESS\n');

  return { ok: true, avgHash: parseFloat(avgHash), avgVerify: parseFloat(avgVerify), sampleHash };
}

async function runBcryptSpike() {
  console.log('--- Testing Bcrypt ---');
  const password = 'CorrectHorseBatteryStaple123!';
  const wrongPassword = 'IncorrectPassword456!';
  const saltRounds = 12;

  const iterations = 5;
  const hashDurations = [];
  const verifyDurations = [];
  let sampleHash = '';

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    sampleHash = await bcrypt.hash(password, saltRounds);
    hashDurations.push(performance.now() - t0);

    const t1 = performance.now();
    const isValid = await bcrypt.compare(password, sampleHash);
    verifyDurations.push(performance.now() - t1);

    if (!isValid) throw new Error('Bcrypt valid password verification failed');
  }

  const wrongCheck = await bcrypt.compare(wrongPassword, sampleHash);
  if (wrongCheck) throw new Error('Bcrypt wrong password succeeded erroneously');

  const avgHash = (hashDurations.reduce((a, b) => a + b, 0) / iterations).toFixed(2);
  const avgVerify = (verifyDurations.reduce((a, b) => a + b, 0) / iterations).toFixed(2);

  console.log(`Bcrypt sample hash: ${sampleHash.slice(0, 35)}...`);
  console.log(`Bcrypt avg hash time: ${avgHash} ms (5 runs)`);
  console.log(`Bcrypt avg verify time: ${avgVerify} ms (5 runs)`);
  console.log('Bcrypt verification: SUCCESS\n');

  return { ok: true, avgHash: parseFloat(avgHash), avgVerify: parseFloat(avgVerify), sampleHash };
}

async function main() {
  console.log('========================================================');
  console.log('SupportFlow Phase 1: Password Hashing Spike (Argon2id vs Bcrypt)');
  console.log(`Node runtime: ${process.version} on ${process.platform} ${process.arch}`);
  console.log('========================================================\n');

  let argon2Result = { ok: false, error: null };
  let bcryptResult = { ok: false, error: null };

  try {
    argon2Result = await runArgon2Spike();
  } catch (err) {
    console.error('Argon2id failed:', err.message);
    argon2Result.error = err.message;
  }

  try {
    bcryptResult = await runBcryptSpike();
  } catch (err) {
    console.error('Bcrypt failed:', err.message);
    bcryptResult.error = err.message;
  }

  console.log('================ SUMMARY ================');
  console.log(`Argon2id: ${argon2Result.ok ? 'SUPPORTED' : 'FAILED'}`);
  if (argon2Result.ok) {
    console.log(`  - Hash latency:   ${argon2Result.avgHash} ms`);
    console.log(`  - Verify latency: ${argon2Result.avgVerify} ms`);
    console.log(`  - Memory-hard:    Yes (19 MiB resistant to GPU/ASIC attacks)`);
  }
  console.log(`Bcrypt:   ${bcryptResult.ok ? 'SUPPORTED' : 'FAILED'}`);
  if (bcryptResult.ok) {
    console.log(`  - Hash latency:   ${bcryptResult.avgHash} ms`);
    console.log(`  - Verify latency: ${bcryptResult.avgVerify} ms`);
    console.log(`  - Memory-hard:    No (GPU-crackable compared to Argon2id)`);
  }

  if (argon2Result.ok) {
    console.log('\nRecommendation: ADOPT Argon2id (OWASP preferred standard)');
  } else {
    console.log('\nRecommendation: FALLBACK to Bcrypt (cost 12)');
  }
}

main().catch((err) => {
  console.error('Fatal spike error:', err);
  process.exit(1);
});
