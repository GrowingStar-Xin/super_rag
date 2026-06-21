import { client } from '@/client/client.gen'
import { formatApiError } from '@/utils/errors'

// antd v6 静态 message API 已弃用，改用回调模式由 App 组件注入
let _notifyError: ((msg: string) => void) | null = null
export function setNotifyError(fn: (msg: string) => void) {
  _notifyError = fn
}

client.setConfig({
  baseUrl: '',
  throwOnError: true,
})

client.interceptors.response.use(async (response) => {
  if (!response.ok) {
    _notifyError?.(await formatApiError(response))
  }
  return response
})

import { getAuthToken, useAuthStore } from '@/stores/authStore'
client.interceptors.request.use((request) => {
  const token = getAuthToken()
  if (token && !request.headers.has('Authorization')) {
    request.headers.set('Authorization', `Bearer ${token}`)
  }
  return request
})

let redirectingToLogin = false

client.interceptors.response.use(async (response) => {
  if (response.status === 401) {
    useAuthStore.getState().logout()
    if (!redirectingToLogin && window.location.pathname !== '/login') {
      redirectingToLogin = true
      const back = window.location.pathname + window.location.search
      window.location.replace(`/login?back=${encodeURIComponent(back)}`)
    }
    if (window.location.pathname === '/login') {
      _notifyError?.(await formatApiError(response))
    }
    return response
  }
  if (!response.ok) {
    _notifyError?.(await formatApiError(response))
  }
  return response
})