import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '../../../../lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const listUsersResult = await adminAuth.listUsers(1000);
    const users = [];

    // Fetch isAdmin from Firestore for each user
    for (const userRecord of listUsersResult.users) {
      const docRef = adminDb.collection('users').doc(userRecord.uid);
      const docSnap = await docRef.get();
      const userData = docSnap.exists ? docSnap.data() : {};
      
      users.push({
        uid: userRecord.uid,
        email: userRecord.email,
        role: userData.role || (userData.isAdmin ? 'admin' : 'standard'),
        lastSignInTime: userData.lastActive || userRecord.metadata.lastSignInTime || null,
        creationTime: userRecord.metadata.creationTime || null,
      });
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users: ' + error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const { email, password, role } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
    });

    await adminDb.collection('users').doc(userRecord.uid).set({
      role: role || 'standard',
    });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const { uid, role, password } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: 'UID is required' }, { status: 400 });
    }

    if (role) {
      await adminDb.collection('users').doc(uid).set({
        role: role,
      }, { merge: true });
    }

    if (password) {
      await adminAuth.updateUser(uid, { password });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: 'UID is required' }, { status: 400 });
    }

    await adminAuth.deleteUser(uid);
    await adminDb.collection('users').doc(uid).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
