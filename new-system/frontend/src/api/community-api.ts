import {apiFetch} from './auth-api';

export type Announcement = {
  id: string;
  title: string;
  content: string;
  category: 'feature' | 'notice' | 'maintenance' | 'exam';
  pinned: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LearnerFeedback = {
  id: string;
  category: 'feature' | 'bug' | 'course' | 'chat';
  title: string;
  content: string;
  status: 'pending' | 'reviewed' | 'planned' | 'replied' | 'closed';
  admin_reply: string;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

export const announcementCategories: Record<Announcement['category'], string> = {
  feature: '新功能',
  notice: '全站通知',
  exam: '备考提醒',
  maintenance: '维护公告',
};

export const feedbackCategories: Record<LearnerFeedback['category'], string> = {
  feature: '想要新功能',
  bug: '问题反馈',
  course: '课程与题库建议',
  chat: '想说的话',
};

export const feedbackStates: Record<LearnerFeedback['status'], string> = {
  pending: '待处理',
  reviewed: '已查看',
  planned: '已采纳',
  replied: '已回复',
  closed: '已关闭',
};

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch('/api/v1' + path, {cache: 'no-store', ...init});
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || '请求失败，请稍后重试。');
  }
  return response;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  return (await request('/announcements')).json();
}

export async function fetchMyFeedback(): Promise<LearnerFeedback[]> {
  return (await request('/feedback')).json();
}

export async function submitFeedback(payload: {category: string; title: string; content: string}): Promise<LearnerFeedback> {
  return (await request('/feedback', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  })).json();
}

export async function withdrawFeedback(id: string): Promise<void> {
  await request('/feedback/' + encodeURIComponent(id), {method: 'DELETE'});
}
