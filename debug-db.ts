
import { db } from './server-firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

async function checkTokens() {
  console.log('Checking users collection...');
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    if (snapshot.empty) {
      console.log('No users found in "users" collection.');
      return;
    }

    console.log(`Found ${snapshot.size} users.`);
    
    for (const userDoc of snapshot.docs) {
      console.log(`Checking user: ${userDoc.id}`);
      const tokensRef = doc(db, 'users', userDoc.id, 'settings', 'tokens');
      const tokensSnap = await getDoc(tokensRef);
      
      if (tokensSnap.exists()) {
        const data = tokensSnap.data();
        console.log(`  Tokens found:`, Object.keys(data));
        if (data.vk) {
          console.log(`  VK Token present: ${data.vk.substring(0, 10)}...`);
        } else {
          console.log(`  VK Token MISSING in settings/tokens`);
        }
      } else {
        console.log(`  No settings/tokens document found for user.`);
      }
    }
  } catch (error) {
    console.error('Error checking DB:', error);
  }
}

checkTokens();
