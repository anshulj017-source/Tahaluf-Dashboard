const admin = require('firebase-admin');
const serviceAccount = require('/Users/anshuljaiswal/Downloads/tahaluf-dashboard-firebase-adminsdk-fbsvc-b9ebb7425d.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function makeAdmin() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  if (snapshot.empty) {
    console.log('No users found in database yet.');
    process.exit(1);
  }
  
  const batch = db.batch();
  snapshot.forEach(doc => {
    console.log(`Upgrading user ${doc.id} to admin...`);
    batch.update(doc.ref, { role: 'admin' });
  });
  
  await batch.commit();
  console.log('Successfully granted admin rights!');
  process.exit(0);
}

makeAdmin().catch(console.error);
