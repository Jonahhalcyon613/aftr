// sign-and-deploy.mjs — package, self-sign, and install the CEP panel.
//
// Why this exists: After Effects 2025/2026 (CEP 12) ignores the PlayerDebugMode
// registry switch, so unsigned/unpacked panels are rejected with "Signature
// verification failed". The reliable path is to SIGN the extension. CEP accepts
// a self-signed certificate for loading (it verifies package integrity against
// the embedded cert; CA trust is only needed for public distribution).
//
// Pipeline:
//   1. build the JSX bundle
//   2. create a self-signed dev cert (once, cached in dist/)
//   3. sign panel/ -> dist/ae-bridge.zxp
//   4. install: replace the extensions-folder entry with the UNPACKED signed
//      extension (a .zxp is a zip; CEP loads the unpacked, signature-bearing dir)
//
// A signed extension is a snapshot: after editing panel source, re-run this
// (`npm run deploy:panel`) to re-sign and redeploy.

import zxpSignCmd from 'zxp-sign-cmd';
const { selfSignedCert, sign } = zxpSignCmd;
import {
  existsSync, mkdirSync, rmdirSync, rmSync, lstatSync, readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const PANEL_DIR = resolve(ROOT, 'panel');
const DIST_DIR = resolve(ROOT, 'dist');
const CERT_PATH = resolve(DIST_DIR, 'ae-bridge-cert.p12');
const ZXP_PATH = resolve(DIST_DIR, 'ae-bridge.zxp');
const CERT_PASSWORD = 'ae-bridge-dev';

// CEP per-user extensions folder (cross-platform).
const EXT_ROOT = process.platform === 'darwin'
  ? resolve(process.env.HOME, 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions')
  : resolve(process.env.APPDATA, 'Adobe', 'CEP', 'extensions');
const EXT_LINK = resolve(EXT_ROOT, 'com.ae-bridge.panel');

function log(msg) {
  console.log(`[deploy:panel] ${msg}`);
}

async function main() {
  mkdirSync(DIST_DIR, { recursive: true });

  // 1. Build the JSX bundle so the signed package contains the latest dispatch.
  log('building JSX bundle…');
  execFileSync(process.execPath, [resolve(PANEL_DIR, 'build', 'bundle-jsx.js')], {
    stdio: 'inherit',
  });

  // 2. Self-signed cert (cached).
  if (!existsSync(CERT_PATH)) {
    log('creating self-signed dev certificate…');
    await selfSignedCert({
      country: 'US',
      province: 'CA',
      org: 'aftr Dev',
      name: 'aftr Dev',
      password: CERT_PASSWORD,
      output: CERT_PATH,
    });
  } else {
    log('using cached certificate.');
  }

  // 3. Sign panel/ -> dist/ae-bridge.zxp
  if (existsSync(ZXP_PATH)) rmSync(ZXP_PATH, { force: true });
  log('signing panel into ae-bridge.zxp…');
  await sign({
    input: PANEL_DIR,
    output: ZXP_PATH,
    cert: CERT_PATH,
    password: CERT_PASSWORD,
  });

  // 4. Install: remove the old extension entry (junction OR real dir), then
  //    unpack the signed zxp into the extensions folder.
  mkdirSync(EXT_ROOT, { recursive: true });
  if (existsSync(EXT_LINK)) {
    const st = lstatSync(EXT_LINK);
    if (st.isSymbolicLink()) {
      // junction/symlink: remove only the link, never follow into the target.
      log('removing existing junction…');
      try {
        rmdirSync(EXT_LINK);
      } catch {
        // some Node builds need unlink for reparse points
        rmSync(EXT_LINK, { recursive: false, force: true });
      }
    } else {
      log('removing previous deployed copy…');
      rmSync(EXT_LINK, { recursive: true, force: true });
    }
  }
  mkdirSync(EXT_LINK, { recursive: true });

  // .zxp is a zip; Windows 10+ bundles bsdtar which extracts zip via `tar -xf`.
  log('unpacking signed extension into CEP extensions folder…');
  execFileSync('tar', ['-xf', ZXP_PATH, '-C', EXT_LINK], { stdio: 'inherit' });

  const files = readdirSync(EXT_LINK);
  const hasManifest = existsSync(join(EXT_LINK, 'CSXS', 'manifest.xml'));
  const hasSig = existsSync(join(EXT_LINK, 'META-INF', 'signatures.xml'));
  log(`installed to: ${EXT_LINK}`);
  log(`  top-level entries: ${files.join(', ')}`);
  log(`  manifest present:  ${hasManifest}`);
  log(`  signature present: ${hasSig}`);
  if (!hasManifest || !hasSig) {
    throw new Error('Deploy incomplete: missing manifest or signature in installed extension.');
  }
  log('DONE. Fully quit After Effects and relaunch, then Window > Extensions > aftr.');
}

main().catch((e) => {
  console.error('[deploy:panel] FAILED:', e.message);
  process.exit(1);
});
