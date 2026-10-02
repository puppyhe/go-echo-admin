import { useAssetUrl } from './AuthenticatedAsset';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Internal implementation detail.
// Internal implementation detail.
import { useState } from 'react';
import { App, Image, Upload } from 'antd';
import type { UploadProps } from 'antd';
import {
  DeleteOutlined,
  EyeOutlined,
  LoadingOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { fileUrl, uploadFile } from '../../api/request';

// Internal implementation detail.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageUploadProps {
  // Internal implementation detail.
  value?: string;
  // Internal implementation detail.
  onChange?: (url: string) => void;
  // Internal implementation detail.
  maxSizeMb?: number;
  // Internal implementation detail.
  disabled?: boolean;
}

export default function ImageUpload({
  value = '',
  onChange,
  maxSizeMb = 2,
  disabled = false,
}: ImageUploadProps) {
  const { message } = App.useApp();
  const assetUrl = useAssetUrl(value);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const beforeUpload: UploadProps['beforeUpload'] = async (file) => {
    // Internal implementation detail.
    if (!ALLOWED_TYPES.includes(file.type)) {
      message.error('请上传 jpg、png、webp 格式的图片！');
      return Upload.LIST_IGNORE;
    }
    // Internal implementation detail.
    if (file.size / 1024 / 1024 > maxSizeMb) {
      message.error(`图片大小不能超过 ${maxSizeMb}MB！`);
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      const result = await uploadFile(file);
      onChange?.(result.file.url);
    } catch {
      // Internal implementation detail.
    } finally {
      setUploading(false);
    }
    // Internal implementation detail.
    return false;
  };

  return (
    <div>
      <Upload
        listType="picture-card"
        maxCount={1}
        accept={ALLOWED_TYPES.join(',')}
        showUploadList={false}
        beforeUpload={beforeUpload}
        disabled={disabled}
      >
        {value ? (
          // Internal implementation detail.
          // Internal implementation detail.
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <img
              src={assetUrl}
              alt="图片预览"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {!disabled && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 10,
                  paddingBottom: 4,
                  fontSize: 15,
                  background: 'linear-gradient(transparent 55%, rgba(0, 0, 0, 0.45))',
                }}
              >
                <a
                  title="预览"
                  style={{ color: '#fff' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewOpen(true);
                  }}
                >
                  <EyeOutlined />
                </a>
                <a title="替换图片" style={{ color: '#fff' }}>
                  <SwapOutlined />
                </a>
                <a
                  title="删除"
                  style={{ color: '#fff' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange?.('');
                  }}
                >
                  <DeleteOutlined />
                </a>
              </div>
            )}
          </div>
        ) : (
          <div>
            {uploading ? <LoadingOutlined /> : <PlusOutlined />}
            <div style={{ marginTop: 8 }}>{uploading ? '上传中' : '上传图片'}</div>
          </div>
        )}
      </Upload>
      {value && (
        <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
          点击图片可重新上传
        </div>
      )}
      {/* 图片：支持点击预览 */}
      {value && (
        <Image
          wrapperStyle={{ display: 'none' }}
          preview={{ visible: previewOpen, onVisibleChange: setPreviewOpen }}
          src={assetUrl}
        />
      )}
    </div>
  );
}
