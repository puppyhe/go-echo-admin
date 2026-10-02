import { Button } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';

type Props = { disabled?: boolean; onUploadingChange?: (uploading: boolean) => void };

/** Attachment selection is intentionally disabled until a supported media API is configured. */
export default function AttachmentPicker({ disabled = false }: Props) {
  return <Button icon={<PaperClipOutlined />} disabled={disabled}>附件</Button>;
}
