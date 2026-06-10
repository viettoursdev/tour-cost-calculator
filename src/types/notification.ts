export type NotificationType =
  | 'payment_due'
  | 'payment_approval'
  | 'collab_invite'
  | 'announcement'
  | 'task'
  | 'collab_comment';

/** A link from a notification to a domain object. */
export type NotifLink = {
  kind: 'quote' | 'contract' | 'itinerary' | 'menu' | 'collab';
  id: string;       // cloudId / contract id / itinerary id …
  label: string;    // human label shown on the chip
};

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdBy: string;
  createdAt: string;
  read: boolean;
  link?: NotifLink;
  threadId?: string;   // shared comment thread (collaboration group)
  data?: Record<string, unknown>;
};

/** A single comment in a shared notification thread. */
export type NotifComment = {
  id: string;
  by: string;       // username
  byName: string;
  text: string;
  at: string;       // ISO
};

/**
 * A shared comment thread, visible only to its members (the collaboration
 * group of a project). Stored in `notification_threads/{id}`.
 */
export type NotifThread = {
  id: string;
  title: string;
  members: string[];   // usernames allowed to view/comment
  link?: NotifLink;
  comments: NotifComment[];
  createdAt: string;
  createdBy: string;
};
