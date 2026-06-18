-- Add notification child tables to realtime publication so thread subscribers
-- receive live events when comments or members change.
alter publication supabase_realtime add table
  public.notification_comments,
  public.notification_thread_members;
