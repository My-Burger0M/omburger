import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// Helper function to resize image and convert to base64
const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Compress to WebP to save space in Firestore
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
};

export function useFirebaseImage(imageKey: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    
    const fetchImage = async () => {
      try {
        // Store images in the main user document to simplify permissions
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.images && data.images[imageKey]) {
            setUrl(data.images[imageKey]);
          }
        }
      } catch (error) {
        console.error("Error fetching image:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchImage();
  }, [currentUser, imageKey]);

  const uploadImage = async (file: File) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Resize to max 256x256 for icons to keep base64 size small
      const base64String = await resizeImage(file, 256, 256);
      setUrl(base64String);

      const docRef = doc(db, 'users', currentUser.uid);
      await setDoc(docRef, { 
        images: { 
          [imageKey]: base64String 
        } 
      }, { merge: true });
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Ошибка доступа. Проверьте правила Firestore в консоли Firebase.");
    } finally {
      setLoading(false);
    }
  };

  return { url, uploadImage, loading };
}
