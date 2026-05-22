-- Posts table: user-generated content tied to events (used for Activity feed and Venue Moments)
CREATE TABLE IF NOT EXISTS public.posts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id   uuid        REFERENCES public.events(id) ON DELETE SET NULL,
  content    text,
  media_url  text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id    ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_event_id   ON public.posts (event_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are publicly readable"
  ON public.posts FOR SELECT USING (true);

CREATE POLICY "Users can create own posts"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
