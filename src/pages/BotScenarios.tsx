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
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Play, Plus, Trash2, Settings, MessageSquare, Tag, Zap } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

// Custom Nodes
const MessageNode = ({ data }: { data: any }) => (
  <div className="bg-[#1a1a1a] border border-blue-500/50 rounded-xl w-48 shadow-lg shadow-blue-900/20">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500" />
    <div className="bg-blue-500/10 p-2 rounded-t-xl border-b border-blue-500/20 flex items-center gap-2">
      <MessageSquare size={14} className="text-blue-400" />
      <span className="text-xs font-bold text-blue-100">{data.label || 'Сообщение'}</span>
    </div>
    <div className="p-3 text-xs text-gray-400 truncate">
      {data.text || 'Нет текста...'}
    </div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500" />
  </div>
);

const ActionNode = ({ data }: { data: any }) => (
  <div className="bg-[#1a1a1a] border border-green-500/50 rounded-xl w-48 shadow-lg shadow-green-900/20">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-green-500" />
    <div className="bg-green-500/10 p-2 rounded-t-xl border-b border-green-500/20 flex items-center gap-2">
      <Tag size={14} className="text-green-400" />
      <span className="text-xs font-bold text-green-100">{data.label || 'Действие'}</span>
    </div>
    <div className="p-3 text-xs text-gray-400 truncate">
      {data.actionType === 'add_tag' ? '+ Тег: ' : '- Тег: '} {data.tag || '...'}
    </div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-green-500" />
  </div>
);

const ConditionNode = ({ data }: { data: any }) => (
  <div className="bg-[#1a1a1a] border border-yellow-500/50 rounded-xl w-48 shadow-lg shadow-yellow-900/20">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-yellow-500" />
    <div className="bg-yellow-500/10 p-2 rounded-t-xl border-b border-yellow-500/20 flex items-center gap-2">
      <Zap size={14} className="text-yellow-400" />
      <span className="text-xs font-bold text-yellow-100">{data.label || 'Условие'}</span>
    </div>
    <div className="p-3 text-xs text-gray-400 truncate text-center">
      Если тег: {data.tag || '...'}
    </div>
    <Handle type="source" position={Position.Bottom} id="true" className="w-3 h-3 bg-green-500 -ml-4" />
    <Handle type="source" position={Position.Bottom} id="false" className="w-3 h-3 bg-red-500 ml-4" />
  </div>
);

const nodeTypes = {
  message: MessageNode,
  action: ActionNode,
  condition: ConditionNode,
};

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'input',
    data: { label: 'Старт (/start)' },
    position: { x: 250, y: 50 },
    style: { background: '#9333ea', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontWeight: 'bold' }
  },
];

const initialEdges: Edge[] = [];

