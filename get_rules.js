const admin = require('firebase-admin');

const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const securityRules = admin.securityRules();

async function getRules() {
  try {
    const ruleset = await securityRules.getFirestoreRuleset();
    console.log(JSON.stringify(ruleset, null, 2));
  } catch (err) {
    console.error("Error getting rules:", err);
  }
}

getRules();
