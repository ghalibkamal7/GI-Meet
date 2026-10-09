#!/usr/bin/env node
/**
 * Applies the GI Meet native configuration to the Capacitor projects that
 * `npx cap add android` / `npx cap add ios` generated.
 *
 *   node scripts/configure-native.mjs [--check] [--platform=android|ios|all] [--host=your.domain.com]
 *
 * - Idempotent: anything that is already present is left exactly as it is, so
 *   running it twice (or on a project you already edited by hand) never
 *   duplicates a permission, key or intent filter.
 * - Only ADDS. It never rewrites or removes existing entries.
 * - Report-only for things it must not guess: the app id, app label and
 *   Firebase config files are checked and reported, never changed.
 * - --check changes nothing; exit code 2 means "changes are still needed".
 * - --host enables https deep links (Android App Links) for that domain. It is
 *   optional on purpose — the production domain is not something this script
 *   should assume.
 *
 * Uses only Node built-ins. Commit your work before running it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_APP_ID = 'com.gimeet.app';
export const EXPECTED_APP_NAME = 'GI Meet';
export const URL_SCHEME = 'gimeet';

export const ANDROID_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.POST_NOTIFICATIONS',
];

export const IOS_USAGE_DESCRIPTIONS = {
  NSCameraUsageDescription: 'GI Meet needs camera access to take photos in chat and for video calls.',
  NSMicrophoneUsageDescription: 'GI Meet needs microphone access for voice messages and calls.',
  NSPhotoLibraryUsageDescription: 'GI Meet needs photo library access to attach images.',
};

const DEEP_LINK_PATH_PREFIXES = ['/join-group', '/join-community', '/meeting'];

const PATHS = {
  androidManifest: 'android/app/src/main/AndroidManifest.xml',
  androidStrings: 'android/app/src/main/res/values/strings.xml',
  androidGradle: ['android/app/build.gradle', 'android/app/build.gradle.kts'],
  androidGoogleServices: 'android/app/google-services.json',
  iosPlist: 'ios/App/App/Info.plist',
  iosPbxproj: 'ios/App/App.xcodeproj/project.pbxproj',
  iosGoogleServices: 'ios/App/App/GoogleService-Info.plist',
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Android transforms (pure: string in, string out)
// ---------------------------------------------------------------------------

export function ensureAndroidPermissions(xml, permissions = ANDROID_PERMISSIONS) {
  const added = [];
  let result = xml;
  for (const name of permissions) {
    const present = new RegExp(`<uses-permission[^>]*android:name="${escapeRegExp(name)}"`).test(result);
    if (present) continue;
    if (!result.includes('</manifest>')) throw new Error('AndroidManifest.xml has no </manifest> tag');
    result = result.replace('</manifest>', `    <uses-permission android:name="${name}" />\n</manifest>`);
    added.push(name);
  }
  return { xml: result, added };
}

function insertIntoMainActivity(xml, block) {
  const start = xml.indexOf('android:name=".MainActivity"');
  if (start === -1) return null;
  const end = xml.indexOf('</activity>', start);
  if (end === -1) return null;
  return `${xml.slice(0, end)}${block}\n        ${xml.slice(end)}`;
}

export function ensureAndroidDeepLinks(xml, host) {
  const notes = [];
  let result = xml;
  let changed = false;

  if (host && !result.includes(`android:host="${host}"`)) {
    const dataLines = DEEP_LINK_PATH_PREFIXES.map(
      (prefix) => `                <data android:scheme="https" android:host="${host}" android:pathPrefix="${prefix}" />`
    ).join('\n');
    const block = [
      '',
      '            <intent-filter android:autoVerify="true">',
      '                <action android:name="android.intent.action.VIEW" />',
      '                <category android:name="android.intent.category.DEFAULT" />',
      '                <category android:name="android.intent.category.BROWSABLE" />',
      dataLines,
      '            </intent-filter>',
    ].join('\n');
    const next = insertIntoMainActivity(result, block);
    if (next === null) notes.push('Could not find MainActivity in AndroidManifest.xml — add the https intent filter by hand.');
    else {
      result = next;
      changed = true;
    }
  }

  if (!result.includes(`android:scheme="${URL_SCHEME}"`)) {
    const block = [
      '',
      '            <intent-filter>',
      '                <action android:name="android.intent.action.VIEW" />',
      '                <category android:name="android.intent.category.DEFAULT" />',
      '                <category android:name="android.intent.category.BROWSABLE" />',
      `                <data android:scheme="${URL_SCHEME}" />`,
      '            </intent-filter>',
    ].join('\n');
    const next = insertIntoMainActivity(result, block);
    if (next === null) notes.push(`Could not find MainActivity in AndroidManifest.xml — add the ${URL_SCHEME}:// intent filter by hand.`);
    else {
      result = next;
      changed = true;
    }
  }

  return { xml: result, changed, notes };
}

// ---------------------------------------------------------------------------
// iOS transforms
// ---------------------------------------------------------------------------

function insertBeforeLastDict(plist, text) {
  const index = plist.lastIndexOf('</dict>');
  if (index === -1) throw new Error('Info.plist has no closing </dict>');
  return `${plist.slice(0, index)}${text}${plist.slice(index)}`;
}

export function ensurePlistStrings(plist, entries = IOS_USAGE_DESCRIPTIONS) {
  const added = [];
  let result = plist;
  for (const [key, value] of Object.entries(entries)) {
    if (result.includes(`<key>${key}</key>`)) continue; // never overwrite an existing value
    result = insertBeforeLastDict(result, `\t<key>${key}</key>\n\t<string>${escapeXml(value)}</string>\n`);
    added.push(key);
  }
  return { plist: result, added };
}

export function ensureBackgroundMode(plist, mode = 'remote-notification') {
  const keyTag = '<key>UIBackgroundModes</key>';
  if (!plist.includes(keyTag)) {
    const block = `\t${keyTag}\n\t<array>\n\t\t<string>${mode}</string>\n\t</array>\n`;
    return { plist: insertBeforeLastDict(plist, block), changed: true, note: null };
  }
  const arrayPattern = /(<key>UIBackgroundModes<\/key>\s*<array>)([\s\S]*?)(<\/array>)/;
  const match = arrayPattern.exec(plist);
  if (!match) return { plist, changed: false, note: 'UIBackgroundModes exists but is not a plain array — add remote-notification by hand.' };
  if (match[2].includes(`<string>${mode}</string>`)) return { plist, changed: false, note: null };
  const updated = plist.replace(arrayPattern, `$1$2\t<string>${mode}</string>\n\t\t$3`);
  return { plist: updated, changed: true, note: null };
}

export function ensureUrlScheme(plist, scheme = URL_SCHEME, identifier = EXPECTED_APP_ID) {
  if (!plist.includes('<key>CFBundleURLTypes</key>')) {
    const block = [
      '\t<key>CFBundleURLTypes</key>',
      '\t<array>',
      '\t\t<dict>',
      '\t\t\t<key>CFBundleURLName</key>',
      `\t\t\t<string>${identifier}</string>`,
      '\t\t\t<key>CFBundleURLSchemes</key>',
      '\t\t\t<array>',
      `\t\t\t\t<string>${scheme}</string>`,
      '\t\t\t</array>',
      '\t\t</dict>',
      '\t</array>',
      '',
    ].join('\n');
    return { plist: insertBeforeLastDict(plist, block), changed: true, note: null };
  }
  if (plist.includes(`<string>${scheme}</string>`)) return { plist, changed: false, note: null };
  return { plist, changed: false, note: `CFBundleURLTypes already exists without "${scheme}" — add the ${scheme}:// scheme by hand (Xcode > Target > Info > URL Types).` };
}

// ---------------------------------------------------------------------------
// Report-only checks
// ---------------------------------------------------------------------------

export function readPlistString(plist, key) {
  const match = new RegExp(`<key>${escapeRegExp(key)}</key>\\s*<string>([^<]*)</string>`).exec(plist);
  return match ? match[1] : null;
}

function readIfExists(root, relativePath) {
  const full = resolve(root, relativePath);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

function readFirstExisting(root, candidates) {
  for (const candidate of candidates) {
    const text = readIfExists(root, candidate);
    if (text !== null) return { path: candidate, text };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { check: false, platform: 'all', host: null };
  for (const arg of argv) {
    if (arg === '--check') options.check = true;
    else if (arg.startsWith('--platform=')) options.platform = arg.slice('--platform='.length);
    else if (arg.startsWith('--host=')) options.host = arg.slice('--host='.length).trim().toLowerCase();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['all', 'android', 'ios'].includes(options.platform)) throw new Error('--platform must be android, ios or all');
  if (options.host !== null && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(options.host)) throw new Error(`--host "${options.host}" is not a valid domain name`);
  return options;
}

export function run(root, options, log = console.log) {
  let pending = 0;
  let missingFiles = 0;
  const report = (status, message) => log(`  ${status.padEnd(9)} ${message}`);

  const apply = (relativePath, before, after, label) => {
    if (after === before) return;
    pending += 1;
    if (options.check) report('NEEDED', label);
    else {
      writeFileSync(resolve(root, relativePath), after);
      report('ADDED', label);
    }
  };

  if (options.platform === 'all' || options.platform === 'android') {
    log('\nAndroid');
    const manifest = readIfExists(root, PATHS.androidManifest);
    if (manifest === null) {
      missingFiles += 1;
      log(`  MISSING   ${PATHS.androidManifest} — run "npx cap add android" first`);
    } else {
      let xml = manifest;
      const perms = ensureAndroidPermissions(xml);
      for (const name of ANDROID_PERMISSIONS) {
        if (!perms.added.includes(name)) report('OK', `${name} already present`);
        else apply(PATHS.androidManifest, xml, perms.xml, `${name}`);
      }
      xml = perms.xml;

      const links = ensureAndroidDeepLinks(xml, options.host);
      if (links.changed) apply(PATHS.androidManifest, xml, links.xml, `deep-link intent filters (${options.host ? `https://${options.host}, ` : ''}${URL_SCHEME}://)`);
      else if (!links.notes.length) report('OK', 'deep-link intent filters already present');
      for (const note of links.notes) report('MANUAL', note);
      if (!options.host) report('SKIPPED', 'https deep links: pass --host=your.domain.com to add Android App Links');

      // Report-only checks
      const strings = readIfExists(root, PATHS.androidStrings);
      const label = strings ? /<string name="app_name">([^<]*)<\/string>/.exec(strings)?.[1] : null;
      if (label === EXPECTED_APP_NAME) report('OK', `app label is "${label}"`);
      else report('CHECK', `app label is ${label ? `"${label}"` : 'not readable'}, expected "${EXPECTED_APP_NAME}" (android/app/src/main/res/values/strings.xml)`);

      const gradle = readFirstExisting(root, PATHS.androidGradle);
      const appId = gradle ? /applicationId\s*=?\s*["']([^"']+)["']/.exec(gradle.text)?.[1] : null;
      if (appId === EXPECTED_APP_ID) report('OK', `applicationId is ${appId}`);
      else report('CHECK', `applicationId is ${appId ?? 'not readable'}, expected ${EXPECTED_APP_ID}`);

      if (existsSync(resolve(root, PATHS.androidGoogleServices))) report('OK', 'google-services.json present');
      else report('MANUAL', `${PATHS.androidGoogleServices} missing — download it from Firebase Console (needed for push notifications)`);
    }
  }

  if (options.platform === 'all' || options.platform === 'ios') {
    log('\niOS');
    const plist = readIfExists(root, PATHS.iosPlist);
    if (plist === null) {
      missingFiles += 1;
      log(`  MISSING   ${PATHS.iosPlist} — run "npx cap add ios" first`);
    } else {
      let text = plist;
      const strings = ensurePlistStrings(text);
      for (const key of Object.keys(IOS_USAGE_DESCRIPTIONS)) {
        if (!strings.added.includes(key)) report('OK', `${key} already present`);
        else apply(PATHS.iosPlist, text, strings.plist, key);
      }
      text = strings.plist;

      const background = ensureBackgroundMode(text);
      if (background.changed) apply(PATHS.iosPlist, text, background.plist, 'UIBackgroundModes: remote-notification');
      else if (background.note) report('MANUAL', background.note);
      else report('OK', 'UIBackgroundModes already has remote-notification');
      text = background.plist;

      const scheme = ensureUrlScheme(text);
      if (scheme.changed) apply(PATHS.iosPlist, text, scheme.plist, `URL scheme ${URL_SCHEME}://`);
      else if (scheme.note) report('MANUAL', scheme.note);
      else report('OK', `URL scheme ${URL_SCHEME}:// already present`);

      const displayName = readPlistString(plist, 'CFBundleDisplayName');
      if (displayName === EXPECTED_APP_NAME) report('OK', `CFBundleDisplayName is "${displayName}"`);
      else report('CHECK', `CFBundleDisplayName is ${displayName ? `"${displayName}"` : 'not set'}, expected "${EXPECTED_APP_NAME}"`);

      const pbx = readIfExists(root, PATHS.iosPbxproj);
      const bundleIds = pbx ? [...new Set([...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1].trim()))] : [];
      if (bundleIds.length === 1 && bundleIds[0] === EXPECTED_APP_ID) report('OK', `bundle identifier is ${EXPECTED_APP_ID}`);
      else report('CHECK', `bundle identifier(s): ${bundleIds.join(', ') || 'not readable'} — expected ${EXPECTED_APP_ID}`);

      if (existsSync(resolve(root, PATHS.iosGoogleServices))) report('OK', 'GoogleService-Info.plist present (also confirm it is added to the App target in Xcode)');
      else report('MANUAL', `${PATHS.iosGoogleServices} missing — download it from Firebase Console and add it to the App target in Xcode`);

      report('MANUAL', 'Xcode > Signing & Capabilities: add "Push Notifications" and "Background Modes > Remote notifications"' + (options.host ? `, and "Associated Domains" = applinks:${options.host}` : ''));
    }
  }

  log('');
  if (missingFiles) log(`${missingFiles} platform project(s) not found.`);
  if (options.check) log(pending ? `${pending} change(s) still needed.` : 'Nothing to change.');
  else log(pending ? `Applied ${pending} change(s).` : 'Nothing to change — already configured.');
  return { pending, missingFiles };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const { pending, missingFiles } = run(process.cwd(), options);
  if (missingFiles) process.exit(1);
  if (options.check && pending) process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();