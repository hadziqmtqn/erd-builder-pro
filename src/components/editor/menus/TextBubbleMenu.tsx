import React from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAIAction } from '@/contexts/AIActionContext';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link, Palette, Check } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';

interface TextBubbleMenuProps {
  editor: Editor;
  openLinkDialog: () => void;
  showSendToAIButton?: boolean;
}

export function TextBubbleMenu({ editor, openLinkDialog, showSendToAIButton = false }: TextBubbleMenuProps) {
  const { setSelectionText, setRightPanelMode } = useAIAction();

  const handleSendSelectionToAI = () => {
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      const text = editor.state.doc.textBetween(from, to, ' ');
      setSelectionText(text);
      setRightPanelMode('chat');
    }
  };
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="textMenu"
      shouldShow={({ editor, state }) => {
        return editor.isFocused
          && editor.isEditable
          && !state.selection.empty
          && !(state.selection instanceof CellSelection);
      }}
      {...{ tippyOptions: { duration: 100, zIndex: 9999, placement: 'bottom-start', appendTo: () => document.body } } as any}
      className="flex gap-1 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden"
    >
      <TooltipProvider delay={200}>
        <DropdownMenu.Root modal={false}>
          <Tooltip>
            <TooltipTrigger 
              render={
                <DropdownMenu.Trigger asChild>
                  <button 
                    className="h-8 min-w-8 flex items-center justify-center rounded-sm transition-colors hover:bg-accent text-popover-foreground outline-none px-1"
                  >
                    {editor.isActive('bold') ? (
                      <Bold className="w-4 h-4" />
                    ) : editor.isActive('italic') ? (
                      <Italic className="w-4 h-4" />
                    ) : editor.isActive('underline') ? (
                      <UnderlineIcon className="w-4 h-4" />
                    ) : editor.isActive('strike') ? (
                      <Strikethrough className="w-4 h-4" />
                    ) : editor.isActive('code') ? (
                      <Code className="w-4 h-4" />
                    ) : (
                      <LucideIcons.Type className="w-4 h-4" />
                    )}
                  </button>
                </DropdownMenu.Trigger>
              }
            />
            <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
              Text Style
            </TooltipContent>
          </Tooltip>
          <DropdownMenu.Content className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10000] min-w-[140px] flex flex-col" sideOffset={5} align="start">
            {[
              { name: 'Bold', icon: Bold, shortcut: '⌘B', action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold') },
              { name: 'Italic', icon: Italic, shortcut: '⌘I', action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic') },
              { name: 'Underline', icon: UnderlineIcon, shortcut: '⌘U', action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline') },
              { name: 'Strikethrough', icon: Strikethrough, shortcut: '⌘⇧X', action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike') },
              { name: 'Code', icon: Code, shortcut: '⌘E', action: () => editor.chain().focus().toggleCode().run(), isActive: editor.isActive('code') },
            ].map(({ name, icon: Icon, shortcut, action, isActive }) => (
              <DropdownMenu.Item
                key={name}
                onSelect={action}
                className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none ${isActive ? 'bg-accent/50' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{name}</span>
                <span className="text-[10px] text-muted-foreground">{shortcut}</span>
                {isActive && <Check className="w-3.5 h-3.5 opacity-70" />}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <div className="w-[1px] h-4 bg-border mx-0.5 self-center" />

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={openLinkDialog}
                className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${editor.isActive('link') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground text-primary'}`}
              >
                <Link className="w-4 h-4" />
              </button>
            }
          />
          <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
            Link (⌘ K)
          </TooltipContent>
        </Tooltip>

        <div className="w-[1px] h-4 bg-border mx-0.5 self-center" />

        <DropdownMenu.Root modal={false}>
          <Tooltip>
            <TooltipTrigger 
              render={
                <DropdownMenu.Trigger asChild>
                  <button 
                    className="h-8 w-8 flex items-center justify-center rounded-sm transition-colors hover:bg-accent text-popover-foreground outline-none"
                  >
                    {editor.isActive('taskList') ? (
                      <LucideIcons.ListTodo className="w-4 h-4" />
                    ) : editor.isActive('orderedList') ? (
                      <LucideIcons.ListOrdered className="w-4 h-4" />
                    ) : (
                      <LucideIcons.List className="w-4 h-4" />
                    )}
                  </button>
                </DropdownMenu.Trigger>
              }
            />
            <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
              List
            </TooltipContent>
          </Tooltip>
          <DropdownMenu.Content className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10000] min-w-[160px] flex flex-col" sideOffset={5} align="start">
            {[
              { name: 'Bullet List', icon: LucideIcons.List, action: () => editor.chain().focus().toggleBulletList().run(), isActive: editor.isActive('bulletList') },
              { name: 'Ordered List', icon: LucideIcons.ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), isActive: editor.isActive('orderedList') },
              { name: 'Task List', icon: LucideIcons.ListTodo, action: () => editor.chain().focus().toggleTaskList().run(), isActive: editor.isActive('taskList') },
            ].map(({ name, icon: Icon, action, isActive }) => (
              <DropdownMenu.Item
                key={name}
                onSelect={action}
                className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none ${isActive ? 'bg-accent/50' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{name}</span>
                {isActive && <Check className="w-3.5 h-3.5 opacity-70" />}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <DropdownMenu.Root modal={false}>
          <Tooltip>
            <TooltipTrigger 
              render={
                <DropdownMenu.Trigger asChild>
                  <button className="h-8 w-8 flex items-center justify-center rounded-sm transition-colors hover:bg-accent text-popover-foreground">
                    <Palette className="w-4 h-4" />
                  </button>
                </DropdownMenu.Trigger>
              }
            />
            <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
              Color
            </TooltipContent>
          </Tooltip>
          <DropdownMenu.Content className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10000] min-w-[160px] flex flex-col" sideOffset={5} align="start">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme Colors</div>
            {[
              { name: 'Default', value: '' },
              { name: 'Indigo', value: '#6366f1' },
              { name: 'Purple', value: '#8b5cf6' },
              { name: 'Pink', value: '#ec4899' },
              { name: 'Blue', value: '#3b82f6' },
              { name: 'Green', value: '#10b981' },
              { name: 'Orange', value: '#f59e0b' },
              { name: 'Red', value: '#ef4444' }
            ].map(({ name, value }) => {
              const isActive = editor.isActive('lucideIcon') 
                ? editor.getAttributes('lucideIcon').color === (value || null)
                : editor.isActive('badge')
                ? editor.getAttributes('badge').color === (value || null)
                : (value ? editor.isActive('textStyle', { color: value }) : (!editor.getAttributes('textStyle').color));
              return (
                <DropdownMenu.Item
                  key={name}
                  onSelect={() => {
                    if (editor.isActive('lucideIcon')) {
                      editor.chain().focus().updateAttributes('lucideIcon', { color: value || null }).run();
                    } else if (editor.isActive('badge')) {
                      editor.chain().focus().updateAttributes('badge', { color: value || null }).run();
                    } else {
                      if (value) editor.chain().focus().setColor(value).run();
                      else editor.chain().focus().unsetColor().run();
                    }
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none ${isActive ? 'bg-accent/50' : ''}`}
                >
                  <div
                    className="w-4 h-4 rounded-sm border border-border/50 shrink-0 flex items-center justify-center font-bold text-white text-[10px]"
                    style={value ? { backgroundColor: value } : { backgroundColor: 'transparent' }}
                  >
                    {!value && <span className="text-foreground">A</span>}
                  </div>
                  <span className="flex-1">{name}</span>
                  {isActive && <Check className="w-3.5 h-3.5 opacity-70" />}
                </DropdownMenu.Item>
              )
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <div className="w-[1px] h-4 bg-border mx-0.5 self-center" />

        <DropdownMenu.Root modal={false}>
          <Tooltip>
            <TooltipTrigger 
              render={
                <DropdownMenu.Trigger asChild>
                  <button 
                    className="h-8 w-8 flex items-center justify-center rounded-sm transition-colors hover:bg-accent text-popover-foreground outline-none"
                  >
                    {editor.isActive({ textAlign: 'center' }) ? (
                      <LucideIcons.AlignCenter className="w-4 h-4" />
                    ) : editor.isActive({ textAlign: 'right' }) ? (
                      <LucideIcons.AlignRight className="w-4 h-4" />
                    ) : (
                      <LucideIcons.AlignLeft className="w-4 h-4" />
                    )}
                  </button>
                </DropdownMenu.Trigger>
              }
            />
            <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
              Alignment (⌘ ⇧ L/C/R)
            </TooltipContent>
          </Tooltip>
          <DropdownMenu.Content className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10000] min-w-[130px] flex flex-col" sideOffset={5} align="start">
            {[
              { name: 'Align Left', value: 'left', icon: LucideIcons.AlignLeft },
              { name: 'Align Center', value: 'center', icon: LucideIcons.AlignCenter },
              { name: 'Align Right', value: 'right', icon: LucideIcons.AlignRight }
            ].map(({ name, value, icon: Icon }) => (
              <DropdownMenu.Item
                key={name}
                onSelect={() => editor.chain().focus().setTextAlign(value).run()}
                className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none ${editor.isActive({ textAlign: value }) ? 'bg-accent/50' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{name}</span>
                {editor.isActive({ textAlign: value }) && <Check className="w-3.5 h-3.5 opacity-70" />}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        {showSendToAIButton && (
          <>
            <div className="w-[1px] h-4 bg-border mx-0.5 self-center" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={handleSendSelectionToAI}
                    className="h-8 w-8 flex items-center justify-center rounded-sm transition-colors hover:bg-accent text-popover-foreground"
                  >
                    <LucideIcons.Sparkles className="w-4 h-4" />
                  </button>
                }
              />
              <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
                Send to AI
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </TooltipProvider>
    </BubbleMenu>
  );
}
