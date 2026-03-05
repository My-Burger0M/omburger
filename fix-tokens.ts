
import { db } from './server-firebase';
import { collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';

async function fixTokens() {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);

    if (snapshot.empty) {
      console.log('No users found.');
      return;
    }

    for (const userDoc of snapshot.docs) {
      console.log(`Checking user: ${userDoc.id}`);
      const tokensRef = doc(db, 'users', userDoc.id, 'settings', 'tokens');
      
      // Remove TG token
      await updateDoc(tokensRef, {
        tg: deleteField()
      });
      console.log(`Removed TG token for user ${userDoc.id}`);
    }
    
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixTokens();
