// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// System parameter list, detail and configuration forms.
import { useCallback, useState } from 'react';
import { Button, Descriptions, Modal } from 'antd';
import { sysParamsApi } from '../../api/endpoints';
import type { SysParams } from '../../domain/system';
import type { PageInfo, PageResult } from '../../types';
import CrudPage from '../../features/crud/CrudPage';
import { f, type CrudField } from '../../features/crud/fieldRenderers';

type ParamsInput = Pick<SysParams, 'name' | 'key' | 'value' | 'desc'>;

// Internal implementation detail.
const listParams = (page: PageInfo): Promise<PageResult<SysParams>> =>
  sysParamsApi.getSysParamsList(page);

// Internal implementation detail.
const fields: CrudField<SysParams>[] = [
  f<SysParams>('CreatedAt', '创建时间', { inForm: false, inTable: { width: 180 } }),
  f<SysParams>('name', '参数名称', {
    required: true,
    inFilter: true,
    placeholder: '请输入参数名称',
  }),
  // Internal implementation detail.
  f<SysParams>('key', '参数键名', {
    required: true,
    inFilter: true,
    disabledInEdit: true,
    placeholder: '请输入参数键名',
  }),
  f<SysParams>('value', '参数值', {
    type: 'textarea',
    required: true,
    placeholder: '请输入参数值',
  }),
  f<SysParams>('desc', '参数描述', { placeholder: '请输入参数描述' }),
];

export default function ParamsPage() {
  // Internal implementation detail.
  const [detail, setDetail] = useState<SysParams | null>(null);

  const openDetail = useCallback(async (row: SysParams) => {
    try {
      const res = await sysParamsApi.findSysParams({ ID: row.ID });
      setDetail(res.resysParams);
    } catch {
      // Internal implementation detail.
    }
  }, []);

  const rowActions = useCallback(
    (row: SysParams) => (
      <Button type="link" size="small" onClick={() => void openDetail(row)}>
        详情
      </Button>
    ),
    [openDetail],
  );

  return (
    <>
      <CrudPage<SysParams, ParamsInput>
        fields={fields}
        list={listParams}
        getDetail={async (id) => (await sysParamsApi.findSysParams({ ID: id })).resysParams}
        create={sysParamsApi.createSysParams}
        updateById={(id, values) => sysParamsApi.updateSysParams({ ...values, ID: id })}
        remove={(row) => sysParamsApi.deleteSysParams(row.ID)}
        removeBatch={(ids) => sysParamsApi.deleteSysParamsByIds(ids)}
        auth={{ add: 'create', edit: 'update', delete: 'delete' }}
        rowActions={rowActions}
      />
      <Modal
        title="参数详情"
        open={detail !== null}
        footer={null}
        onCancel={() => setDetail(null)}
        width={560}
      >
        <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="参数名称">{detail?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="参数键名">{detail?.key ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="参数值">{detail?.value ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="参数描述">{detail?.desc ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Modal>
    </>
  );
}
