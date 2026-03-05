import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { db, auth } from './server-firebase';
import { collection, addDoc, doc, setDoc, updateDoc, increment, serverTimestamp, getDoc, getDocs, query, arrayUnion } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { VK } from 'vk-io';
import { Telegraf } from 'telegraf';
import axios from 'axios';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- Firebase Auth for Server ---
  try {
    await signInAnonymously(auth);
    console.log('Server signed in to Firebase anonymously');
  } catch (error) {
    console.error('Error signing in to Firebase:', error);
  }

  // --- Bot Setup ---
  let vk: VK | null = null;
  let tgBot: Telegraf | null = null;
  let vkPollingStarted = false;
  let tgTokenFound = false;
  let wbTokenFound = false;
  let ozonTokenFound = false;
  let maxTokenFound = false;
  let lastVkError: string | null = null;
  let lastTgError: string | null = null;

  const initBots = async () => {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      // Reset flags
      if (vk) {
        try { await vk.updates.stop(); } catch (e) { console.error('Error stopping VK:', e); }
        vk = null;
      }
      if (tgBot) {
        try { tgBot.stop(); } catch (e) { console.error('Error stopping TG:', e); }
        tgBot = null;
      }

      vkPollingStarted = false;
      tgTokenFound = false;
      wbTokenFound = false;
      ozonTokenFound = false;
      maxTokenFound = false;
      lastVkError = null;
      lastTgError = null;

      for (const userDoc of snapshot.docs) {
        const tokens = userDoc.data().tokens || {};
        
        if (tokens.vk || tokens.tg || tokens.wb || tokens.ozon || tokens.max) {
          // Check for tokens
          if (tokens.tg) tgTokenFound = true;
          if (tokens.wb) wbTokenFound = true;
          if (tokens.ozon) ozonTokenFound = true;
          if (tokens.max) maxTokenFound = true;

          // Initialize VK if token exists
          if (tokens.vk && !vk) {
            console.log('Found VK token for user', userDoc.id);
            vk = new VK({ token: tokens.vk });
            
            // Try to identify if it's a group token
            vk.api.groups.getById({}).then(groups => {
              console.log('VK Bot identified as Group:', groups[0].name);
            }).catch(e => {
              console.log('VK Bot might be using a User Token or invalid Group Token');
            });
            
            // Re-attach listeners
             vk.updates.on('message_new', async (context) => {
                if (context.isOutbox) return;
                const text = context.text || '';
                const chatId = context.senderId.toString();
                let username = `User ${chatId}`;
                try {
                  const [user] = await vk!.api.users.get({ user_ids: [context.senderId] });
                  if (user) username = `${user.first_name} ${user.last_name}`;
                } catch (e) { console.error('Error fetching VK user info:', e); }
                
                console.log(`Received VK message from ${username}: ${text}`);
                await saveMessage('vk', chatId, text, username);
              });

              if (!process.env.VERCEL) {
                vk.updates.start().then(() => {
                  console.log('VK Long Polling started successfully on startup');
                  vkPollingStarted = true;
                  lastVkError = null;
                }).catch((error) => {
                  console.error('VK Long Polling failed to start on startup:', error);
                  vkPollingStarted = false;
                  if (error.code === 15 || String(error).includes('Code №15')) {
                     lastVkError = "Ошибка доступа (Code 15). Проверьте права токена: нужны 'manage' (Управление) и 'messages' (Сообщения). Включите Long Poll API в настройках группы.";
                  } else if (error.code === 38 || String(error).includes('Code №38')) {
                     lastVkError = "Неизвестное приложение (Code 38). Похоже, вы используете токен пользователя или неверный токен группы. Убедитесь, что это токен ГРУППЫ и в группе включен Long Poll API.";
                  } else {
                     lastVkError = error.message || String(error);
                  }
                });
              } else {
                console.log('VK initialized for Webhooks (Vercel mode)');
                vkPollingStarted = true; // Mark as active for UI
              }
          }

          // Initialize Telegram if token exists
          if (tokens.tg && !tgBot) {
            console.log('Found TG token for user', userDoc.id);
            tgBot = new Telegraf(tokens.tg);

            tgBot.on('text', async (ctx) => {
              const text = ctx.message.text;
              const chatId = ctx.chat.id.toString();
              const user = ctx.from;
              const username = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ''}`.trim();

              console.log(`Received TG message from ${username}: ${text}`);
              await saveMessage('tg', chatId, text, username);
            });

            if (!process.env.VERCEL) {
              tgBot.launch().then(() => {
                console.log('Telegram Bot started successfully');
                lastTgError = null;
              }).catch((err) => {
                console.error('Failed to start Telegram Bot:', err);
                if (String(err).includes('404') || String(err).includes('Not Found')) {
                  lastTgError = "Ошибка запуска (404). Неверный токен бота. Проверьте токен в @BotFather.";
                } else {
                  lastTgError = err.message || String(err);
                }
              });
            } else {
              console.log('Telegram initialized for Webhooks (Vercel mode)');
            }

            // Enable graceful stop
            process.once('SIGINT', () => tgBot?.stop('SIGINT'));
            process.once('SIGTERM', () => tgBot?.stop('SIGTERM'));
          }
          
          // If we found all tokens, we can stop (assuming single user usage mostly)
          if (vk && tgBot && wbTokenFound && ozonTokenFound && maxTokenFound) break;
        }
      }
      
      if (!vk) console.log('No VK token found on startup');
      if (!tgBot) console.log('No TG token found on startup');
      if (!wbTokenFound) console.log('No WB token found on startup');

    } catch (error) {
      console.error('Error initializing bots:', error);
    }
  };

  // Helper to update stats
  const updateStats = async (platform: 'tg' | 'vk' | 'max', chatId: string) => {
    // Get Moscow time (UTC+3)
    const date = new Date();
    const moscowTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
    const today = moscowTime.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const statsRef = doc(db, 'stats', today);
    
    try {
      await setDoc(statsRef, {
        [`${platform}_users`]: arrayUnion(chatId),
        date: today
      }, { merge: true });
      console.log(`Stats updated for ${platform}`);
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  };

  // Helper to save message
  const saveMessage = async (platform: 'tg' | 'vk' | 'max', chatId: string, text: string, username: string) => {
    try {
      const chatRef = doc(db, 'chats', `${platform}_${chatId}`);
      
      // Update or create chat metadata
      await setDoc(chatRef, {
        platform,
        chatId,
        username,
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        unreadCount: increment(1),
        messageCount: increment(1)
      }, { merge: true });

      // Add message to subcollection
      await addDoc(collection(db, 'chats', `${platform}_${chatId}`, 'messages'), {
        text,
        sender: 'user',
        timestamp: serverTimestamp()
      });

      await updateStats(platform, chatId);
      console.log(`Message saved from ${platform} user ${username}`);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  // API to send message from admin to user
  app.post('/api/messages/send', async (req, res) => {
    const { chatId, platform, text, userId } = req.body;
    
    if (!chatId || !platform || !text || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // Get tokens for the specific user
      const tokensRef = doc(db, 'users', userId, 'settings', 'tokens');
      const tokensSnap = await getDoc(tokensRef);
      const tokens = tokensSnap.data();

      if (platform === 'tg') {
        if (!tokens?.tg) {
          return res.status(400).json({ error: 'Telegram token not configured' });
        }
        await axios.post(`https://api.telegram.org/bot${tokens.tg}/sendMessage`, {
          chat_id: chatId,
          text: text
        });
      } else if (platform === 'vk') {
        if (!tokens?.vk) {
          return res.status(400).json({ error: 'VK token not configured' });
        }
        // VK API call would go here
        await axios.post('https://api.vk.com/method/messages.send', null, {
          params: {
            peer_id: chatId,
            message: text,
            random_id: Math.floor(Math.random() * 1000000),
            access_token: tokens.vk,
            v: '5.131'
          }
        });
      } else if (platform === 'max') {
        // MAX sending logic...
        console.log('MAX sending not implemented yet');
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // VK Callback API handler
  app.all('/api/vk/callback', async (req, res) => {
    console.log(`VK Callback received: ${req.method} request`);
    
    if (req.method === 'GET') {
      return res.send('Endpoint is reachable. Please configure this as a POST endpoint in VK.');
    }

    console.log('VK Callback body:', JSON.stringify(req.body));
    const { type, group_id, secret, object } = req.body;
    
    // 1. Verify secret (you'll need to add this to settings)
    console.log('VK Callback received:', type, group_id);

    if (type === 'confirmation') {
      // Return the confirmation string provided by VK in the settings
      console.log('Returning confirmation string: 6457f321');
      res.setHeader('Content-Type', 'text/plain');
      return res.send('6457f321'); 
    }
    
    if (type === 'message_new') {
      const { message } = object;
      const text = message.text || '';
      const chatId = message.peer_id.toString();
      
      // Save message
      await saveMessage('vk', chatId, text, `User ${chatId}`);
      return res.send('ok');
    }
    
    res.send('ok');
  });

  app.get('/api/bot/status', (req, res) => {
    res.json({ 
      vk: !!vk, 
      vkPolling: vkPollingStarted,
      tg: !!tgBot,
      wb: wbTokenFound,
      ozon: ozonTokenFound,
      max: maxTokenFound,
      lastVkError,
      lastTgError
    });
  });

  // Endpoint to restart/configure bots
  app.post('/api/bot/restart', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'UserId required' });

    try {
      const userDocRef = doc(db, 'users', userId);
      const docSnap = await getDoc(userDocRef);
      
      if (docSnap.exists()) {
        const tokens = docSnap.data().tokens || {};
        
        // Update flags
        tgTokenFound = !!tokens.tg;
        wbTokenFound = !!tokens.wb;
        ozonTokenFound = !!tokens.ozon;
        maxTokenFound = !!tokens.max;

        // Initialize VK
        if (tokens.vk) {
          if (vk) {
            try {
              await vk.updates.stop();
              console.log('Stopped previous VK instance');
            } catch (e) {
              console.error('Error stopping VK:', e);
            }
          }

          vk = new VK({ token: tokens.vk });
          
          // Re-attach listeners
          vk.updates.on('message_new', async (context) => {
            if (context.isOutbox) return;
            const text = context.text || '';
            const chatId = context.senderId.toString();
            let username = `User ${chatId}`;
            try {
              const [user] = await vk!.api.users.get({ user_ids: [context.senderId] });
              if (user) username = `${user.first_name} ${user.last_name}`;
            } catch (e) { console.error('Error fetching VK user info:', e); }
            
            console.log(`Received VK message from ${username}: ${text}`);
            await saveMessage('vk', chatId, text, username);
          });

          try {
            await vk.updates.start();
            console.log('VK Long Polling started successfully with new token');
            vkPollingStarted = true;
            lastVkError = null;
          } catch (error: any) {
            console.error('VK Long Polling failed to start:', error);
            vkPollingStarted = false;
            if (error.code === 15 || String(error).includes('Code №15')) {
               lastVkError = "Ошибка доступа (Code 15). Проверьте права токена: нужны 'manage' (Управление) и 'messages' (Сообщения). Включите Long Poll API в настройках группы.";
            } else if (error.code === 38 || String(error).includes('Code №38')) {
               lastVkError = "Неизвестное приложение (Code 38). Похоже, вы используете токен пользователя или неверный токен группы. Убедитесь, что это токен ГРУППЫ и в группе включен Long Poll API.";
            } else {
               lastVkError = error.message || String(error);
            }
          }
        } else {
          // If VK token removed, stop bot
          if (vk) {
             try { await vk.updates.stop(); } catch(e) {}
             vk = null;
             vkPollingStarted = false;
             lastVkError = null;
          }
        }

        // Initialize Telegram
        if (tokens.tg) {
          if (tgBot) {
            try {
              await tgBot.stop();
              console.log('Stopped previous TG instance');
            } catch (e) {
              console.error('Error stopping TG:', e);
            }
          }

          tgBot = new Telegraf(tokens.tg);

          tgBot.on('text', async (ctx) => {
            const text = ctx.message.text;
            const chatId = ctx.chat.id.toString();
            const user = ctx.from;
            const username = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ''}`.trim();

            console.log(`Received TG message from ${username}: ${text}`);
            await saveMessage('tg', chatId, text, username);
          });

          tgBot.launch().then(() => {
            console.log('Telegram Bot started successfully with new token');
            lastTgError = null;
          }).catch((err) => {
            console.error('Failed to start Telegram Bot:', err);
            if (String(err).includes('404') || String(err).includes('Not Found')) {
              lastTgError = "Ошибка запуска (404). Неверный токен бота. Проверьте токен в @BotFather.";
            } else {
              lastTgError = err.message || String(err);
            }
          });
        } else {
          if (tgBot) {
            try { tgBot.stop(); } catch (e) {}
            tgBot = null;
            lastTgError = null;
          }
        }
        
        res.json({ success: true, message: 'Bots reconfigured' });
      } else {
        res.status(404).json({ error: 'Tokens not found' });
      }
    } catch (error: any) {
      console.error('Error restarting bots:', error);
      return res.status(500).json({ 
        error: 'Failed to restart bots', 
        details: error.message || String(error) 
      });
    }
  });

  // Telegram Webhook (Optional, kept for testing)
  app.post('/api/webhook/tg', async (req, res) => {
    const { message } = req.body;
    if (message) {
      const chatId = message.chat.id.toString();
      const text = message.text || '';
      
      // Better username extraction
      const { first_name, last_name, username: tgUsername } = message.from;
      const fullName = [first_name, last_name].filter(Boolean).join(' ');
      const displayName = fullName || (tgUsername ? `@${tgUsername}` : `User ${chatId}`);
      const username = displayName;
      
      console.log(`Received TG message from ${username}: ${text}`);
      await saveMessage('tg', chatId, text, username);
    }
    res.json({ success: true });
  });

  // VK Webhook
  app.post('/api/webhook/vk', async (req, res) => {
    const { type, object, group_id, secret } = req.body;
    
    console.log('VK Webhook received:', type, group_id);

    if (type === 'confirmation') {
      // Verify secret if provided
      if (secret !== 'myom_secret_key_2026') {
        console.warn('Invalid secret key for VK confirmation');
        return res.status(403).send('Forbidden');
      }
      console.log('Returning confirmation string: 6457f321');
      res.setHeader('Content-Type', 'text/plain');
      return res.send('6457f321');
    }

    if (type === 'message_new') {
      const message = object.message;
      const chatId = message.peer_id.toString();
      const text = message.text || '';
      
      let username = `User ${chatId}`;
      
      // Try to fetch user info if VK instance is active
      if (vk) {
        try {
          const [user] = await vk.api.users.get({ user_ids: [message.from_id] });
          if (user) {
            username = `${user.first_name} ${user.last_name}`;
          }
        } catch (e) {
          console.error('Error fetching VK user info in webhook:', e);
        }
      }
      
      console.log(`Received VK message from ${username} (${chatId}): ${text}`);
      await saveMessage('vk', chatId, text, username);
      res.send('ok');
    } else {
      res.send('ok');
    }
  });

  // Max Webhook (Placeholder)
  app.post('/api/webhook/max', async (req, res) => {
    const { chatId, text, username } = req.body;
    if (chatId && text) {
      console.log(`Received Max message from ${username}: ${text}`);
      await saveMessage('max', chatId, text, username || 'Unknown');
    }
    res.json({ success: true });
  });

  // --- Vite Middleware for Development ---
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    // In production, serve static files from dist
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
      initBots();
    });
  } else {
    // On Vercel, we still need to init bots (fetch tokens) but we don't start long polling
    // We do it once when the instance starts
    initBots().catch(err => console.error('Error in initBots on Vercel:', err));
  }

  return app;
}

export const appPromise = startServer();
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