export default function BotScenarios() {
  const { currentUser } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedPlatform, setSelectedPlatform] = useState<'tg' | 'vk' | 'max'>('tg');

  useEffect(() => {
    const loadScenario = async () => {
      if (!currentUser) return;
      try {
        const docRef = doc(db, 'users', currentUser.uid, 'settings', `scenario_${selectedPlatform}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setNodes(data.nodes || initialNodes);
          setEdges(data.edges || initialEdges);
        } else {
          setNodes(initialNodes);
          setEdges(initialEdges);
        }
      } catch (error) {
        console.error("Error loading scenario:", error);
      }
    };
    loadScenario();
  }, [currentUser, selectedPlatform, setNodes, setEdges]);

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, 'users', currentUser.uid, 'settings', `scenario_${selectedPlatform}`);
      await setDoc(docRef, {
        nodes,
        edges
      });
      alert('Сценарий сохранен!');
    } catch (error) {
      console.error("Error saving scenario:", error);
      alert('Ошибка при сохранении');
    } finally {
      setIsSaving(false);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const addNode = (type: 'message' | 'action' | 'condition') => {
    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: type,
      data: { 
        label: type === 'message' ? 'Сообщение' : type === 'action' ? 'Действие' : 'Условие',
        type,
        text: '',
        tags: [],
        actionType: 'add_tag',
        tag: '',
        keyboard: []
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
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">Сценарии ботов</h1>
          <select 
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value as any)}
            className="bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none"
          >
            <option value="tg">Telegram</option>
            <option value="vk">ВКонтакте</option>
            <option value="max">MAX</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="bg-[#1a1a1a] hover:bg-[#222] text-white px-4 py-2 rounded-xl flex items-center gap-2 border border-white/10 transition-colors">
            <Play size={16} /> Тест
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Save size={16} /> {isSaving ? 'Сохранение...' : 'Сохранить'}
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
            fitView
            theme="dark"
          >
            <Background color="#333" gap={16} />
            <Controls className="bg-[#1a1a1a] border-white/10 fill-white" />
            <MiniMap 
              nodeColor={(n) => {
                if (n.id === 'start') return '#9333ea';
                return '#333';
              }}
              maskColor="rgba(0,0,0,0.7)"
              className="bg-[#1a1a1a]"
            />
            <Panel position="top-left" className="bg-[#1a1a1a] p-2 rounded-xl border border-white/10 flex gap-2">
              <button onClick={() => addNode('message')} className="p-2 hover:bg-[#333] rounded-lg text-blue-400 flex items-center gap-2 text-sm" title="Добавить сообщение">
                <MessageSquare size={16} /> Сообщение
              </button>
              <button onClick={() => addNode('action')} className="p-2 hover:bg-[#333] rounded-lg text-green-400 flex items-center gap-2 text-sm" title="Добавить действие (тег)">
                <Tag size={16} /> Действие
              </button>
              <button onClick={() => addNode('condition')} className="p-2 hover:bg-[#333] rounded-lg text-yellow-400 flex items-center gap-2 text-sm" title="Добавить условие">
                <Zap size={16} /> Условие
              </button>
            </Panel>
          </ReactFlow>
        </div>

        {/* Sidebar */}
        {selectedNode && (
          <div className="w-80 bg-[#1a1a1a] rounded-2xl border border-white/10 p-4 flex flex-col overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Settings size={16} /> Настройки узла
              </h3>
              <button 
                onClick={() => setNodes(nds => nds.filter(n => n.id !== selectedNode.id))}
                className="text-gray-500 hover:text-red-400 p-1"
                title="Удалить узел"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Название (Label)</label>
                <input 
                  type="text" 
                  value={selectedNode.data.label as string} 
                  onChange={(e) => updateNodeData('label', e.target.value)}
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </div>

              {selectedNode.data.type === 'message' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Текст сообщения</label>
                  <textarea 
                    value={selectedNode.data.text as string || ''} 
                    onChange={(e) => updateNodeData('text', e.target.value)}
                    className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500 min-h-[100px] resize-none"
                    placeholder="Введите текст..."
                  />
                  
                  <div className="mt-4">
                    <label className="block text-xs text-gray-400 mb-2">Кнопки (Inline)</label>
                    
                    {/* Render existing buttons */}
                    {(selectedNode.data.keyboard as any[][])?.map((row, rIndex) => (
                      <div key={rIndex} className="flex gap-2 mb-2">
                        {row.map((btn, bIndex) => (
                          <div key={bIndex} className="flex-1 bg-[#222] border border-white/10 rounded-lg p-2 relative group">
                            <input 
                              type="text" 
                              value={btn.text}
                              onChange={(e) => {
                                const newKb = [...(selectedNode.data.keyboard as any[][])];
                                newKb[rIndex][bIndex].text = e.target.value;
                                updateNodeData('keyboard', newKb);
                              }}
                              className="w-full bg-transparent text-xs text-white outline-none mb-1"
                              placeholder="Текст кнопки"
                            />
                            <input 
                              type="text" 
                              value={btn.callback_data || btn.url || ''}
                              onChange={(e) => {
                                const newKb = [...(selectedNode.data.keyboard as any[][])];
                                newKb[rIndex][bIndex].callback_data = e.target.value;
                                updateNodeData('keyboard', newKb);
                              }}
                              className="w-full bg-[#111] rounded px-1 py-0.5 text-[10px] text-gray-400 outline-none"
                              placeholder="Команда / URL"
                            />
                            <button 
                              onClick={() => {
                                const newKb = [...(selectedNode.data.keyboard as any[][])];
                                newKb[rIndex].splice(bIndex, 1);
                                if (newKb[rIndex].length === 0) newKb.splice(rIndex, 1);
                                updateNodeData('keyboard', newKb);
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}

                    <button 
                      onClick={() => {
                        const currentKb = (selectedNode.data.keyboard as any[][]) || [];
                        updateNodeData('keyboard', [...currentKb, [{ text: 'Новая кнопка', callback_data: 'cmd_1' }]]);
                      }}
                      className="w-full py-2 border border-dashed border-white/20 rounded-lg text-xs text-gray-400 hover:text-white hover:border-white/40 flex items-center justify-center gap-1"
                    >
                      <Plus size={14} /> Добавить ряд кнопок
                    </button>
                  </div>
                </div>
              )}

              {selectedNode.data.type === 'action' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Действие</label>
                  <select 
                    value={selectedNode.data.actionType as string || 'add_tag'}
                    onChange={(e) => updateNodeData('actionType', e.target.value)}
                    className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none mb-3"
                  >
                    <option value="add_tag">Добавить тег</option>
                    <option value="remove_tag">Удалить тег</option>
                  </select>
                  
                  <label className="block text-xs text-gray-400 mb-1">Тег</label>
                  <input 
                    type="text" 
                    value={selectedNode.data.tag as string || ''}
                    onChange={(e) => updateNodeData('tag', e.target.value)}
                    placeholder="Например: google_ads"
                    className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  />
                </div>
              )}

              {selectedNode.data.type === 'condition' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Проверка тега</label>
                  <input 
                    type="text" 
                    value={selectedNode.data.tag as string || ''}
                    onChange={(e) => updateNodeData('tag', e.target.value)}
                    placeholder="Например: has_paid"
                    className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Если тег есть — идет по зеленой ветке, если нет — по красной.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
