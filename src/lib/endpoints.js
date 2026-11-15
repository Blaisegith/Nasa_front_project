/**
 * Points d'entrée de l'API Frame in Freefall.
 *
 * Ce fichier est le seul endroit qui connaît les chemins HTTP. Les composants
 * appellent ces fonctions, jamais `fetch` directement.
 */

import { api } from './apiClient.js';

const CHAT_TIMEOUT_MS = 120000;

export const endpoints = {
  // --- Santé / capacités -----------------------------------------------------
  health: () => api.get('/api/v1/system/health'),
  capabilities: () => api.get('/api/v1/system/capabilities'),

  // --- Session ---------------------------------------------------------------
  createSession: (email, displayName) =>
    api.post('/api/v1/auth/session', { email, display_name: displayName || undefined }),

  getSession: () => api.get('/api/v1/auth/session'),

  deleteSession: () => api.del('/api/v1/auth/session'),

  // --- Profil ----------------------------------------------------------------
  getProfile: () => api.get('/api/v1/profile'),

  updateProfile: (payload) => api.patch('/api/v1/profile', payload),

  uploadAvatar: (blob, filename) => {
    const form = new FormData();
    form.append('file', blob, filename);
    return api.upload('/api/v1/profile/avatar', form);
  },

  // --- Conversations ---------------------------------------------------------
  listConversations: (limit = 20, offset = 0) =>
    api.get(`/api/v1/conversations?limit=${limit}&offset=${offset}`),

  createConversation: (title) => api.post('/api/v1/conversations', { title }),

  getConversation: (conversationId) => api.get(`/api/v1/conversations/${conversationId}`),

  deleteConversation: (conversationId) => api.del(`/api/v1/conversations/${conversationId}`),

  // --- Chat ------------------------------------------------------------------
  chat: (payload) =>
    api.post('/api/v1/chat', payload, { timeout: CHAT_TIMEOUT_MS }),

  uploadChatAttachment: (blob, filename) => {
    const form = new FormData();
    form.append('file', blob, filename);
    return api.upload('/api/v1/chat/attachments', form);
  },

  chatAttachmentUrl: (attachmentId) => `/api/v1/chat/attachments/${attachmentId}`,

  // --- Multimodal / science (non branchés) -----------------------------------
  searchMedia: (query, options = {}) => {
    const params = new URLSearchParams({ q: query });
    if (options.mediaType) params.set('media_type', options.mediaType);
    if (options.experiment) params.set('experiment', options.experiment);
    return api.get(`/api/v1/media/search?${params.toString()}`);
  },
};

/**
 * Un adaptateur non branché renvoie `501 not_implemented`.
 * Le message affiché est fourni par l'i18n (`answer.serviceUnavailable`).
 */
export function isServiceUnavailable(error) {
  return error?.code === 'not_implemented';
}