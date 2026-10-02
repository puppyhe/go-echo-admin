// Internal implementation detail.
import { sysLoginLogApi, sysOperationRecordApi, sysParamsApi } from '../api/endpoints';
import type { PageInfo, PageResult } from '../types';
import type { SysLoginLog, SysOperationRecord, SysParams } from '../domain/system';

export const systemService = {
  operation: {
    page: (params: Partial<PageInfo> = {}): Promise<PageResult<SysOperationRecord>> =>
      sysOperationRecordApi.getSysOperationRecordList({ page: 1, pageSize: 10, ...params }),
    remove: (ID: number) => sysOperationRecordApi.deleteSysOperationRecord({ ID }),
    removeByIds: (ids: number[]) => sysOperationRecordApi.deleteSysOperationRecordByIds({ ids }),
  },
  loginLog: {
    page: (params: Partial<PageInfo> = {}): Promise<PageResult<SysLoginLog>> =>
      sysLoginLogApi.getLoginLogList({ page: 1, pageSize: 10, ...params }),
    remove: (ID: number) => sysLoginLogApi.deleteLoginLog({ ID }),
    removeByIds: (ids: number[]) => sysLoginLogApi.deleteLoginLogByIds({ ids }),
  },
  params: {
    page: (params: Partial<PageInfo> = {}): Promise<PageResult<SysParams>> =>
      sysParamsApi.getSysParamsList({ page: 1, pageSize: 10, ...params }),
    create: sysParamsApi.createSysParams,
    update: sysParamsApi.updateSysParams,
    remove: (ID: number) => sysParamsApi.deleteSysParams(ID),
    removeByIds: (ids: number[]) => sysParamsApi.deleteSysParamsByIds(ids),
    getByKey: (key: string) => sysParamsApi.getSysParam(key),
  },
};
