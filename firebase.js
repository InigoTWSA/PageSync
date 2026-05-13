// firebase.js - Shared Firebase configuration and utilities
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, initializeFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, serverTimestamp, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyBEgkePSSuw1LkVOXLWL__pzcC11HGY_Ww",
    authDomain:        "pagesync-7a722.firebaseapp.com",
    projectId:         "pagesync-7a722",
    storageBucket:     "pagesync-7a722.appspot.com",
    messagingSenderId: "612753494941",
    appId:             "1:612753494941:web:192411b4fca39ddfdf9574",
};

const app = initializeApp(firebaseConfig);
export const auth           = getAuth(app);
export const db             = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
});
export const googleProvider = new GoogleAuthProvider();

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user   = result.user;

  const userDocRef   = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userDocRef);

  if (!userSnapshot.exists()) {
    const username = await createUniqueUsername(user.displayName || user.email);
    await setDoc(userDocRef, {
      displayName: user.displayName || '',
      email:       user.email,
      username,
      provider:    'google',
      avatarUrl:   user.photoURL || '',
      createdAt:   serverTimestamp(),
    });
  } else {
    // Sync Google photo if not already stored
    const data = userSnapshot.data();
    if (!data.avatarUrl && user.photoURL) {
      await setDoc(userDocRef, { avatarUrl: user.photoURL }, { merge: true });
    }
  }

  return user;
}

export async function signupWithEmail(email, password, username) {
  if (await usernameExists(username)) {
    throw new Error('Username already taken');
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid            = userCredential.user.uid;

  await setDoc(doc(db, 'users', uid), {
    email,
    username,
    displayName: '',
    provider:    'local',
    avatarUrl:   '',
    createdAt:   serverTimestamp(),
  });

  return userCredential.user;
}

export async function loginWithEmail(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await signOut(auth);
}

export async function usernameExists(username) {
  const q        = query(collection(db, 'users'), where('username', '==', username));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

export async function createUniqueUsername(base) {
  let candidate = base.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!candidate) candidate = 'reader';

  let suffix = 0;
  while (await usernameExists(suffix ? `${candidate}${suffix}` : candidate)) {
    suffix += 1;
  }

  return suffix ? `${candidate}${suffix}` : candidate;
}

// ── Book helpers ──────────────────────────────────────────────────────────────

/**
 * Add a book to the user's library, or update it if already saved.
 * Deduplication key: externalId + source.
 * Returns { existed: boolean, id: string }
 */
export async function addBook(uid, bookData) {
  const booksRef = collection(db, 'users', uid, 'books');

  // Check for an existing entry with the same externalId + source
  if (bookData.externalId && bookData.source) {
    const q        = query(booksRef,
                       where('externalId', '==', bookData.externalId),
                       where('source',     '==', bookData.source));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // Already saved — update status only, preserve original addedAt
      const existing = snapshot.docs[0];
      await updateDoc(existing.ref, { status: bookData.status });
      return { existed: true, id: existing.id };
    }
  }

  // New book — create a fresh document
  const docRef = await addDoc(booksRef, {
    ...bookData,
    addedAt: serverTimestamp(),
  });
  return { existed: false, id: docRef.id };
}

/**
 * Look up a saved book by its external API id and source.
 * Returns the book object (with Firestore doc id) or null.
 */
export async function getBookByExternalId(uid, externalId, source) {
  const booksRef = collection(db, 'users', uid, 'books');
  const q        = query(booksRef,
                     where('externalId', '==', externalId),
                     where('source',     '==', source));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

export async function getBooks(uid, status = null) {
  const booksRef = collection(db, 'users', uid, 'books');
  let q          = query(booksRef);
  if (status) {
    q = query(booksRef, where('status', '==', status));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateBook(uid, bookId, updates) {
  const bookRef = doc(db, 'users', uid, 'books', bookId);
  await setDoc(bookRef, updates, { merge: true });
}

export async function deleteBook(uid, bookId) {
  const bookRef = doc(db, 'users', uid, 'books', bookId);
  await deleteDoc(bookRef);
}

// ── Auth state listener ───────────────────────────────────────────────────────

export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}