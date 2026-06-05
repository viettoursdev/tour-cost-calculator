export type NotificationType = 'payment_due' | 'payment_approval' | 'collab_invite';

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdBy: string;
  createdAt: string;
  read: boolean;
  data?: Record<string, unknown>;
};
