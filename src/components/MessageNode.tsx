import React, { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeProps, Node } from '@xyflow/react';
import { Plus, X, MessageSquare } from 'lucide-react';

export type InlineButton = {
  id: string;
  text: string;
};

export type MessageNodeData = Record<string, unknown> & {
  text: string;
  buttons: InlineButton[][];
  onUpdate: (id: string, data: Partial<MessageNodeData>) => void;
};

type MessageNodeType = Node<MessageNodeData, 'message'>;

export default function MessageNode({ id, data }: NodeProps<MessageNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [data.buttons, id, updateNodeInternals]);

  const updateText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    data.onUpdate(id, { text: e.target.value });
  };

  const generateId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const addRow = () => {
    const newButtons = [...data.buttons, [{ id: generateId(), text: 'Новая кнопка' }]];
    data.onUpdate(id, { buttons: newButtons });
  };

  const addButton = (rowIndex: number) => {
    const newButtons = [...data.buttons];
    if (newButtons[rowIndex].length < 3) {
      newButtons[rowIndex].push({ id: generateId(), text: 'Кнопка' });
      data.onUpdate(id, { buttons: newButtons });
    }
  };

  const updateButtonText = (rowIndex: number, btnIndex: number, text: string) => {
    const newButtons = [...data.buttons];
    newButtons[rowIndex][btnIndex].text = text;
    data.onUpdate(id, { buttons: newButtons });
  };

  const removeButton = (rowIndex: number, btnIndex: number) => {
    const newButtons = [...data.buttons];
    newButtons[rowIndex].splice(btnIndex, 1);
    if (newButtons[rowIndex].length === 0) {
      newButtons.splice(rowIndex, 1);
    }
    data.onUpdate(id, { buttons: newButtons });
  };

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl w-[340px] font-sans overflow-visible">
      {/* Input Handle (Вход) */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-4 h-4 bg-blue-500 border-4 border-[#1e1e1e] -top-2 z-20"
      />

      {/* Header */}
      <div className="bg-[#252525] px-4 py-3 border-b border-[#333] flex items-center justify-between rounded-t-2xl drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-gray-200">Сообщение</span>
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Узел</div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-5">
        {/* Text Area */}
        <div className="relative">
          <textarea
            value={data.text}
            onChange={updateText}
            placeholder="Введите текст сообщения..."
            className="w-full bg-[#1a1a1a] text-gray-200 text-sm rounded-xl p-3 border border-[#333] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none min-h-[100px] custom-scrollbar"
          />
        </div>

        {/* Keyboard */}
        <div className="flex flex-col gap-6">
          {data.buttons.map((row, rIdx) => (
            <div key={rIdx} className="flex gap-2 w-full relative">
              {row.map((btn, bIdx) => (
                <div key={btn.id} className="relative flex-1 flex flex-col items-center group">
                  <div className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg flex items-center focus-within:border-blue-500 focus-within:bg-[#333] transition-all duration-200 shadow-sm overflow-hidden">
                    <input
                      value={btn.text}
                      onChange={(e) => updateButtonText(rIdx, bIdx, e.target.value)}
                      className="bg-transparent text-gray-200 text-xs font-medium w-full text-center py-2.5 px-1 outline-none"
                      placeholder="Кнопка"
                    />
                    <button
                      onClick={() => removeButton(rIdx, bIdx)}
                      className="text-gray-500 hover:text-red-400 pr-2 opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 bg-gradient-to-l from-[#2a2a2a] via-[#2a2a2a] to-transparent pl-2 h-full flex items-center"
                      title="Удалить кнопку"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {/* Output Handle for this button */}
                  <Handle
                    type="source"
                    position={Position.Bottom}
                    id={btn.id}
                    className="w-4 h-4 bg-yellow-400 border-4 border-[#1e1e1e] hover:bg-yellow-300 hover:scale-125 transition-transform z-20"
                    style={{ bottom: '-16px' }}
                  />
                </div>
              ))}
              {row.length < 3 && (
                <button
                  onClick={() => addButton(rIdx)}
                  className="bg-[#2a2a2a] border border-dashed border-[#444] hover:border-gray-400 rounded-lg w-10 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors shrink-0"
                  title="Добавить кнопку в ряд"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
          ))}

          <button
            onClick={addRow}
            className="w-full py-2.5 border border-dashed border-[#444] rounded-xl text-gray-400 text-xs font-medium hover:text-gray-200 hover:border-gray-400 hover:bg-[#252525] transition-all flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            Добавить ряд кнопок
          </button>
        </div>
      </div>
    </div>
  );
}
