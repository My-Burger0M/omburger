import { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  Panel,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  useUpdateNodeInternals,
  useEdges
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Play, Plus, Trash2, Settings, MessageSquare, Tag, Zap, Link as LinkIcon, Image as ImageIcon, Clock, Power, AlertCircle, Maximize, Minimize, CheckCircle2, Video, FileText } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

// Custom Edge
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  sourceHandleId,
}: any) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isButtonEdge = sourceHandleId && sourceHandleId !== 'main' && sourceHandleId !== 'timeout';
  const edgeStyle = {
    ...style,
    stroke: isButtonEdge ? '#22c55e' : (style.stroke || '#3b82f6'),
    strokeWidth: selected ? 3 : 2,
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
              onClick={(event) => {
                event.stopPropagation();
                setEdges((edges) => edges.filter((e) => e.id !== id));
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// Custom Nodes
const StartNode = ({ data }: { data: any }) => (
  <div className="bg-[#9333ea] border-2 border-purple-400 rounded-xl px-4 py-2 shadow-lg shadow-purple-900/40 text-white font-bold text-sm flex items-center gap-2">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-white" />
    <Play size={16} /> {data.label || 'Старт (/start)'}
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-white" />
  </div>
);

const MessageNode = ({ id, data }: { id: string, data: any }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();

  useEffect(() => {
    updateNodeInternals(id);
  }, [data.keyboard, data.text, data.mediaUrl, id, updateNodeInternals]);

  const isHandleConnected = (handleId: string) => {
    return edges.some(edge => edge.source === id && edge.sourceHandle === handleId);
  };

  return (
    <div className="bg-[#1a1a1a] border border-blue-500/50 rounded-xl w-64 shadow-lg shadow-blue-900/20 relative">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500" />
      <div className="bg-blue-500/10 p-2 rounded-t-xl border-b border-blue-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-blue-400" />
          <span className="text-xs font-bold text-blue-100">{data.label || 'Сообщение'}</span>
        </div>
        {data.delay > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded">
            <Clock size={10} /> {data.delay}с
          </div>
        )}
      </div>
      <div className="p-3 text-xs text-gray-400 flex flex-col gap-2">
        {data.mediaUrl && (
          <div className="h-24 bg-[#222] rounded flex items-center justify-center border border-white/5 overflow-hidden relative group">
            {/\.(mp4|webm|ogg|mov)$/i.test(data.mediaUrl) ? (
              <video src={data.mediaUrl || undefined} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" muted loop playsInline autoPlay />
            ) : /\.(jpeg|jpg|gif|png|webp)$/i.test(data.mediaUrl) || (data.mediaUrl.startsWith('http') && !data.mediaUrl.includes('vk.com')) ? (
              <>
                <img 
                  src={data.mediaUrl || undefined} 
                  alt="media" 
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity absolute inset-0 z-10" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }} 
                />
                <div className="flex flex-col items-center gap-1 text-gray-500 z-0">
                  <ImageIcon size={20} />
                  <span className="text-[10px]">Медиа</span>
                </div>
              </>
            ) : data.mediaUrl.includes('video') ? (
              <div className="flex flex-col items-center gap-1 text-gray-500">
                <Video size={20} />
                <span className="text-[10px]">VK Видео</span>
              </div>
            ) : data.mediaUrl.includes('doc') ? (
              <div className="flex flex-col items-center gap-1 text-gray-500">
                <FileText size={20} />
                <span className="text-[10px]">VK Документ</span>
              </div>
            ) : data.mediaUrl.includes('photo') ? (
              <div className="flex flex-col items-center gap-1 text-gray-500">
                <ImageIcon size={20} />
                <span className="text-[10px]">VK Фото</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-gray-500">
                <ImageIcon size={20} />
                <span className="text-[10px]">Медиа</span>
              </div>
            )}
          </div>
        )}
        <div className="truncate whitespace-pre-wrap max-h-20 overflow-hidden">{data.text || 'Нет текста...'}</div>
        {data.keyboard && data.keyboard.length > 0 && (
          <div className="flex flex-col gap-3 mt-2">
            {data.keyboard.map((row: any[], i: number) => (
              <div key={i} className="flex gap-2 relative">
                {row.map((btn: any, j: number) => (
                  <div key={btn.id || j} className="flex-1 relative flex flex-col items-center">
                    <div 
                      className="w-full text-center text-[10px] py-1.5 rounded text-gray-200 truncate px-1 border border-white/10 shadow-sm" 
                      style={{ backgroundColor: btn.color === 'positive' ? '#16a34a' : btn.color === 'negative' ? '#dc2626' : btn.color === 'primary' ? '#2563eb' : '#333' }}
                      title={btn.text}
                    >
                      {btn.text}
                    </div>
                    {btn.type !== 'url' && (
                      <Handle
                        type="source"
                        position={Position.Bottom}
                        id={btn.id || `btn_${i}_${j}`}
                        className={`w-3 h-3 border-2 border-[#1a1a1a] hover:scale-125 transition-transform z-10 ${isHandleConnected(btn.id || `btn_${i}_${j}`) ? 'bg-green-500' : 'bg-yellow-400'}`}
                        style={{ bottom: -6 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="main" className="w-3 h-3 bg-blue-500" />
      {/* Timeout Handle */}
      {data.timeout > 0 && (
        <Handle 
          type="source" 
          position={Position.Right} 
          id="timeout" 
          className="w-3 h-3 bg-red-500" 
          title={`Таймаут: ${data.timeout} мин`}
        />
      )}
    </div>
  );
};

const TriggerNode = ({ data }: { data: any }) => (
  <div className="bg-[#1a1a1a] border border-purple-500/50 rounded-xl w-64 shadow-lg shadow-purple-900/20">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-purple-500" />
    <div className="bg-purple-500/10 p-2 rounded-t-xl border-b border-purple-500/20 flex items-center gap-2">
      <LinkIcon size={14} className="text-purple-400" />
      <span className="text-xs font-bold text-purple-100">{data.label || 'Вход по ссылке'}</span>
    </div>
    <div className="p-3 text-xs text-gray-400 flex flex-col gap-2">
      <div className="truncate text-purple-300 font-mono text-[9px] bg-purple-500/10 p-1.5 rounded select-all" title={data.link || 'Ссылка не указана'}>
        {data.link || 'Вставьте ссылку в настройках'}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-gray-500">Тег:</span>
        {data.tag ? (
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
            style={{ backgroundColor: data.tagColor || '#6b7280' }}
          >
            {data.tag}
          </span>
        ) : (
          <span className="text-gray-600">нет</span>
        )}
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-purple-500" />
  </div>
);

const CommandNode = ({ data }: { data: any }) => (
  <div className="bg-[#1a1a1a] border border-pink-500/50 rounded-xl w-56 shadow-lg shadow-pink-900/20">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-pink-500" />
    <div className="bg-pink-500/10 p-2 rounded-t-xl border-b border-pink-500/20 flex items-center gap-2">
      <MessageSquare size={14} className="text-pink-400" />
      <span className="text-xs font-bold text-pink-100">{data.label || 'Команда'}</span>
    </div>
    <div className="p-3 text-xs text-gray-400 flex flex-col gap-1">
      <div className="truncate text-pink-300 font-mono text-[12px] bg-pink-500/10 p-1 rounded text-center">
        {data.command || '/command'}
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-pink-500" />
  </div>
);

const ConditionNode = ({ data }: { data: any }) => (
  <div className="bg-[#1a1a1a] border border-orange-500/50 rounded-xl w-56 shadow-lg shadow-orange-900/20">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-orange-500" />
    <div className="bg-orange-500/10 p-2 rounded-t-xl border-b border-orange-500/20 flex items-center gap-2">
      <AlertCircle size={14} className="text-orange-400" />
      <span className="text-xs font-bold text-orange-100">{data.label || 'Проверка подписки'}</span>
    </div>
    <div className="p-3 text-xs text-gray-400 flex flex-col gap-2">
      <div className="text-[10px] text-orange-300 italic leading-tight text-center mb-1">
        Подключайте к инлайн-кнопке (напр. "Я подписался"), иначе проверка сработает мгновенно.
      </div>
      <div className="truncate text-blue-300 font-mono text-[10px] bg-blue-500/10 p-1.5 rounded text-center">
        {data.tgGroupUsername ? `TG: ${data.tgGroupUsername}` : 'TG: Не указана'}
      </div>
      <div className="truncate text-blue-400 font-mono text-[10px] bg-blue-600/10 p-1.5 rounded text-center">
        {data.vkGroupUsername ? `VK: ${data.vkGroupUsername}` : 'VK: Не указана'}
      </div>
      <div className="flex justify-between mt-2 px-2">
        <span className="text-[10px] text-green-400 font-bold">Да</span>
        <span className="text-[10px] text-red-400 font-bold">Нет</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} id="true" className="w-3 h-3 bg-green-500" style={{ left: '25%' }} />
    <Handle type="source" position={Position.Bottom} id="false" className="w-3 h-3 bg-red-500" style={{ left: '75%' }} />
  </div>
);

const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  trigger: TriggerNode,
  command: CommandNode,
  condition: ConditionNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'start',
    data: { label: 'Старт (/start)' },
    position: { x: 250, y: 50 },
  },
];

const initialEdges: Edge[] = [];

export default function BotScenarios() {
  const { currentUser } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [botActive, setBotActive] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string, message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (title: string, message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ title, message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [selectedPlatform, setSelectedPlatform] = useState<'tg' | 'vk' | 'max'>('tg');

  const deserializeFromFirestore = (obj: any): any => {
    if (obj && typeof obj.toDate === 'function') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => deserializeFromFirestore(item));
    } else if (obj !== null && typeof obj === 'object') {
      if (obj._isNestedArray && Array.isArray(obj.items)) {
        return deserializeFromFirestore(obj.items);
      }
      const newObj: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = deserializeFromFirestore(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  };

  useEffect(() => {
    const loadScenario = async () => {
      if (!currentUser) return;
      try {
        const docRef = doc(db, 'users', currentUser.uid, 'settings', `scenario_${selectedPlatform}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          let loadedNodes = deserializeFromFirestore(data.nodes || (selectedPlatform === 'vk' ? [] : initialNodes));
          
          if (selectedPlatform === 'vk') {
            loadedNodes = loadedNodes.filter((n: any) => n.type !== 'start');
          }

          // Ensure platform is set for trigger nodes and normalize keyboard
          const updatedNodes = loadedNodes.map((n: any) => {
            let kb = n.data.keyboard || [];
            // Robust deserialization: ensure it's an array of arrays for the UI
            kb = kb.map((row: any, i: number) => {
              const processButton = (b: any, j: number) => ({...b, id: b.id || `btn_${i}_${j}`});
              if (Array.isArray(row)) return row.map(processButton);
              if (row && row.buttons && Array.isArray(row.buttons)) return row.buttons.map(processButton);
              return [];
            });
            return {
              ...n,
              data: { ...n.data, platform: selectedPlatform, keyboard: kb }
            };
          });
          setNodes(updatedNodes);
          let loadedEdges = deserializeFromFirestore(data.edges || initialEdges);
          if (selectedPlatform === 'vk') {
            loadedEdges = loadedEdges.filter((e: any) => updatedNodes.some((n: any) => n.id === e.source) && updatedNodes.some((n: any) => n.id === e.target));
          }
          const updatedEdges = loadedEdges.map((e: any) => {
            const sourceNode = updatedNodes.find((n: any) => n.id === e.source);
            if (sourceNode && sourceNode.type === 'message' && !e.sourceHandle) {
              return { ...e, sourceHandle: 'main' };
            }
            return e;
          });
          setEdges(updatedEdges);
          setBotActive(data.isActive || false);
        } else {
          setNodes(selectedPlatform === 'vk' ? [] : initialNodes);
          setEdges(initialEdges);
          setBotActive(false);
        }
      } catch (error) {
        console.error("Error loading scenario:", error);
      }
    };
    loadScenario();
  }, [currentUser, selectedPlatform, setNodes, setEdges]);

  const sanitizeForFirestore = (obj: any): any => {
    if (Array.isArray(obj)) {
      // If it's an array, check if any of its elements are arrays
      const hasNestedArray = obj.some(item => Array.isArray(item));
      if (hasNestedArray) {
        // Convert array of arrays to array of objects
        return obj.map((item, index) => {
          if (Array.isArray(item)) {
            return { _isNestedArray: true, items: sanitizeForFirestore(item) };
          }
          return sanitizeForFirestore(item);
        });
      }
      return obj.map(item => sanitizeForFirestore(item));
    } else if (obj !== null && typeof obj === 'object') {
      const newObj: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Skip undefined values as Firestore doesn't like them
          if (obj[key] !== undefined) {
            newObj[key] = sanitizeForFirestore(obj[key]);
          }
        }
      }
      return newObj;
    }
    return obj;
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, 'users', currentUser.uid, 'settings', `scenario_${selectedPlatform}`);
      
      // Serialize keyboards to avoid nested array errors in Firestore
      const serializedNodes = nodes.map(node => {
        if (node.data.keyboard && Array.isArray(node.data.keyboard)) {
          return {
            ...node,
            data: {
              ...node.data,
              keyboard: node.data.keyboard.map(row => ({ buttons: Array.isArray(row) ? row : (row.buttons || []) }))
            }
          };
        }
        return node;
      });

      const sanitizedNodes = sanitizeForFirestore(serializedNodes);
      const sanitizedEdges = sanitizeForFirestore(edges);

      await setDoc(docRef, {
        nodes: sanitizedNodes,
        edges: sanitizedEdges,
        isActive: botActive
      }, { merge: true });
      showToast('Успех', 'Сценарий успешно сохранен!');
    } catch (error) {
      console.error("Error saving scenario:", error);
      showToast('Ошибка', 'Ошибка при сохранении. Проверьте консоль для деталей.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    const newState = !botActive;
    setBotActive(newState);
    if (!currentUser) return;
    const docRef = doc(db, 'users', currentUser.uid, 'settings', `scenario_${selectedPlatform}`);
    await setDoc(docRef, { isActive: newState }, { merge: true });
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'custom' }, eds)),
    [setEdges],
  );

  const addNode = (type: 'message' | 'trigger' | 'command' | 'condition') => {
    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: type,
      data: { 
        label: type === 'message' ? 'Сообщение' : type === 'trigger' ? 'Вход по ссылке' : type === 'command' ? 'Команда' : 'Проверка подписки',
        type,
        text: '',
        mediaUrl: '',
        delay: 0,
        timeout: 0,
        tag: '',
        tagColor: type === 'trigger' ? '#3b82f6' : '',
        link: type === 'trigger' ? '' : '',
        command: type === 'command' ? '/privet' : '',
        groupUsername: type === 'condition' ? 'https://t.me/om_esthetic' : '',
        keyboard: [],
        platform: selectedPlatform
      },
      position: { x: Math.random() * 300 + 100, y: Math.random() * 300 + 100 }
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNode(node);
  };

  const updateNodeData = (key: string, value: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          return {
            ...node,
            data: {
              ...node.data,
              [key]: value,
            },
          };
        }
        return node;
      })
    );
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, [key]: value } } : null);
  };

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-[#0f0f0f] p-4' : 'h-[calc(100vh-6rem)]'}`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl md:text-2xl font-bold text-white">Сценарии ботов</h1>
          <select 
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value as any)}
            className="bg-[#1a1a1a] border border-white/10 rounded-xl px-3 md:px-4 py-2 text-sm text-white outline-none"
          >
            <option value="tg">Telegram</option>
            <option value="vk">ВКонтакте</option>
            <option value="max">MAX</option>
          </select>

          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-1.5">
            <span className="text-sm text-gray-400">Статус:</span>
            <button 
              onClick={handleToggleActive}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${botActive ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${botActive ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${botActive ? 'text-green-400' : 'text-gray-500'}`}>
              {botActive ? 'Работает' : 'Остановлен'}
            </span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {launchError && (
            <div className="text-red-400 text-xs flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20 w-full md:w-auto mb-2 md:mb-0">
              <AlertCircle size={12} className="shrink-0" /> <span className="truncate">{launchError}</span>
            </div>
          )}
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="bg-[#1a1a1a] hover:bg-[#222] text-white p-2 rounded-xl border border-white/10 transition-colors hidden md:block"
            title={isFullscreen ? "Свернуть" : "На весь экран"}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 md:flex-none justify-center bg-[#1a1a1a] hover:bg-[#222] text-white px-4 py-2 rounded-xl flex items-center gap-2 border border-white/10 transition-colors disabled:opacity-50"
          >
            <Save size={16} /> {isSaving ? '...' : 'Сохранить'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'custom' }}
            fitView
            theme="dark"
          >
            <Background color="#333" gap={16} />
            <Controls className="bg-[#1a1a1a] border-white/10 fill-white" />
            <MiniMap 
              nodeColor={(n) => {
                if (n.type === 'start') return '#9333ea';
                if (n.type === 'trigger') return '#a855f7';
                if (n.type === 'command') return '#ec4899';
                if (n.type === 'message') return '#3b82f6';
                if (n.type === 'action') return '#22c55e';
                if (n.type === 'condition') return '#eab308';
                return '#333';
              }}
              maskColor="rgba(0,0,0,0.7)"
              className="bg-[#1a1a1a]"
            />
            <Panel position="top-left" className="bg-[#1a1a1a] p-2 rounded-xl border border-white/10 flex gap-2">
              <button onClick={() => addNode('trigger')} className="p-2 hover:bg-[#333] rounded-lg text-purple-400 flex items-center gap-2 text-sm" title="Добавить точку входа (ссылку)">
                <LinkIcon size={16} /> Вход
              </button>
              <button onClick={() => addNode('command')} className="p-2 hover:bg-[#333] rounded-lg text-pink-400 flex items-center gap-2 text-sm" title="Добавить команду (например /privet)">
                <MessageSquare size={16} /> Команда
              </button>
              <div className="w-px h-6 bg-white/10 self-center mx-1"></div>
              <button onClick={() => addNode('message')} className="p-2 hover:bg-[#333] rounded-lg text-blue-400 flex items-center gap-2 text-sm" title="Добавить сообщение">
                <MessageSquare size={16} /> Сообщение
              </button>
              <button onClick={() => addNode('condition')} className="p-2 hover:bg-[#333] rounded-lg text-orange-400 flex items-center gap-2 text-sm" title="Добавить проверку подписки">
                <AlertCircle size={16} /> Подписка
              </button>
            </Panel>
          </ReactFlow>
        </div>

        {/* Sidebar */}
        {selectedNode && (
          <div className="w-full md:w-80 absolute md:relative right-0 top-0 h-full z-10 bg-[#1a1a1a] md:rounded-2xl border-l md:border border-white/10 p-4 flex flex-col overflow-y-auto custom-scrollbar shadow-2xl md:shadow-none">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Settings size={16} /> Настройки узла
              </h3>
              {selectedNode.type !== 'start' && (
                <button 
                  onClick={() => {
                    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
                    setSelectedNode(null);
                  }}
                  className="text-gray-500 hover:text-red-400 p-1"
                  title="Удалить узел"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Название (для вас)</label>
                <input 
                  type="text" 
                  value={selectedNode.data.label as string} 
                  onChange={(e) => updateNodeData('label', e.target.value)}
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </div>

              {selectedNode.data.type === 'trigger' && (
                <div className="space-y-4 border-t border-white/10 pt-4 mt-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Ваша ссылка</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.link as string || ''} 
                      onChange={(e) => updateNodeData('link', e.target.value)}
                      placeholder={selectedPlatform === 'vk' ? "https://vk.me/club_id?ref=promo" : "https://t.me/bot_name?start=promo"}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Вставьте полную ссылку, по которой пользователи будут переходить в бота.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Присвоить тег при переходе</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.tag as string || ''} 
                      onChange={(e) => updateNodeData('tag', e.target.value)}
                      placeholder="Например: from_promo"
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500 mb-2"
                    />
                    
                    <label className="block text-xs text-gray-400 mb-1">Цвет тега</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        '#6b7280', '#ef4444', '#f97316', '#eab308', 
                        '#22c55e', '#3b82f6', '#a855f7', '#ec4899'
                      ].map(color => (
                        <button
                          key={color}
                          onClick={() => updateNodeData('tagColor', color)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            (selectedNode.data.tagColor || '#6b7280') === color 
                              ? 'border-white scale-110' 
                              : 'border-transparent hover:scale-110'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedNode.data.type === 'message' && (
                <div className="space-y-4 border-t border-white/10 pt-4 mt-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><ImageIcon size={12}/> Медиа (URL фото/видео, ссылка на пост ТГ или ВК)</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.mediaUrl as string || ''} 
                      onChange={(e) => updateNodeData('mediaUrl', e.target.value)}
                      placeholder="https://vk.com/photo-123_456, https://vk.com/video-123_456 или URL"
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Поддерживаются прямые ссылки на картинки, ссылки на посты Telegram, а также ссылки на фото, видео и посты ВКонтакте (например: https://vk.com/photo-123_456, https://vk.com/video-123_456, https://vk.com/wall-123_456).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Текст сообщения</label>
                    <div className="bg-[#111] border border-white/10 rounded-lg focus-within:border-purple-500 overflow-hidden">
                      <textarea 
                        value={selectedNode.data.text as string || ''} 
                        onChange={(e) => updateNodeData('text', e.target.value)}
                        className="w-full bg-transparent px-3 py-2 text-sm text-white outline-none min-h-[100px] resize-none"
                        placeholder="Введите текст..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 flex items-center gap-1"><Clock size={10}/> Задержка (сек)</label>
                      <input 
                        type="number" 
                        min="0"
                        value={selectedNode.data.delay as number || 0} 
                        onChange={(e) => updateNodeData('delay', parseInt(e.target.value) || 0)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                        title="Через сколько секунд отправить это сообщение"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 flex items-center gap-1 text-red-400"><Clock size={10}/> Таймаут (мин)</label>
                      <input 
                        type="number" 
                        min="0"
                        value={selectedNode.data.timeout as number || 0} 
                        onChange={(e) => updateNodeData('timeout', parseInt(e.target.value) || 0)}
                        className="w-full bg-[#111] border border-red-500/30 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-red-500"
                        title="Если клиент не ответил за X минут, пойти по красной ветке"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label className="block text-xs text-gray-400 mb-2">Кнопки (Inline)</label>
                    
                    {(selectedNode.data.keyboard as any[][])?.map((row, rIndex) => (
                      <div key={rIndex} className="flex flex-col gap-2 mb-4 p-2 bg-[#222] rounded-lg border border-white/5 relative group">
                        <button 
                          onClick={() => {
                            const newKb = [...(selectedNode.data.keyboard as any[][])];
                            newKb.splice(rIndex, 1);
                            updateNodeData('keyboard', newKb);
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="Удалить ряд"
                        >
                          <Trash2 size={12} />
                        </button>
                        
                        <div className="flex gap-2">
                          {row.map((btn, bIndex) => (
                            <div key={bIndex} className="flex-1 flex flex-col gap-1 border-r border-white/10 pr-2 last:border-0 last:pr-0 relative">
                              <input 
                                type="text" 
                                value={btn.text}
                                onChange={(e) => {
                                  const newKb = [...(selectedNode.data.keyboard as any[][])];
                                  newKb[rIndex][bIndex].text = e.target.value;
                                  updateNodeData('keyboard', newKb);
                                }}
                                className="w-full bg-[#111] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                placeholder="Текст кнопки"
                              />
                              <div className="flex gap-1">
                                <select
                                  value={btn.type || 'callback'}
                                  onChange={(e) => {
                                    const newKb = [...(selectedNode.data.keyboard as any[][])];
                                    newKb[rIndex][bIndex].type = e.target.value;
                                    updateNodeData('keyboard', newKb);
                                  }}
                                  className="bg-[#111] border border-white/10 rounded px-1 py-1 text-[10px] text-gray-300 outline-none w-1/3"
                                >
                                  <option value="callback">Cmd</option>
                                  <option value="url">URL</option>
                                </select>
                                <input 
                                  type="text" 
                                  value={btn.type === 'url' ? btn.url : btn.callback_data || ''}
                                  onChange={(e) => {
                                    const newKb = [...(selectedNode.data.keyboard as any[][])];
                                    if (btn.type === 'url') {
                                      newKb[rIndex][bIndex].url = e.target.value;
                                      delete newKb[rIndex][bIndex].callback_data;
                                    } else {
                                      newKb[rIndex][bIndex].callback_data = e.target.value;
                                      delete newKb[rIndex][bIndex].url;
                                    }
                                    updateNodeData('keyboard', newKb);
                                  }}
                                  className="w-2/3 bg-[#111] border border-white/10 rounded px-2 py-1 text-[10px] text-gray-300 outline-none"
                                  placeholder={btn.type === 'url' ? 'https://...' : 'Команда'}
                                />
                              </div>
                              <select
                                value={btn.color || 'default'}
                                onChange={(e) => {
                                  const newKb = [...(selectedNode.data.keyboard as any[][])];
                                  newKb[rIndex][bIndex].color = e.target.value;
                                  updateNodeData('keyboard', newKb);
                                }}
                                className="w-full bg-[#111] border border-white/10 rounded px-1 py-1 text-[10px] text-gray-400 outline-none"
                              >
                                <option value="default">Цвет: Стандарт</option>
                                <option value="primary">Цвет: Синий (VK)</option>
                                <option value="positive">Цвет: Зеленый (VK)</option>
                                <option value="negative">Цвет: Красный (VK)</option>
                              </select>
                              
                              <button 
                                onClick={() => {
                                  const newKb = [...(selectedNode.data.keyboard as any[][])];
                                  newKb[rIndex].splice(bIndex, 1);
                                  if (newKb[rIndex].length === 0) newKb.splice(rIndex, 1);
                                  updateNodeData('keyboard', newKb);
                                }}
                                className="text-[10px] text-red-400 hover:text-red-300 mt-1 text-left"
                              >
                                Удалить кнопку
                              </button>
                            </div>
                          ))}
                        </div>
                        
                        {row.length < 3 && (
                          <button 
                            onClick={() => {
                              const newKb = [...(selectedNode.data.keyboard as any[][])];
                              const randomId = Math.random().toString(36).substring(2, 9);
                              newKb[rIndex].push({ id: randomId, text: 'Новая', type: 'callback', callback_data: `cmd_${randomId}` });
                              updateNodeData('keyboard', newKb);
                            }}
                            className="text-[10px] text-blue-400 hover:text-blue-300 mt-1 text-center border border-dashed border-blue-500/30 rounded py-1"
                          >
                            + Кнопка в этот ряд
                          </button>
                        )}
                      </div>
                    ))}

                    <button 
                      onClick={() => {
                        const currentKb = (selectedNode.data.keyboard as any[][]) || [];
                        const randomId = Math.random().toString(36).substring(2, 9);
                        updateNodeData('keyboard', [...currentKb, [{ id: randomId, text: 'Новая кнопка', type: 'callback', callback_data: `cmd_${randomId}` }]]);
                      }}
                      className="w-full py-2 border border-dashed border-white/20 rounded-lg text-xs text-gray-400 hover:text-white hover:border-white/40 flex items-center justify-center gap-1"
                    >
                      <Plus size={14} /> Добавить новый ряд
                    </button>
                  </div>
                </div>
              )}

              {selectedNode.data.type === 'trigger' && (
                <div className="space-y-4 border-t border-white/10 pt-4 mt-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Уникальный код ссылки (ref)</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.refCode as string || ''}
                      onChange={(e) => updateNodeData('refCode', e.target.value)}
                      placeholder="Например: funnel_1"
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Будет добавлено в конец ссылки (например: ?start=funnel_1)</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Присвоить тег при переходе</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.tag as string || ''}
                      onChange={(e) => updateNodeData('tag', e.target.value)}
                      placeholder="Например: from_ad"
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Этот тег автоматически добавится пользователю.</p>
                  </div>
                </div>
              )}

              {selectedNode.data.type === 'command' && (
                <div className="space-y-4 border-t border-white/10 pt-4 mt-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Команда</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.command as string || ''}
                      onChange={(e) => updateNodeData('command', e.target.value)}
                      placeholder="Например: /privet"
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Бот запустит эту ветку, если пользователь напишет эту команду.</p>
                  </div>
                </div>
              )}

              {selectedNode.data.type === 'condition' && (
                <div className="space-y-4 border-t border-white/10 pt-4 mt-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Ссылка на группу/канал Telegram</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.tgGroupUsername as string || ''}
                      onChange={(e) => updateNodeData('tgGroupUsername', e.target.value)}
                      placeholder="https://t.me/om_esthetic"
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 font-mono"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Например: https://t.me/om_esthetic или @om_esthetic. Бот должен быть администратором в этом канале.</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Ссылка на группу ВКонтакте</label>
                    <input 
                      type="text" 
                      value={selectedNode.data.vkGroupUsername as string || ''}
                      onChange={(e) => updateNodeData('vkGroupUsername', e.target.value)}
                      placeholder="https://vk.com/om_esthetic"
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 font-mono"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Например: https://vk.com/om_esthetic или ID группы. Бот должен иметь доступ к группе.</p>
                  </div>
                </div>
              )}
              
              <div className="mt-6 pt-4 border-t border-white/10">
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-xl transition-colors text-sm"
                >
                  Сохранить настройки
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in-up">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
            toastMessage.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100' : 'bg-red-900/90 border-red-500/50 text-red-100'
          }`}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={20} className="text-emerald-400" /> : <AlertCircle size={20} className="text-red-400" />}
            <div>
              <h4 className="font-bold text-sm">{toastMessage.title}</h4>
              <p className="text-xs opacity-90">{toastMessage.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
