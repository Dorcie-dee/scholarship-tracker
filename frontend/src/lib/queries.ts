'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './api-client';
import type { ApplicantProfile, Application, ApplicationJourney, Task } from './types';

// --- Journeys -------------------------------------------------------------

export function useJourneys() {
  return useQuery({
    queryKey: ['journeys'],
    queryFn: () => apiGet<ApplicationJourney[]>('/journeys'),
  });
}

export function useJourney(id: string) {
  return useQuery({
    queryKey: ['journeys', id],
    queryFn: () => apiGet<ApplicationJourney>(`/journeys/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateJourney() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { title: string; goal?: string }) =>
      apiPost<ApplicationJourney>('/journeys', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journeys'] }),
  });
}

// --- Applications -----------------------------------------------------------

export function useApplications(journeyId: string) {
  return useQuery({
    queryKey: ['applications', journeyId],
    queryFn: () => apiGet<Application[]>(`/applications?journeyId=${journeyId}`),
    enabled: Boolean(journeyId),
  });
}

export function useCreateApplication(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { title: string; applicationType?: string }) =>
      apiPost<Application>('/applications', { ...dto, journeyId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['applications', journeyId] }),
  });
}

// --- Tasks ------------------------------------------------------------------

export function useTasks(journeyId: string) {
  return useQuery({
    queryKey: ['tasks', journeyId],
    queryFn: () => apiGet<Task[]>(`/tasks?journeyId=${journeyId}`),
    enabled: Boolean(journeyId),
  });
}

export function useCreateTask(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { title: string; priority?: string; dueDate?: string; applicationId?: string }) =>
      apiPost<Task>('/tasks', { ...dto, journeyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', journeyId] }),
  });
}

export function useUpdateTaskStatus(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<Task>(`/tasks/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', journeyId] }),
  });
}

// --- Profile ------------------------------------------------------------------

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<ApplicantProfile>('/profile'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<ApplicantProfile>) => apiPatch<ApplicantProfile>('/profile', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}
