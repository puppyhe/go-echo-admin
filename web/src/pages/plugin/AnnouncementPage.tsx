import { FileLink } from '../../features/upload/AuthenticatedAsset';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { announcementApi } from '../../api/endpoints';
import { fileUrl } from '../../api/request';
import { useAuth } from '../../auth/AuthContext';
import type { Info } from '../../domain/systemTools';
import RichTextEditor from './announcement/RichTextEditor';
import AttachmentPicker from './announcement/AttachmentPicker';
import { normalizeAttachments, type AnnouncementAttachment } from './announcement/attachments';
import {
  richTextFragment,
  richTextNodes,
  richTextPlainText,
  sanitizeRichText,
} from './announcement/richText';
import './announcement/announcement.css';

interface Announcement extends Omit<Info, 'attachments'> {
  attachments: AnnouncementAttachment[];
}
interface FormValues {
  title: string;
  content: string;
  userID: number;
  attachments: AnnouncementAttachment[];
}
interface SearchValues {
  keyword?: string;
  dates?: [dayjs.Dayjs, dayjs.Dayjs];
}

export default function AnnouncementPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<number>();
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [viewing, setViewing] = useState<Announcement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [authors, setAuthors] = useState<{ label: string; value: number }[]>([]);
  const [authorsError, setAuthorsError] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const [searchForm] = Form.useForm<SearchValues>();
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const uploading = imageUploading || attachmentUploading;

  const loadList = useCallback(async () => {
    const id = ++listRequest.current;
    setLoading(true);
    try {
      const result = await announcementApi.getInfoList({ page, pageSize, ...filters });
      if (id !== listRequest.current) return;
      setRows(
        result.list.map((row) => ({ ...row, attachments: normalizeAttachments(row.attachments) })),
      );
      setTotal(result.total);
      setSelected([]);
    } catch {
      // Internal implementation detail.
    } finally {
      if (id === listRequest.current) setLoading(false);
    }
  }, [page, pageSize, filters]);
  const loadAuthors = useCallback(async () => {
    setAuthorsError(false);
    try {
      const source = await announcementApi.getInfoDataSource();
      setAuthors(
        (source.users ?? []).map((author) => ({
          value: author.id,
          label: author.nickName || `user ${author.id}`,
        })),
      );
    } catch {
      setAuthorsError(true);
    }
  }, []);
  useEffect(() => {
    void loadList();
    return () => {
      listRequest.current += 1;
    };
  }, [loadList]);
  useEffect(() => {
    void loadAuthors();
  }, [loadAuthors]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ title: '', content: '', userID: user?.ID, attachments: [] });
    setFormOpen(true);
  };
  const openDetail = async (row: Announcement, mode: 'edit' | 'view') => {
    const id = ++detailRequest.current;
    setOpening(row.ID);
    try {
      const response = await announcementApi.findInfo({ ID: row.ID });
      if (id !== detailRequest.current) return;
      const info = { ...response, attachments: normalizeAttachments(response.attachments) };
      if (mode === 'view') setViewing(info);
      else {
        setEditing(info);
        form.resetFields();
        form.setFieldsValue(info);
        setFormOpen(true);
      }
    } catch {
      // Internal implementation detail.
    } finally {
      if (id === detailRequest.current) setOpening(undefined);
    }
  };
  const closeForm = () => {
    if (!uploading && !saving) setFormOpen(false);
  };
  const save = async () => {
    if (uploading) return;
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: values.title.trim(),
        content: sanitizeRichText(values.content),
        userID: values.userID,
        attachments: normalizeAttachments(values.attachments),
      };
      if (editing) await announcementApi.updateInfo({ ID: editing.ID, ...payload });
      else await announcementApi.createInfo(payload);
      message.success(editing ? '更新成功' : '新建成功');
      setFormOpen(false);
      void loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };
  const remove = async (ids: number[]) => {
    try {
      if (ids.length === 1) await announcementApi.deleteInfo(ids[0]);
      else await announcementApi.deleteInfoByIds(ids);
      message.success('删除成功');
      setSelected([]);
      if (page > 1 && rows.every((row) => ids.includes(row.ID))) setPage(page - 1);
      else void loadList();
    } catch {
      // Internal implementation detail.
    }
  };
  const authorName = (id?: number) =>
    authors.find((author) => author.value === id)?.label || (id ? `user ${id}` : '未知');
  const attachmentLinks = (files: AnnouncementAttachment[]) => (
    <Space size={[4, 4]} wrap>
      {files.map((file) => (
        <FileLink key={file.url} href={file.url} target="_blank" rel="noopener noreferrer">
          <PaperClipOutlined /> {file.name}
        </FileLink>
      ))}
    </Space>
  );
  const columns: TableColumnsType<Announcement> = [
    {
      title: '创建时间',
      dataIndex: 'CreatedAt',
      width: 180,
      render: (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '标题',
      dataIndex: 'title',
      width: 240,
      render: (value, row) => (
        <Button
          type="link"
          className="announcement-title-link"
          onClick={() => void openDetail(row, 'view')}
        >
          {value}
        </Button>
      ),
    },
    {
      title: '内容',
      dataIndex: 'content',
      width: 300,
      render: (value) => (
        <Typography.Text ellipsis={{ tooltip: true }} style={{ maxWidth: 280 }}>
          {richTextPlainText(value ?? '') || '暂无内容'}
        </Typography.Text>
      ),
    },
    { title: '作者', dataIndex: 'userID', width: 130, render: authorName },
    {
      title: 'attachment',
      dataIndex: 'attachments',
      width: 240,
      render: (files) => (files.length ? attachmentLinks(files) : '-'),
    },
    {
      title: '操作',
      width: 240,
      fixed: 'right',
      render: (_value, row) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            loading={opening === row.ID}
            onClick={() => void openDetail(row, 'view')}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => void openDetail(row, 'edit')}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除这条记录吗？" onConfirm={() => remove([row.ID])}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card className="filter-card">
        <Form<SearchValues>
          form={searchForm}
          layout="inline"
          onFinish={(values) => {
            const next: Record<string, string> = {};
            if (values.keyword?.trim()) next.keyword = values.keyword.trim();
            if (values.dates?.[0] && values.dates?.[1]) {
              next.startCreatedAt = values.dates[0].toISOString();
              next.endCreatedAt = values.dates[1].toISOString();
            }
            setFilters(next);
            setPage(1);
          }}
        >
          <Form.Item name="dates" label="创建时间">
            <DatePicker.RangePicker showTime placeholder={['开始时间', '结束时间']} />
          </Form.Item>
          <Form.Item name="keyword" label="关键词">
            <Input placeholder="标题或内容" allowClear />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  searchForm.resetFields();
                  setFilters({});
                  setPage(1);
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card className="table-card">
        <div className="table-toolbar announcement-list-toolbar">
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建
            </Button>
            <Popconfirm
              title={`确认删除选中的 ${selected.length} 条记录吗？`}
              onConfirm={() => remove(selected)}
            >
              <Button icon={<DeleteOutlined />} disabled={!selected.length}>
                删除
              </Button>
            </Popconfirm>
          </Space>
          <Button aria-label="刷新" icon={<ReloadOutlined />} onClick={() => void loadList()} />
        </div>
        <Table<Announcement>
          rowKey="ID"
          dataSource={rows}
          columns={columns}
          loading={loading}
          scroll={{ x: 1300 }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys.map(Number)),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: [10, 30, 50, 100],
            showTotal: (count) => `共 ${count} 条`,
            onChange: (next, size) => {
              setPage(next);
              setPageSize(size);
            },
          }}
        />
      </Card>
      <Drawer
        title={editing ? '编辑公告' : '新建公告'}
        width="min(860px, 96vw)"
        open={formOpen}
        onClose={closeForm}
        destroyOnHidden
        extra={
          <Space>
            <Button disabled={uploading || saving} onClick={closeForm}>
              取消
            </Button>
            <Button
              type="primary"
              loading={saving}
              disabled={uploading}
              onClick={() => void save()}
            >
              确定
            </Button>
          </Space>
        }
        getContainer={() => document.body}
      >
        <Form form={form} layout="vertical" disabled={saving}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, whitespace: true, message: '请输入标题' }]}
          >
            <Input placeholder="请输入标题" maxLength={255} showCount />
          </Form.Item>
          <Form.Item
            name="content"
            label="内容"
            rules={[
              {
                validator: (_rule, value: string | undefined) =>
                  value &&
                  (richTextPlainText(value) || richTextFragment(value).querySelector('img'))
                    ? Promise.resolve()
                    : Promise.reject(new Error('请输入内容')),
              },
            ]}
          >
            <RichTextEditor disabled={saving} onUploadingChange={setImageUploading} />
          </Form.Item>
          {authorsError && (
            <Alert
              type="warning"
              message="列表加载失败"
              action={
                <Button size="small" onClick={() => void loadAuthors()}>
                  重试
                </Button>
              }
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item name="userID" label="作者" rules={[{ required: true, message: '请选择作者' }]}>
            <Select
              options={
                authors.length
                  ? authors
                  : user
                    ? [{ value: user.ID, label: user.nickName || user.userName }]
                    : []
              }
              showSearch
              optionFilterProp="label"
              placeholder="请选择作者"
            />
          </Form.Item>
          <Form.Item name="attachments" label="附件">
            <AttachmentPicker disabled={saving} onUploadingChange={setAttachmentUploading} />
          </Form.Item>
        </Form>
      </Drawer>
      <Drawer
        title="详情"
        width="min(860px, 96vw)"
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        destroyOnHidden
        getContainer={() => document.body}
      >
        {viewing && (
          <article>
            <Typography.Title level={2}>{viewing.title}</Typography.Title>
            <Descriptions
              size="small"
              column={2}
              items={[
                { key: 'author', label: '作者', children: authorName(viewing.userID) },
                {
                  key: 'date',
                  label: '发布时间',
                  children: viewing.CreatedAt
                    ? dayjs(viewing.CreatedAt).format('YYYY-MM-DD HH:mm')
                    : '-',
                },
              ]}
            />
            <div className="announcement-rich-content announcement-detail">
              {richTextNodes(viewing.content, (url) => fileUrl(url) ?? url)}
            </div>
            <Typography.Title level={5}>附件</Typography.Title>
            {viewing.attachments.length ? (
              attachmentLinks(viewing.attachments)
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无附件" />
            )}
          </article>
        )}
      </Drawer>
    </div>
  );
}
