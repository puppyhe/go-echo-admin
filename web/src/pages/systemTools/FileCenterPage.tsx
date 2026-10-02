import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  List,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
  PauseOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { request, session } from '../../api/request';
import { downloadByUrl } from '../../api/download';
import {
  abortMultipartUpload,
  getUploadCapabilities,
  startMultipartUpload,
  type MultipartCapabilities,
  type MultipartUploadHandle,
  UploadCancelledError,
} from '../../features/upload/multipart';

type FileRecord = {
  ID: number;
  id?: number;
  name: string;
  size: number;
  mime: string;
  hash: string;
  category?: string;
  tag?: string;
  remark?: string;
  status?: string;
  url: string;
  createdAt?: string;
};

type FileListResponse = { list: FileRecord[]; total: number; page: number; pageSize: number };

type UploadItem = {
  key: string;
  file: File;
  status: 'queued' | 'uploading' | 'paused' | 'success' | 'error' | 'cancelled';
  progress: number;
  uploadedBytes: number;
  uploadId?: string;
  error?: string;
};

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function FileCenterPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [capabilities, setCapabilities] = useState<MultipartCapabilities>();
  const uploadHandles = useRef(new Map<string, MultipartUploadHandle>());
  const [editing, setEditing] = useState<FileRecord>();
  const [form] = Form.useForm<{ name: string; category: string; tag: string; remark: string }>();

  useEffect(() => {
    let active = true;
    const scope = session.capture();
    void getUploadCapabilities()
      .then((value) => {
        if (active && session.isCurrent(scope)) setCapabilities(value);
      })
      .catch(() => {
        if (active) setCapabilities(undefined);
      });
    const unsubscribe = session.subscribe(() => {
      uploadHandles.current.forEach((handle) => void handle.cancel());
      uploadHandles.current.clear();
      setUploads([]);
      setCapabilities(undefined);
    });
    return () => {
      active = false;
      unsubscribe();
      uploadHandles.current.forEach((handle) => void handle.cancel());
      uploadHandles.current.clear();
    };
  }, []);

  const load = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      try {
        const data = await request<FileListResponse>('/fileUploadAndDownload/getFileList', {
          params: { page: targetPage, pageSize: 20, name: keyword.trim() },
        });
        setRows(data?.list ?? []);
        setTotal(data?.total ?? 0);
      } catch {
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [keyword, page],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const updateUpload = (key: string, patch: Partial<UploadItem>) => {
    setUploads((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const runUpload = async (item: UploadItem) => {
    let caps: MultipartCapabilities;
    try {
      caps = capabilities ?? (await getUploadCapabilities());
    } catch (error) {
      updateUpload(item.key, {
        status: 'error',
        error: error instanceof Error ? error.message : '无法读取上传能力配置',
      });
      return;
    }
    setCapabilities(caps);
    if (!caps.multipartEnabled) {
      updateUpload(item.key, { status: 'error', error: '当前环境未启用分片上传' });
      return;
    }
    if (item.file.size > caps.maxFileSize) {
      updateUpload(item.key, {
        status: 'error',
        error: `文件大小超过限制（${formatSize(caps.maxFileSize)}）`,
      });
      return;
    }
    const handle = startMultipartUpload(item.file, {
      capabilities: caps,
      uploadId: item.uploadId,
      onSession: (value) => updateUpload(item.key, { uploadId: value.uploadId }),
      onProgress: ({ uploadedBytes, totalBytes }) =>
        updateUpload(item.key, {
          status: 'uploading',
          uploadedBytes,
          progress: totalBytes ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0,
        }),
    });
    uploadHandles.current.set(item.key, handle);
    updateUpload(item.key, { status: 'uploading', error: undefined });
    try {
      await handle.promise;
      updateUpload(item.key, { status: 'success', progress: 100, uploadedBytes: item.file.size });
      message.success(`${item.file.name} 上传成功`);
      setPage(1);
      await load(1);
    } catch (error) {
      if (error instanceof UploadCancelledError) {
        updateUpload(item.key, { status: 'cancelled' });
      } else {
        updateUpload(item.key, {
          status: 'error',
          error: error instanceof Error ? error.message : '上传失败',
        });
      }
    } finally {
      uploadHandles.current.delete(item.key);
    }
  };

  const enqueueFiles = (files: File[]) => {
    files.forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}:${
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
      }`;
      const item: UploadItem = { key, file, status: 'queued', progress: 0, uploadedBytes: 0 };
      setUploads((items) => [...items, item]);
      void runUpload(item);
    });
  };

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    enqueueFiles([file]);
    return Upload.LIST_IGNORE;
  };

  const pauseUpload = (item: UploadItem) => {
    uploadHandles.current.get(item.key)?.pause();
    updateUpload(item.key, { status: 'paused' });
  };

  const resumeUpload = (item: UploadItem) => {
    const current = uploadHandles.current.get(item.key);
    if (current) {
      current.resume();
      updateUpload(item.key, { status: 'uploading' });
      return;
    }
    void runUpload({ ...item, status: 'queued' });
  };

  const cancelUpload = async (item: UploadItem) => {
    const current = uploadHandles.current.get(item.key);
    if (current) await current.cancel();
    else if (item.uploadId) await abortMultipartUpload(item.uploadId).catch(() => undefined);
    updateUpload(item.key, { status: 'cancelled' });
  };

  const retryUpload = (item: UploadItem) => {
    void runUpload({ ...item, status: 'queued', error: undefined });
  };

  const remove = async (row: FileRecord) => {
    await request(`/fileUploadAndDownload/deleteFile?id=${row.ID ?? row.id}`, { method: 'DELETE' });
    message.success('文件已删除');
    await load();
  };

  const openEdit = (row: FileRecord) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      category: row.category ?? '',
      tag: row.tag ?? '',
      remark: row.remark ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    await request('/fileUploadAndDownload/updateFile', {
      method: 'PUT',
      body: { id: editing.ID ?? editing.id, ...values },
    });
    message.success('文件信息已保存');
    setEditing(undefined);
    await load();
  };

  const columns = useMemo(
    () => [
      {
        title: '文件名',
        dataIndex: 'name',
        key: 'name',
        render: (name: string) => (
          <Space>
            <FileOutlined style={{ color: '#005DFB' }} />
            <Typography.Text ellipsis={{ tooltip: name }} style={{ maxWidth: 320 }}>
              {name}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: '类型',
        dataIndex: 'mime',
        key: 'mime',
        width: 250,
        render: (mime: string) => <Tag>{mime}</Tag>,
      },
      {
        title: '大小',
        dataIndex: 'size',
        key: 'size',
        width: 120,
        render: (size: number) => formatSize(size),
      },
      {
        title: '上传时间',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 190,
        render: (value?: string) => (value ? new Date(value).toLocaleString('zh-CN') : '—'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_: unknown, row: FileRecord) => (
          <Space>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={() => void downloadByUrl(row.url, { filename: row.name })}
            >
              下载
            </Button>
            <Button type="link" onClick={() => openEdit(row)}>
              编辑
            </Button>
            <Popconfirm
              title="确定删除这个文件吗？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void remove(row)}
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [load, message],
  );

  return (
    <Card
      className="page-card"
      title={
        <Space>
          <FileOutlined />
          文件中心
        </Space>
      }
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <Space wrap>
          <Input
            allowClear
            value={keyword}
            placeholder="搜索文件名"
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => {
              setPage(1);
              void load(1);
            }}
          />
          <Button
            onClick={() => {
              setPage(1);
              void load(1);
            }}
          >
            查询
          </Button>
          <Tooltip title="刷新文件列表">
            <Button icon={<ReloadOutlined />} onClick={() => void load()} />
          </Tooltip>
        </Space>
        <Upload showUploadList={false} multiple beforeUpload={beforeUpload}>
          <Button type="primary" icon={<UploadOutlined />}>
            上传文件
          </Button>
        </Upload>
      </div>
      {uploads.length > 0 && (
        <List
          size="small"
          bordered
          style={{ marginBottom: 18 }}
          dataSource={uploads}
          renderItem={(item) => (
            <List.Item
              actions={[
                item.status === 'uploading' ? (
                  <Button
                    key="pause"
                    type="link"
                    icon={<PauseOutlined />}
                    onClick={() => pauseUpload(item)}
                  >
                    暂停
                  </Button>
                ) : item.status === 'paused' ? (
                  <Button
                    key="resume"
                    type="link"
                    icon={<PlayCircleOutlined />}
                    onClick={() => resumeUpload(item)}
                  >
                    继续
                  </Button>
                ) : item.status === 'error' ? (
                  <Button key="retry" type="link" onClick={() => retryUpload(item)}>
                    重试
                  </Button>
                ) : null,
                !['success', 'cancelled'].includes(item.status) ? (
                  <Button key="cancel" type="link" danger onClick={() => void cancelUpload(item)}>
                    取消
                  </Button>
                ) : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={item.file.name}
                description={
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Progress
                      percent={item.progress}
                      status={
                        item.status === 'error'
                          ? 'exception'
                          : item.status === 'success'
                            ? 'success'
                            : undefined
                      }
                    />
                    <Typography.Text type={item.status === 'error' ? 'danger' : 'secondary'}>
                      {item.status === 'error'
                        ? item.error
                        : item.status === 'success'
                          ? '上传完成'
                          : item.status === 'paused'
                            ? '已暂停'
                            : item.status === 'cancelled'
                              ? '已取消'
                              : `${formatSize(item.uploadedBytes)} / ${formatSize(item.file.size)}`}
                    </Typography.Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
      <Table
        rowKey={(row) => String(row.ID ?? row.id)}
        loading={loading}
        dataSource={rows}
        columns={columns}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件" />,
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          onChange: (next) => {
            setPage(next);
            void load(next);
          },
        }}
      />
      <Modal
        title="编辑文件信息"
        open={Boolean(editing)}
        onCancel={() => setEditing(undefined)}
        onOk={() => void saveEdit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 18 }}>
          <Form.Item
            label="文件名"
            name="name"
            rules={[{ required: true, message: '请输入文件名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input placeholder="例如：头像、文档、附件" />
          </Form.Item>
          <Form.Item label="标签" name="tag">
            <Input placeholder="多个标签可用逗号分隔" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
