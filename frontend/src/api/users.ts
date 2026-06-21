import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {usersListKey} from "@/api/queryKeys.ts";
import type {UserCreate} from "@/client";
import {
    createUser as sdkCreateUser,
    listUsers as sdkListUsers,
} from '@/client/sdk.gen'

export function useUsers(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: usersListKey(page, pageSize),
    queryFn: async () =>
      (await sdkListUsers({ query: { page, page_size: pageSize } })).data,
  })
}

export function useCreateUserMutation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UserCreate) =>
      (await sdkCreateUser({ body: payload })).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['users'] })
    },
  })
}