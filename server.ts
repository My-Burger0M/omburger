import 'dotenv/config';
import express from 'express';
import cors from 'cors';
// import { createServer as createViteServer } from 'vite'; // Moved to dynamic import
import { db, auth } from './server-firebase';
import { collection, addDoc, doc, setDoc, updateDoc, increment, serverTimestamp, getDoc, getDocs, query, arrayUnion, arrayRemove, where } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { VK } from 'vk-io';
import { Telegraf } from 'telegraf';
import axios from 'axios';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- Firebase Auth for Server ---
  try {
    await signInAnonymously(auth);
    console.log('Server signed in to Firebase anonymously');
  } catch (error: any) {
    if (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed') {
      console.warn('\n⚠️ WARNING: Firebase Anonymous Auth failed.');
      console.warn('Reason: The operation is restricted (auth/admin-restricted-operation).');
      console.warn('To fix this:');
      console.warn('1. Go to Firebase Console -> Authentication -> Sign-in method');
      console.warn('2. Enable the "Anonymous" provider');
      console.warn('3. If using Identity Platform, ensure "Enable create (sign-up)" is checked');
      console.warn('4. Check API Key restrictions in Google Cloud Console (ensure no IP/Referrer blocks for this server)\n');
    } else {
      console.error('Error signing in to Firebase:', error);
    }
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

      // 1. Try to load from Database
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
                const messageId = context.id.toString();
                let username = `User ${chatId}`;
                try {
                  const [user] = await vk!.api.users.get({ user_ids: [context.senderId] });
                  if (user) username = `${user.first_name} ${user.last_name}`;
                } catch (e) { console.error('Error fetching VK user info:', e); }
                
                console.log(`Received VK message from ${username}: ${text}`);
                await saveMessage('vk', chatId, text, username, messageId);
                
                const payload = context.messagePayload?.ref || (text.startsWith('/start ') ? text.split(' ')[1] : null);
                await processScenario('vk', chatId, text, payload, userDoc.id);
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
          if (tokens.tg) {
            // Stop existing instance if it exists (even if we didn't create it in this loop, though we reset it at start)
            if (tgBot) {
                try {
                    console.log('Stopping previous Telegram bot instance...');
                    tgBot.stop();
                } catch (e) {
                    console.error('Error stopping previous TG bot:', e);
                }
                tgBot = null;
            }

            console.log('Found TG token for user', userDoc.id);
            tgBot = new Telegraf(tokens.tg);

            tgBot.start(async (ctx) => {
              const chatId = ctx.chat.id.toString();
              const payload = ctx.payload; // This is the 'source_google' in /start source_google
              
              if (payload) {
                console.log(`Deep link payload received: ${payload}`);
                await addTag('tg', chatId, payload);
                await logAction('tg', chatId, 'deep_link', { source: payload });
              }
              
              const user = ctx.from;
              const firstName = user.first_name || '';
              const lastName = user.last_name || '';
              const tgUsername = user.username ? `@${user.username}` : '';
              const displayName = [firstName, lastName].filter(Boolean).join(' ') || tgUsername || `User ${chatId}`;
              
              await saveMessage('tg', chatId, '/start', displayName, ctx.message.message_id.toString());
              await processScenario('tg', chatId, '/start', payload, userDoc.id);
            });

            tgBot.command('stats', async (ctx) => {
              // Basic stats command for admin
              const chatId = ctx.chat.id.toString();
              // Check if user is admin (you might want to check against a list of admin IDs)
              // For now, let's just return stats
              try {
                const chatsRef = collection(db, 'chats');
                const snapshot = await getDocs(chatsRef);
                const tagCounts: Record<string, number> = {};
                
                snapshot.forEach(doc => {
                  const data = doc.data();
                  if (data.tags && Array.isArray(data.tags)) {
                    data.tags.forEach(tag => {
                      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                  }
                });
                
                let statsMsg = '📊 Статистика по тегам:\n\n';
                if (Object.keys(tagCounts).length === 0) {
                  statsMsg += 'Нет тегов.';
                } else {
                  for (const [tag, count] of Object.entries(tagCounts)) {
                    statsMsg += `- ${tag}: ${count} чел.\n`;
                  }
                }
                
                await ctx.reply(statsMsg);
              } catch (e) {
                console.error('Error getting stats:', e);
                await ctx.reply('Ошибка получения статистики.');
              }
            });

            tgBot.on(['text', 'photo', 'video', 'sticker'], async (ctx) => {
              const message = ctx.message;
              const chatId = ctx.chat.id.toString();
              const messageId = message.message_id.toString();
              const user = ctx.from;
              
              const firstName = user.first_name || '';
              const lastName = user.last_name || '';
              const tgUsername = user.username ? `@${user.username}` : '';
              
              // Prefer "Bacardi Lemon" (First Last) over @username if available
              const displayName = [firstName, lastName].filter(Boolean).join(' ') || tgUsername || `User ${chatId}`;
              const username = displayName; // Use displayName as main identifier for UI

              let text = '';
              let mediaUrl = '';
              let mediaType = '';

              if ('text' in message) {
                text = message.text;
              } else if ('caption' in message) {
                text = message.caption || '';
              }

              if ('photo' in message) {
                // Get the largest photo
                const photo = message.photo[message.photo.length - 1];
                try {
                  const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                  mediaUrl = fileLink.href;
                  mediaType = 'photo';
                  if (!text) text = '[Фото]';
                } catch (e) {
                  console.error('Error fetching photo link:', e);
                }
              } else if ('video' in message) {
                try {
                  const fileLink = await ctx.telegram.getFileLink(message.video.file_id);
                  mediaUrl = fileLink.href;
                  mediaType = 'video';
                  if (!text) text = '[Видео]';
                } catch (e) {
                  console.error('Error fetching video link:', e);
                }
              } else if ('sticker' in message) {
                try {
                  // Stickers are tricky, they are usually .webp. 
                  // We can try to get the file link, but browsers might not display .webp easily in img tags without conversion?
                  // Modern browsers support webp.
                  const fileLink = await ctx.telegram.getFileLink(message.sticker.file_id);
                  mediaUrl = fileLink.href;
                  mediaType = 'photo'; // Treat as photo for simplicity
                  text = message.sticker.emoji || '[Стикер]';
                } catch (e) {
                  console.error('Error fetching sticker link:', e);
                }
              }

              // Try to get avatar (profile photos)
              let avatar = '';
              try {
                const photos = await ctx.telegram.getUserProfilePhotos(user.id, 0, 1);
                if (photos && photos.total_count > 0) {
                   const fileId = photos.photos[0][0].file_id;
                   const fileLink = await ctx.telegram.getFileLink(fileId);
                   avatar = fileLink.href;
                }
              } catch (e) {
                console.error('Error fetching TG avatar:', e);
              }

              console.log(`Received TG message from ${username}: ${text}`);
              await saveMessage('tg', chatId, text, username, messageId, avatar, displayName, mediaUrl, mediaType);
              await processScenario('tg', chatId, text, null, userDoc.id);
            });

            if (!process.env.VERCEL) {
              // Add delay to allow previous instance to die
              setTimeout(() => {
                  if (!tgBot) return;
                  tgBot.launch().then(() => {
                    console.log('Telegram Bot started successfully');
                    lastTgError = null;
                  }).catch((err) => {
                    console.error('Failed to start Telegram Bot:', err);
                    if (String(err).includes('409') || String(err).includes('Conflict')) {
                        lastTgError = "Конфликт (409). Запущен другой экземпляр бота. Попробуйте перезагрузить сервер.";
                    } else if (String(err).includes('404') || String(err).includes('Not Found')) {
                      lastTgError = "Ошибка запуска (404). Неверный токен бота. Проверьте токен в @BotFather.";
                    } else {
                      lastTgError = err.message || String(err);
                    }
                  });
              }, 3000); // Increased to 3 second delay
            } else {
              console.log('Telegram initialized for Webhooks (Vercel mode)');
            }
          }
          
          if (vk && tgBot && wbTokenFound && ozonTokenFound && maxTokenFound) break;
        }
      }

      // 2. Fallback to Environment Variables if not found in DB
      if (!vk && process.env.VK_TOKEN) {
        console.log('Initializing VK from Environment Variable');
        try {
          vk = new VK({ token: process.env.VK_TOKEN });
          
          // Optional group check
          vk.api.groups.getById({}).catch(() => {});

          vk.updates.on('message_new', async (context) => {
            if (context.isOutbox) return;
            const text = context.text || '';
            const chatId = context.senderId.toString();
            const messageId = context.id.toString();
            let username = `User ${chatId}`;
            try {
              const [user] = await vk!.api.users.get({ user_ids: [context.senderId] });
              if (user) username = `${user.first_name} ${user.last_name}`;
            } catch (e) { console.error('Error fetching VK user info:', e); }
            
            console.log(`Received VK message from ${username}: ${text}`);
            await saveMessage('vk', chatId, text, username, messageId);
          });

          if (!process.env.VERCEL) {
            vk.updates.start().then(() => {
              console.log('VK Long Polling started (Env Var)');
              vkPollingStarted = true;
            }).catch(e => {
              console.error('VK Start Error (Env Var):', e);
              lastVkError = e.message;
            });
          } else {
             console.log('VK initialized for Webhooks (Env Var, Vercel mode)');
             vkPollingStarted = true;
          }
        } catch (e: any) {
          console.error('Error initializing VK from Env:', e);
          lastVkError = e.message;
        }
      }

      if (!tgBot && process.env.TG_TOKEN) {
        console.log('Initializing TG from Environment Variable');
        try {
          tgBot = new Telegraf(process.env.TG_TOKEN);
          
          tgBot.start(async (ctx) => {
            const chatId = ctx.chat.id.toString();
            const payload = ctx.payload;
            if (payload) {
              await addTag('tg', chatId, payload);
              await logAction('tg', chatId, 'deep_link', { source: payload });
            }
            const user = ctx.from;
            const username = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ''}`.trim();
            await saveMessage('tg', chatId, '/start', username, ctx.message.message_id.toString());
            // Note: processScenario requires userId, which we don't have for Env Var fallback easily unless we hardcode.
            // We will skip processScenario for Env Var fallback as it's meant for DB users.
          });

          tgBot.command('stats', async (ctx) => {
            try {
              const snapshot = await getDocs(collection(db, 'chats'));
              const tagCounts: Record<string, number> = {};
              snapshot.forEach(doc => {
                const data = doc.data();
                if (data.tags && Array.isArray(data.tags)) {
                  data.tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
                }
              });
              let statsMsg = '📊 Статистика по тегам:\n\n';
              for (const [tag, count] of Object.entries(tagCounts)) { statsMsg += `- ${tag}: ${count} чел.\n`; }
              await ctx.reply(statsMsg || 'Нет тегов.');
            } catch (e) { await ctx.reply('Ошибка'); }
          });

          tgBot.on(['text', 'photo', 'video', 'sticker'], async (ctx) => {
            const message = ctx.message;
            const chatId = ctx.chat.id.toString();
            const user = ctx.from;
            const username = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ''}`.trim();
            
            let text = '';
            let mediaUrl = '';
            let mediaType = '';

            if ('text' in message) text = message.text;
            else if ('caption' in message) text = message.caption || '';

            if ('photo' in message) {
              const photo = message.photo[message.photo.length - 1];
              try {
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                mediaUrl = fileLink.href;
                mediaType = 'photo';
                if (!text) text = '[Фото]';
              } catch (e) {}
            } else if ('video' in message) {
              try {
                const fileLink = await ctx.telegram.getFileLink(message.video.file_id);
                mediaUrl = fileLink.href;
                mediaType = 'video';
                if (!text) text = '[Видео]';
              } catch (e) {}
            } else if ('sticker' in message) {
              try {
                const fileLink = await ctx.telegram.getFileLink(message.sticker.file_id);
                mediaUrl = fileLink.href;
                mediaType = 'photo';
                text = message.sticker.emoji || '[Стикер]';
              } catch (e) {}
            }

            console.log(`Received TG message from ${username}: ${text}`);
            await saveMessage('tg', chatId, text, username, undefined, undefined, undefined, mediaUrl, mediaType);
          });

          if (!process.env.VERCEL) {
            tgBot.launch().then(() => console.log('TG Bot started (Env Var)')).catch(e => {
              console.error('TG Start Error (Env Var):', e);
              lastTgError = e.message;
            });
          } else {
            console.log('TG initialized for Webhooks (Env Var, Vercel mode)');
          }
        } catch (e: any) {
          console.error('Error initializing TG from Env:', e);
          lastTgError = e.message;
        }
      }
      
      if (!vk) console.log('No VK token found (DB or Env)');
      if (!tgBot) console.log('No TG token found (DB or Env)');

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

  // Helper to add tag
  const addTag = async (platform: string, chatId: string, tag: string) => {
    try {
      const chatRef = doc(db, 'chats', `${platform}_${chatId}`);
      await setDoc(chatRef, { tags: arrayUnion(tag) }, { merge: true });
      console.log(`Added tag ${tag} to ${platform}_${chatId}`);
    } catch (e) {
      console.error('Error adding tag:', e);
    }
  };

  // Helper to remove tag
  const removeTag = async (platform: string, chatId: string, tag: string) => {
    try {
      const chatRef = doc(db, 'chats', `${platform}_${chatId}`);
      await setDoc(chatRef, { tags: arrayRemove(tag) }, { merge: true });
      console.log(`Removed tag ${tag} from ${platform}_${chatId}`);
    } catch (e) {
      console.error('Error removing tag:', e);
    }
  };

  // Helper to log action
  const logAction = async (platform: string, chatId: string, action: string, details: any = {}) => {
    try {
      const logRef = collection(db, 'chats', `${platform}_${chatId}`, 'logs');
      await addDoc(logRef, {
        action,
        ...details,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Error logging action:', e);
    }
  };

  // --- Scenario Engine ---
  const runFlow = async (userId: string, platform: string, chatId: string, startNodeId: string, nodes: any[], edges: any[]) => {
    let currentNodeId: string | null = startNodeId;
    let visited = new Set<string>();

    while (currentNodeId) {
      if (visited.has(currentNodeId)) break; // Prevent infinite loops
      visited.add(currentNodeId);

      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      if (node.type === 'message') {
        const { text, mediaUrl, delay, keyboard } = node.data;
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
        
        let mediaType = undefined;
        if (mediaUrl) {
          mediaType = mediaUrl.match(/\.(mp4|mov)$/i) ? 'video' : 'photo';
        }

        // Send message
        try {
          await sendMessageInternal({
            chatId,
            platform,
            text,
            userId,
            mediaUrl,
            mediaType,
            keyboard: keyboard && keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
          });

          // Log to chat history
          await addDoc(collection(db, 'chats', `${platform}_${chatId}`, 'messages'), {
            text: text || '',
            sender: 'admin',
            timestamp: serverTimestamp(),
            mediaUrl: mediaUrl || null,
            mediaType: mediaType || null,
            keyboard: keyboard && keyboard.length > 0 ? { inline_keyboard: keyboard } : null
          });

          await updateDoc(doc(db, 'chats', `${platform}_${chatId}`), {
            lastMessage: mediaUrl ? `[Медиа] ${text}` : text,
            lastMessageAt: serverTimestamp()
          });
        } catch (e) {
          console.error('Error sending scenario message:', e);
        }
      } else if (node.type === 'action') {
        const actions = node.data.actions || [];
        for (const act of actions) {
          if (act.type === 'add_tag' && act.tag) {
            await addTag(platform, chatId, act.tag);
          } else if (act.type === 'remove_tag' && act.tag) {
            await removeTag(platform, chatId, act.tag);
          }
        }
      } else if (node.type === 'condition') {
        const tagToCheck = node.data.tag;
        const chatDoc = await getDoc(doc(db, 'chats', `${platform}_${chatId}`));
        const chatData = chatDoc.data() || {};
        const hasTag = chatData.tags && chatData.tags.includes(tagToCheck);
        
        const edge = edges.find(e => e.source === currentNodeId && e.sourceHandle === (hasTag ? 'true' : 'false'));
        currentNodeId = edge ? edge.target : null;
        continue;
      } else if (node.type === 'trigger') {
        if (node.data.tag) {
          await addTag(platform, chatId, node.data.tag);
        }
      }

      // Find next node
      const edge = edges.find(e => e.source === currentNodeId && (!e.sourceHandle || e.sourceHandle === 'source' || e.sourceHandle === 'bottom'));
      currentNodeId = edge ? edge.target : null;
    }
  };

  const processScenario = async (platform: string, chatId: string, text: string, payload: string | null, userId: string) => {
    try {
      const scenarioRef = doc(db, 'users', userId, 'settings', `scenario_${platform}`);
      const scenarioSnap = await getDoc(scenarioRef);
      if (!scenarioSnap.exists()) return;
      
      const scenario = scenarioSnap.data();
      if (!scenario.isActive) return;

      const nodes = scenario.nodes || [];
      const edges = scenario.edges || [];

      let startNodeId = null;

      if (payload) {
        const triggerNode = nodes.find((n: any) => n.type === 'trigger' && n.data.refCode === payload);
        if (triggerNode) {
          startNodeId = triggerNode.id;
        }
      }

      if (!startNodeId && (text === '/start' || text.toLowerCase() === 'начать')) {
        const startNode = nodes.find((n: any) => n.type === 'start');
        if (startNode) {
          startNodeId = startNode.id;
        }
      }

      if (startNodeId) {
        runFlow(userId, platform, chatId, startNodeId, nodes, edges).catch(e => console.error('Flow error:', e));
      }
    } catch (e) {
      console.error('Error processing scenario:', e);
    }
  };

  // Helper to save message
  const saveMessage = async (platform: 'tg' | 'vk' | 'max', chatId: string, text: string, username: string, messageId?: string, avatar?: string, displayName?: string, mediaUrl?: string, mediaType?: string) => {
    try {
      const chatRef = doc(db, 'chats', `${platform}_${chatId}`);
      
      // Check for duplicates if messageId is provided
      if (messageId) {
        // ... (existing comments)
      }

      const msgDocId = messageId ? `${platform}_${chatId}_${messageId}` : undefined;
      const msgRef = msgDocId 
        ? doc(db, 'chats', `${platform}_${chatId}`, 'messages', msgDocId)
        : doc(collection(db, 'chats', `${platform}_${chatId}`, 'messages')); // Auto-ID if no messageId

      // Check if it exists (idempotency)
      if (msgDocId) {
         const existingDoc = await getDoc(msgRef);
         if (existingDoc.exists()) {
             console.log(`Duplicate message ignored: ${msgDocId}`);
             return;
         }
      }

      // Update or create chat metadata
      const chatUpdateData: any = {
        platform,
        chatId,
        username, // This is now the "Display Name" effectively
        lastMessage: mediaUrl ? `[${mediaType === 'photo' ? 'Фото' : 'Видео'}] ${text}` : text,
        lastMessageAt: serverTimestamp(),
        unreadCount: increment(1),
        messageCount: increment(1)
      };
      
      if (avatar) chatUpdateData.avatar = avatar;
      if (displayName) chatUpdateData.displayName = displayName;

      await setDoc(chatRef, chatUpdateData, { merge: true });

      // Add message to subcollection
      const messageData: any = {
        text,
        sender: 'user',
        timestamp: serverTimestamp()
      };
      if (messageId) messageData.externalId = messageId;
      if (mediaUrl) messageData.mediaUrl = mediaUrl;
      if (mediaType) messageData.mediaType = mediaType;

      await setDoc(msgRef, messageData);

      await updateStats(platform, chatId);
      console.log(`Message saved from ${platform} user ${username}`);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  // Internal Send Function
  const sendMessageInternal = async ({ chatId, platform, text, userId, mediaUrl, mediaType, keyboard }: any) => {
      // Get tokens for the specific user
      const tokensRef = doc(db, 'users', userId, 'settings', 'tokens');
      const tokensSnap = await getDoc(tokensRef);
      const tokens = tokensSnap.data();

      if (platform === 'tg') {
        if (!tokens?.tg) throw new Error('Telegram token not configured');
        
        const bot = new Telegraf(tokens.tg);
        const extras: any = {};
        if (keyboard) extras.reply_markup = keyboard;

        if (mediaUrl && mediaType === 'photo') {
            await bot.telegram.sendPhoto(chatId, mediaUrl, { caption: text, ...extras });
        } else if (mediaUrl && mediaType === 'video') {
            await bot.telegram.sendVideo(chatId, mediaUrl, { caption: text, ...extras });
        } else {
            await bot.telegram.sendMessage(chatId, text || ' ', extras);
        }

      } else if (platform === 'vk') {
        if (!tokens?.vk) throw new Error('VK token not configured');
        
        let messageText = text || '';
        if (mediaUrl) messageText += `\n\n${mediaUrl}`;

        const params: any = {
            peer_id: Number(chatId),
            message: messageText,
            random_id: Math.floor(Math.random() * 1000000)
        };

        if (keyboard) params.keyboard = JSON.stringify(keyboard);

        if (vk) {
             await vk.api.messages.send(params);
        } else {
            await axios.post('https://api.vk.com/method/messages.send', null, {
            params: { ...params, access_token: tokens.vk, v: '5.131' }
            });
        }
      }
  };

  // --- Scheduler Logic ---
  const checkScheduledMessages = async () => {
      try {
          const now = new Date();
          // Query only by status to avoid composite index requirement
          const q = query(
              collection(db, 'scheduled_messages'), 
              where('status', '==', 'pending')
          );
          
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) return;
          
          // Filter by date in memory
          const messagesToSend = snapshot.docs.filter(doc => {
              const data = doc.data();
              return data.scheduledAt && data.scheduledAt.toDate() <= now;
          });

          if (messagesToSend.length === 0) return;

          console.log(`Processing ${messagesToSend.length} scheduled messages...`);
          
          for (const docSnap of messagesToSend) {
              const msg = docSnap.data();
              const { chatId, platform, text, userId, mediaUrl, mediaType, keyboard } = msg;
              
              try {
                  await sendMessageInternal({ chatId, platform, text, userId, mediaUrl, mediaType, keyboard });
                  
                  await updateDoc(docSnap.ref, { status: 'sent', sentAt: serverTimestamp() });
                  
                  // Log to chat history
                  const chatDocId = `${platform}_${chatId}`;
                  await addDoc(collection(db, 'chats', chatDocId, 'messages'), {
                    text: text || '',
                    sender: 'admin',
                    timestamp: serverTimestamp(),
                    mediaUrl: mediaUrl || null,
                    mediaType: mediaType || null,
                    keyboard: keyboard || null
                  });

                  await updateDoc(doc(db, 'chats', chatDocId), {
                    lastMessage: mediaUrl ? `[${mediaType === 'photo' ? 'Фото' : 'Видео'}] ${text}` : text,
                    lastMessageAt: serverTimestamp()
                  });
                  
                  console.log(`Scheduled message sent to ${chatId}`);
              } catch (err) {
                  console.error(`Failed to send scheduled message ${docSnap.id}:`, err);
                  await updateDoc(docSnap.ref, { status: 'failed', error: String(err) });
              }
          }
      } catch (error) {
          console.error('Error checking scheduled messages:', error);
      }
  };

  // Start Scheduler Interval (every 60 seconds)
  if (!process.env.VERCEL) {
      setInterval(checkScheduledMessages, 60 * 1000);
      console.log('Scheduler started (60s interval)');
  }

  // API to send message from admin to user
  app.post('/api/messages/send', async (req, res) => {
    const { chatId, platform, text, userId, mediaUrl, mediaType, keyboard } = req.body;
    
    if (!chatId || !platform || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      await sendMessageInternal({ chatId, platform, text, userId, mediaUrl, mediaType, keyboard });
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // API to broadcast by tag
  app.post('/api/broadcast/tag', async (req, res) => {
    const { tag, text, userId, mediaUrl, mediaType, keyboard } = req.body;
    
    if (!tag || !userId) {
      return res.status(400).json({ error: 'Missing tag or userId' });
    }

    try {
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('tags', 'array-contains', tag));
      const snapshot = await getDocs(q);
      
      let sentCount = 0;
      
      for (const docSnap of snapshot.docs) {
        const chatData = docSnap.data();
        const { chatId, platform } = chatData;
        
        if (chatId && platform) {
          try {
            await sendMessageInternal({ chatId, platform, text, userId, mediaUrl, mediaType, keyboard });
            
            // Log to chat history
            await addDoc(collection(db, 'chats', docSnap.id, 'messages'), {
              text: text || '',
              sender: 'admin',
              timestamp: serverTimestamp(),
              mediaUrl: mediaUrl || null,
              mediaType: mediaType || null,
              keyboard: keyboard || null
            });

            await updateDoc(docSnap.ref, {
              lastMessage: mediaUrl ? `[${mediaType === 'photo' ? 'Фото' : 'Видео'}] ${text}` : text,
              lastMessageAt: serverTimestamp()
            });
            
            sentCount++;
          } catch (e) {
            console.error(`Failed to broadcast to ${platform}_${chatId}:`, e);
          }
        }
      }
      
      res.json({ success: true, sentCount });
    } catch (error: any) {
      console.error('Error broadcasting by tag:', error);
      res.status(500).json({ error: 'Failed to broadcast' });
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
      const messageId = message.id.toString();
      
      // Save message
      await saveMessage('vk', chatId, text, `User ${chatId}`, messageId);
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
          
          // Optional group check
          vk.api.groups.getById({}).catch(() => {});

          // Re-attach listeners
          vk.updates.on('message_new', async (context) => {
            if (context.isOutbox) return;
            const text = context.text || '';
            const chatId = context.senderId.toString();
            const messageId = context.id.toString();
            let username = `User ${chatId}`;
            try {
              const [user] = await vk!.api.users.get({ user_ids: [context.senderId] });
              if (user) username = `${user.first_name} ${user.last_name}`;
            } catch (e) { console.error('Error fetching VK user info:', e); }
            
            console.log(`Received VK message from ${username}: ${text}`);
            await saveMessage('vk', chatId, text, username, messageId);
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
      const secretKey = process.env.VK_SECRET_KEY || 'myom_secret_key_2026';
      if (secret !== secretKey) {
        console.warn('Invalid secret key for VK confirmation');
        return res.status(403).send('Forbidden');
      }
      const confirmationCode = process.env.VK_CONFIRMATION_CODE || '36a42e9f';
      console.log(`Returning confirmation string: ${confirmationCode}`);
      res.setHeader('Content-Type', 'text/plain');
      return res.send(confirmationCode);
    }

    if (type === 'message_new') {
      const message = object.message;
      const chatId = message.peer_id.toString();
      const text = message.text || '';
      const messageId = message.id.toString();
      
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
      await saveMessage('vk', chatId, text, username, messageId);
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
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware initialized');
    } catch (e) {
      console.error('Failed to load Vite:', e);
    }
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
