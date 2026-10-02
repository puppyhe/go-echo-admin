// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useState } from 'react';
import { App, Button, Upload } from 'antd';
import { DownloadOutlined, FileExcelOutlined, UploadOutlined } from '@ant-design/icons';
import { sysExportTemplateApi } from '../../api/endpoints';
import { downloadByUrl } from '../../api/download';

export default function ApiExcelToolbar({ onImported }: { onImported: () => void }) {
  const { message } = App.useApp();
  const [downloading, setDownloading] = useState<'template' | 'data' | null>(null);
  const [importing, setImporting] = useState(false);
  const download = async (kind: 'template' | 'data') => {
    setDownloading(kind);
    try {
      const result =
        kind === 'template'
          ? await sysExportTemplateApi.exportTemplate({ templateID: 'api' })
          : await sysExportTemplateApi.exportExcel({ templateID: 'api' });
      await downloadByUrl(result.url, {
        filename: kind === 'template' ? 'APIimporttemplate.xlsx' : 'APIlist.xlsx',
      });
      message.success('下载成功');
    } catch {
      // Internal implementation detail.
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <Button
        icon={<FileExcelOutlined />}
        loading={downloading === 'template'}
        disabled={Boolean(downloading && downloading !== 'template')}
        onClick={() => void download('template')}
      >
        downloadtemplate
      </Button>
      <Button
        icon={<DownloadOutlined />}
        loading={downloading === 'data'}
        disabled={Boolean(downloading && downloading !== 'data')}
        onClick={() => void download('data')}
      >
        export
      </Button>
      <Upload
        accept=".xlsx"
        showUploadList={false}
        maxCount={1}
        disabled={importing}
        beforeUpload={async (file) => {
          if (!file.name.toLowerCase().endsWith('.xlsx')) {
            message.error('请选择 .xlsx 格式的 Excel 文件');
            return Upload.LIST_IGNORE;
          }
          setImporting(true);
          try {
            await sysExportTemplateApi.importExcel(file, 'api');
            message.success('导入成功');
            onImported();
          } catch {
            // Internal implementation detail.
          } finally {
            setImporting(false);
          }
          return false;
        }}
      >
        <Button icon={<UploadOutlined />} loading={importing}>
          import
        </Button>
      </Upload>
    </>
  );
}
