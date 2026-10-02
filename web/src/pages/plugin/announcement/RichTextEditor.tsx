import { acquireAsset, protectedAsset } from '../../../features/upload/AuthenticatedAsset';
import { useEffect, useRef, useState } from 'react';
import { App, Button, Form, Input, Modal, Select, Space, Tooltip, Upload } from 'antd';
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  EyeOutlined,
  FileImageOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { fileUrl, uploadFile } from '../../../api/request';
import {
  richTextFragment,
  richTextNodes,
  richTextPlainText,
  safeRichUrl,
  sanitizeRichText,
} from './richText';
import './announcement.css';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

export default function RichTextEditor({
  value = '',
  onChange,
  disabled = false,
  onUploadingChange,
}: Props) {
  const { message } = App.useApp();
  const editor = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const emitted = useRef<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [linkForm] = Form.useForm<{ text: string; url: string }>();

  useEffect(() => {
    if (!editor.current || value === emitted.current) return;
    const fragment = richTextFragment(value);
    fragment.querySelectorAll('img').forEach((image) => {
      const source = fileUrl(image.getAttribute('src')) ?? '';
      if (protectedAsset(source)) {
        image.dataset.geaSource = source;
        image.removeAttribute('src');
      } else image.setAttribute('src', source);
    });
    editor.current.replaceChildren(fragment);
    emitted.current = value;
  }, [value]);

  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    const seen = new WeakSet<HTMLImageElement>();
    const releases: (() => void)[] = [];
    let active = true;
    const hydrate = () =>
      root.querySelectorAll('img').forEach((image) => {
        if (seen.has(image)) return;
        seen.add(image);
        const source = image.dataset.geaSource || image.getAttribute('src') || '';
        if (!protectedAsset(source)) return;
        image.dataset.geaSource = source;
        image.removeAttribute('src');
        const asset = acquireAsset(source);
        releases.push(asset.release);
        void asset.promise
          .then((url) => {
            if (active && root.contains(image)) image.src = url;
          })
          .catch(() => {
            if (active) image.alt = image.alt || '公告图片';
          });
      });
    const observer = new MutationObserver(hydrate);
    observer.observe(root, { childList: true, subtree: true });
    hydrate();
    return () => {
      active = false;
      observer.disconnect();
      releases.forEach((release) => release());
    };
  }, []);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (
      selection?.rangeCount &&
      editor.current?.contains(selection.getRangeAt(0).commonAncestorContainer)
    )
      savedRange.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    editor.current?.focus();
    const selection = window.getSelection();
    if (!selection || !editor.current) return;
    const range =
      savedRange.current && editor.current.contains(savedRange.current.commonAncestorContainer)
        ? savedRange.current
        : document.createRange();
    if (range !== savedRange.current) {
      range.selectNodeContents(editor.current);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const emitValue = () => {
    if (!editor.current) return;
    const copy = editor.current.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('img[data-gea-source]').forEach((image) => {
      image.setAttribute('src', image.getAttribute('data-gea-source') || '');
      image.removeAttribute('data-gea-source');
    });
    const html = sanitizeRichText(copy.innerHTML);
    emitted.current = html;
    onChange?.(html);
    rememberSelection();
  };
  const command = (name: string, argument?: string) => {
    restoreSelection();
    document.execCommand(name, false, argument);
    emitValue();
  };
  const insert = (fragment: DocumentFragment) => {
    fragment.querySelectorAll('img').forEach((image) => {
      const source = fileUrl(image.getAttribute('src')) || '';
      if (protectedAsset(source)) {
        image.dataset.geaSource = source;
        image.removeAttribute('src');
      }
    });
    restoreSelection();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const last = fragment.lastChild;
    range.insertNode(fragment);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    emitValue();
  };
  const addLink = async () => {
    let values: { text: string; url: string };
    try {
      values = await linkForm.validateFields();
    } catch {
      return;
    }
    const url = safeRichUrl(values.url);
    if (!url) {
      message.warning('请输入以 http、https 开头的链接地址');
      return;
    }
    const fragment = document.createDocumentFragment();
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = values.text || url;
    fragment.appendChild(link);
    insert(fragment);
    setLinkOpen(false);
  };

  const actions = [
    { title: '加粗', icon: <BoldOutlined />, command: 'bold' },
    { title: '斜体', icon: <ItalicOutlined />, command: 'italic' },
    { title: '下划线', icon: <UnderlineOutlined />, command: 'underline' },
    { title: '删除线', icon: <StrikethroughOutlined />, command: 'strikeThrough' },
    { title: '无序列表', icon: <UnorderedListOutlined />, command: 'insertUnorderedList' },
    { title: '有序列表', icon: <OrderedListOutlined />, command: 'insertOrderedList' },
    { title: '左对齐', icon: <AlignLeftOutlined />, command: 'justifyLeft' },
    { title: '居中对齐', icon: <AlignCenterOutlined />, command: 'justifyCenter' },
    { title: '右对齐', icon: <AlignRightOutlined />, command: 'justifyRight' },
    { title: '撤销', icon: <UndoOutlined />, command: 'undo' },
    { title: '重做', icon: <RedoOutlined />, command: 'redo' },
  ];

  return (
    <div className="announcement-editor">
      <div className="announcement-editor-toolbar">
        <Space size={2} wrap>
          <Select
            aria-label="公告编辑器"
            size="small"
            style={{ width: 100 }}
            defaultValue="p"
            disabled={disabled || preview}
            options={[
              { value: 'p', label: '正文' },
              { value: 'h2', label: '二级标题' },
              { value: 'h3', label: '三级标题' },
              { value: 'blockquote', label: '引用' },
              { value: 'pre', label: '代码块' },
            ]}
            onChange={(tag) => command('formatBlock', tag)}
          />
          {actions.map((action) => (
            <Tooltip title={action.title} key={action.command}>
              <Button
                type="text"
                size="small"
                aria-label={action.title}
                icon={action.icon}
                disabled={disabled || preview}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => command(action.command)}
              />
            </Tooltip>
          ))}
          <Tooltip title="插入链接">
            <Button
              type="text"
              size="small"
              aria-label="插入链接"
              icon={<LinkOutlined />}
              disabled={disabled || preview}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                rememberSelection();
                linkForm.setFieldsValue({ text: window.getSelection()?.toString() ?? '', url: '' });
                setLinkOpen(true);
              }}
            />
          </Tooltip>
          <Upload
            accept="image/jpeg,image/png,image/webp,image/gif"
            showUploadList={false}
            disabled={disabled || preview || imageLoading}
            beforeUpload={async (file) => {
              if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
                message.error('请选择 JPG、PNG、WebP 或 GIF 格式的图片');
                return Upload.LIST_IGNORE;
              }
              if (file.size > 10 * 1024 * 1024) {
                message.error('图片大小不能超过 10MB');
                return Upload.LIST_IGNORE;
              }
              setImageLoading(true);
              onUploadingChange?.(true);
              try {
                const result = await uploadFile(file);
                const url = safeRichUrl(result.file.url, true);
                if (!url) {
                  message.error('链接地址不正确');
                  return false;
                }
                const fragment = document.createDocumentFragment();
                const image = document.createElement('img');
                image.src = fileUrl(url) ?? url;
                image.alt = file.name;
                fragment.appendChild(image);
                insert(fragment);
              } catch {
                // Internal implementation detail.
              } finally {
                setImageLoading(false);
                onUploadingChange?.(false);
              }
              return false;
            }}
          >
            <Tooltip title="插入图片">
              <Button
                type="text"
                size="small"
                aria-label="插入图片"
                icon={<FileImageOutlined />}
                loading={imageLoading}
                disabled={disabled || preview}
                onMouseDown={rememberSelection}
              />
            </Tooltip>
          </Upload>
          <Button
            type={preview ? 'primary' : 'text'}
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setPreview((current) => !current)}
          >
            {preview ? '编辑' : '预览'}
          </Button>
        </Space>
      </div>
      <div
        ref={editor}
        className="announcement-rich-content announcement-editable"
        role="textbox"
        aria-label="公告编辑器"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        hidden={preview}
        data-placeholder="请输入公告内容"
        onInput={emitValue}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onPaste={(event) => {
          event.preventDefault();
          rememberSelection();
          const html = event.clipboardData.getData('text/html');
          const fragment = html ? richTextFragment(html) : document.createDocumentFragment();
          if (!html)
            fragment.appendChild(
              document.createTextNode(event.clipboardData.getData('text/plain')),
            );
          insert(fragment);
        }}
        onDrop={(event) => {
          event.preventDefault();
        }}
      />
      {preview && (
        <div className="announcement-rich-content announcement-preview">
          {richTextNodes(value, (url) => fileUrl(url) ?? url)}
        </div>
      )}
      <div className="announcement-editor-footer">{richTextPlainText(value).length} 个字符</div>
      <Modal
        title="插入链接"
        open={linkOpen}
        onCancel={() => setLinkOpen(false)}
        onOk={() => void addLink()}
        width={440}
      >
        <Form form={linkForm} layout="vertical" style={{ marginTop: 20 }}>
          <Form.Item name="text" label="链接文本">
            <Input />
          </Form.Item>
          <Form.Item
            name="url"
            label="链接地址"
            rules={[{ required: true, message: '请输入链接地址' }]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
