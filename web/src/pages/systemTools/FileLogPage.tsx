import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Button,
  Calendar,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { request } from '../../api/request';
import './fileLogs.css';

type LogFile = { name: string; date: string; size: number; modifiedAt: string; legacy: boolean };
type LogList = { list: LogFile[]; consoleOnly: boolean; maxChunkBytes: number };
type LogChunk = {
  file: string;
  content: string;
  startOffset: number;
  nextOffset: number;
  size: number;
  more: boolean;
};
const MAX_TEXT = 1024 * 1024;
const bytes = (value: number) =>
  value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1024 / 1024).toFixed(1)} MB`;

export default function FileLogPage() {
  const { message } = App.useApp();
  const [date, setDate] = useState(dayjs);
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [files, setFiles] = useState<LogFile[]>([]);
  const [consoleOnly, setConsoleOnly] = useState(false);
  const [name, setName] = useState<string>();
  const [chunk, setChunk] = useState<LogChunk>();
  const [query, setQuery] = useState('');
  const [wrap, setWrap] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listSerial = useRef(0);
  const contentSerial = useRef(0);
  const selected = date.format('YYYY-MM-DD');
  const currentFiles = useMemo(() => files.filter((f) => f.date === selected), [files, selected]);
  const file = files.find((f) => f.name === name);
  const loadFiles = useCallback(async () => {
    const seq = ++listSerial.current;
    setListLoading(true);
    try {
      const data = await request<LogList>('/system/file-logs', { params: { month } });
      if (seq === listSerial.current) {
        setFiles(data.list);
        setConsoleOnly(data.consoleOnly);
      }
    } catch {
      /* Request errors are already visible. */
    } finally {
      if (seq === listSerial.current) setListLoading(false);
    }
  }, [month]);
  useEffect(() => {
    void loadFiles();
    return () => {
      listSerial.current++;
    };
  }, [loadFiles]);
  useEffect(() => {
    setName((old) => (currentFiles.some((f) => f.name === old) ? old : currentFiles[0]?.name));
  }, [currentFiles]);
  const loadContent = useCallback(async (fileName: string, tail = true, previous?: LogChunk) => {
    const seq = ++contentSerial.current;
    setLoading(true);
    setError('');
    try {
      const data = await request<LogChunk>('/system/file-logs/content', {
        params: { file: fileName, tail, offset: previous?.nextOffset ?? 0 },
        skipError: true,
      });
      if (seq !== contentSerial.current) return;
      setChunk(
        previous
          ? { ...data, startOffset: previous.startOffset, content: previous.content + data.content }
          : data,
      );
    } catch (e) {
      if (seq === contentSerial.current) setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      if (seq === contentSerial.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setChunk(undefined);
    setError('');
    if (name) void loadContent(name);
    else setLoading(false);
    return () => {
      contentSerial.current++;
    };
  }, [name, loadContent]);
  const choose = (next: Dayjs) => {
    setDate(next);
    setMonth(next.format('YYYY-MM'));
  };
  const text = chunk?.content ?? '';
  const matchingLines = useMemo(
    () =>
      query
        ? text.split('\n').filter((line) => line.toLowerCase().includes(query.toLowerCase()))
        : [],
    [query, text],
  );
  const visible = query ? matchingLines.join('\n') : text;
  return (
    <div className="file-log-layout">
      <Card
        title="文件日志"
        extra={
          <Button
            aria-label="刷新"
            icon={<ReloadOutlined />}
            loading={listLoading}
            onClick={() => void loadFiles()}
          />
        }
      >
        <Calendar
          fullscreen={false}
          value={date}
          onSelect={choose}
          onPanelChange={choose}
          cellRender={(day, info) =>
            info.type === 'date' && files.some((f) => f.date === day.format('YYYY-MM-DD')) ? (
              <Badge status="processing" />
            ) : null
          }
        />
        <Typography.Paragraph type="secondary" style={{ margin: '16px 0 0' }}>
          请选择一个日期来查看日志文件。
        </Typography.Paragraph>
        {consoleOnly && (
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            message="该服务仅显示控制台日志。"
          />
        )}
      </Card>
      <Card
        className="file-log-content"
        title={`${selected} 日志`}
        extra={file ? <Typography.Text type="secondary">{bytes(file.size)}</Typography.Text> : null}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            aria-label="选择文件"
            placeholder="请选择文件"
            value={name}
            style={{ width: 245 }}
            options={currentFiles.map((f) => ({
              value: f.name,
              label: f.name + (f.legacy ? '（旧版）' : ''),
            }))}
            onChange={setName}
          />
          <Button disabled={!name || loading} onClick={() => name && void loadContent(name, false)}>
            从头读取
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!name || loading}
            onClick={() => name && void loadContent(name, true)}
          >
            刷新
          </Button>
          <Button
            icon={<CopyOutlined />}
            disabled={!visible}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(visible);
                message.success('复制成功');
              } catch {
                message.error('复制失败，请手动复制');
              }
            }}
          >
            复制
          </Button>
        </Space>
        {file?.legacy && (
          <Alert
            type="info"
            showIcon
            message="文件位于 server.log，如需编辑请修改后重启服务。"
            style={{ marginBottom: 16 }}
          />
        )}
        <div className="file-log-search">
          <Input.Search
            placeholder="搜索日志内容"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Switch
            checked={wrap}
            onChange={setWrap}
            checkedChildren="已自动换行"
            unCheckedChildren="未自动换行"
            aria-label="自动换行"
          />
        </div>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
        <Spin spinning={loading}>
          {!name ? (
            <Empty description="请先选择日期和文件" />
          ) : (
            <>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {query ? `已找到 ${matchingLines.length} 条匹配记录 · ` : ''}
                {chunk
                  ? `${chunk.startOffset}—${chunk.nextOffset} 行 / ${bytes(chunk.size)}`
                  : '请选择一个文件查看详情'}
              </Typography.Paragraph>
              <pre className={`file-log-text ${wrap ? 'file-log-wrap' : ''}`} aria-label="日志内容">
                {visible || (query ? '无匹配内容' : loading ? '' : '请选择文件查看')}
              </pre>
              {chunk?.more && (
                <Button
                  disabled={loading || chunk.nextOffset - chunk.startOffset >= MAX_TEXT}
                  onClick={() => name && void loadContent(name, false, chunk)}
                >
                  加载更多
                </Button>
              )}
              {chunk && chunk.nextOffset - chunk.startOffset >= MAX_TEXT && (
                <Typography.Paragraph type="secondary">
                  文件较大，已达到单次加载上限；点击"加载更多"可继续加载。
                </Typography.Paragraph>
              )}
            </>
          )}
        </Spin>
      </Card>
    </div>
  );
}
