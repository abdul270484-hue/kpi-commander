const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const config = require('./config');

const app = initializeApp(config.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

async function setupRPAUser() {
    const email = 'jarvis.rpa@bujm.com';
    const password = 'JarvisSuperPassword2026!';

    let user;
    try {
        console.log('Creating RPA user account...');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        console.log(`Created new RPA user with UID: ${user.uid}`);
    } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
            console.log('RPA user already exists. Signing in...');
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            user = userCredential.user;
            console.log(`Signed in RPA user with UID: ${user.uid}`);
        } else {
            console.error('Error creating/signing in user:', e);
            process.exit(1);
        }
    }

    try {
        console.log('Writing RPA admin role to Firestore...');
        await setDoc(doc(db, 'users', user.uid), {
            email: email,
            role: 'super admin',
            status: 'approved',
            createdAt: new Date().toISOString()
        }, { merge: true });
        console.log('Successfully set RPA user role in Firestore!');
    } catch (e) {
        console.error('Error writing to Firestore:', e);
    }
    
    console.log('SETUP COMPLETE.');
    process.exit(0);
}

setupRPAUser();
