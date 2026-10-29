import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '../../../../lib/firebaseAdmin';
import { isSuperAdminRequest } from '../../../../lib/requireAdminRequest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  try {
    if (!await isSuperAdminRequest(req)) {
      return NextResponse.json({ error: 'Super Admin access required to view user accounts.' }, { status: 403 });
    }

    const { adminAuth, adminDb } = getFirebaseAdmin();
    const listUsersResult = await adminAuth.listUsers(1000);

    // Fetch all user roles from Firestore in a single query instead of sequential roundtrips
    const usersSnapshot = await adminDb.collection('users').get().catch(() => null);
    const userRolesMap = new Map();
    if (usersSnapshot && !usersSnapshot.empty) {
      usersSnapshot.forEach(doc => {
        userRolesMap.set(doc.id, doc.data());
      });
    }

    const users = listUsersResult.users.map(userRecord => {
      const userData = userRolesMap.get(userRecord.uid) || {};
      const role = userData.role || (userData.isAdmin ? 'admin' : 'standard');
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        role,
        lastSignInTime: userData.lastActive || userRecord.metadata.lastSignInTime || null,
        creationTime: userRecord.metadata.creationTime || null,
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users: ' + error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    if (!await isSuperAdminRequest(req)) {
      return NextResponse.json({ error: 'Super Admin access required to create user accounts.' }, { status: 403 });
    }

    const { adminAuth, adminDb } = getFirebaseAdmin();
    const { email, password, role } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const assignedRole = role || 'standard';

    const userRecord = await adminAuth.createUser({
      email: normalizedEmail,
      password,
    });

    await adminDb.collection('users').doc(userRecord.uid).set({
      email: normalizedEmail,
      role: assignedRole,
      createdAt: new Date().toISOString()
    });

    // Set custom claims so role is embedded into Firebase ID tokens
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: assignedRole,
      admin: assignedRole === 'super_admin' || assignedRole === 'admin',
      super_admin: assignedRole === 'super_admin'
    }).catch(() => {});

    return NextResponse.json({ success: true, uid: userRecord.uid, role: assignedRole });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    if (!await isSuperAdminRequest(req)) {
      return NextResponse.json({ error: 'Super Admin access required to modify user accounts or roles.' }, { status: 403 });
    }

    const { adminAuth, adminDb } = getFirebaseAdmin();
    const { uid, role, password } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: 'UID is required' }, { status: 400 });
    }

    if (role) {
      await adminDb.collection('users').doc(uid).set({
        role: role,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Synchronize custom user claims on Firebase Auth
      await adminAuth.setCustomUserClaims(uid, {
        role: role,
        admin: role === 'super_admin' || role === 'admin',
        super_admin: role === 'super_admin'
      }).catch(() => {});
    }

    if (password) {
      await adminAuth.updateUser(uid, { password });
    }

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    if (!await isSuperAdminRequest(req)) {
      return NextResponse.json({ error: 'Super Admin access required to delete user accounts.' }, { status: 403 });
    }

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
