'use client';

import {
  AuthResponseSchema,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from '@forgeops/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared';

/** Query keys live next to the hooks that use them: one definition, no string typos. */
export const authKeys = {
  me: ['auth', 'me'] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async ({ signal }): Promise<User> =>
      (await api.request('/auth/me', { schema: AuthResponseSchema, signal })).user,
    retry: false, // a 401 means "not signed in", not "try again"
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginRequest) =>
      (await api.request('/auth/login', { method: 'POST', body, schema: AuthResponseSchema })).user,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterRequest) =>
      (await api.request('/auth/register', { method: 'POST', body, schema: AuthResponseSchema }))
        .user,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.request('/auth/logout', { method: 'POST', schema: null }),
    // Drop every cached response: the next user must never see the previous user's data.
    onSettled: () => {
      queryClient.clear();
    },
  });
}
