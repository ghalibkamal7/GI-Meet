import 'dotenv/config';
import admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { migrateLegacyMeetingPasswordVerifiers } from '../src/services/legacyMeetingPasswordMigration.js';

function argumentValue(prefix) {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

async function main() {
  const expectedProjectId = argumentValue('--project=');
  if (!expectedProjectId) {
    throw new Error('Pass --project=<Firebase project ID>. No project is selected by default.');
  }
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required; no Firebase connection was attempted.');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  if (serviceAccount.project_id !== expectedProjectId) {
    throw new Error('The service-account project does not match --project; migration stopped.');
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const apply = process.argv.includes('--apply');
  const result = await migrateLegacyMeetingPasswordVerifiers({
    db: admin.firestore(),
    deleteField: () => FieldValue.delete(),
    apply,
  });
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    projectId: expectedProjectId,
    ...result,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
