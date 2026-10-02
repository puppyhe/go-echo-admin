import { FileLink } from './AuthenticatedAsset';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Internal implementation detail.
// Internal implementation detail.
import { useState } from 'react';
import { App, Button, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { DeleteOutlined, LinkOutlined, UploadOutlined } from '@ant-design/icons';
import { fileUrl, uploadFile } from '../../api/request';

// Internal implementation detail.
function fileNameOf(url: string): string {
  const last = url.split('?')[0].split('#')[0].split('/').pop() || 'attachment';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export interface FileUploadProps {
  // Internal implementation detail.
  value?: string;
  // Internal implementation detail.
  onChange?: (url: string) => void;
  // Internal implementation detail.
  maxSizeMb?: number;
  // Internal implementation detail.
  accept?: string;
  // Internal implementation detail.
  buttonText?: string;
  // Internal implementation detail.
  disabled?: boolean;
}

export default function FileUpload({
  value = '',
  onChange,
  maxSizeMb = 10,
  accept,
  buttonText = '上传文件',
  disabled = false,
}: FileUploadProps) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  // Internal implementation detail.
  const [uploadedName, setUploadedName] = useState('');

  const beforeUpload: UploadProps['beforeUpload'] = async (file) => {
    if (file.size / 1024 / 1024 > maxSizeMb) {
      message.error(`文件大小不能超过 ${maxSizeMb}MB！`);
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      const result = await uploadFile(file);
      setUploadedName(result.file.name || file.name);
      onChange?.(result.file.url);
    } catch {
      // Internal implementation detail.
    } finally {
      setUploading(false);
    }
    // Internal implementation detail.
    return false;
  };

  const displayName = uploadedName || fileNameOf(value);

  return (
    <div>
      <Upload
        showUploadList={false}
        accept={accept}
        beforeUpload={beforeUpload}
        disabled={disabled}
      >
        <Button icon={<UploadOutlined />} loading={uploading} disabled={disabled}>
          {buttonText}
        </Button>
      </Upload>
      {value && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileLink href={value} target="_blank" rel="noreferrer">
            <LinkOutlined /> {displayName}
          </FileLink>
          {!disabled && (
            <a
              onClick={() => {
                setUploadedName('');
                onChange?.('');
              }}
              style={{ color: '#ff4d4f' }}
            >
              <DeleteOutlined /> 删除
            </a>
          )}
        </div>
      )}
    </div>
  );
}
