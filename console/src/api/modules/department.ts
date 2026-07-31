/**
 * 部门管理 API — 与系统其它模块一致，走 /api 代理 + 登录页保存的 token
 * 接口文档：POST/PUT/DELETE/GET /api/departments...
 */

import { request } from '../request';
import type {
  Department,
  DepartmentTree,
  DepartmentList,
  CreateDepartmentBody,
  UpdateDepartmentBody,
} from '../types/department';

export const departmentApi = {
  getTree: () =>
    request<DepartmentTree>('/departments/tree'),

  getList: () =>
    request<DepartmentList>('/departments/list'),

  getOne: (id: number) =>
    request<Department>(`/departments/${id}`),

  /** 查询用户所属部门 id */
  getUserDepartment: (userId: number) =>
    request<{ user_id: number; department_id: number | null }>(
      `/departments/users/${userId}`,
    ),

  create: (body: CreateDepartmentBody) =>
    request<Department>('/departments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (body: UpdateDepartmentBody) =>
    request<Department>('/departments', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  remove: (id: number) =>
    request<{ message: string }>(`/departments/${id}`, {
      method: 'DELETE',
    }),
};
