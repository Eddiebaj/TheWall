-- Tracks users who are "down tonight" — shown to friends for up to 8 hours
CREATE TABLE IF NOT EXISTS public.city_board_down_tonight (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_city_board_down_tonight_expires ON public.city_board_down_tonight (expires_at);

ALTER TABLE public.city_board_down_tonight ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Publicly readable"
  ON public.city_board_down_tonight FOR SELECT USING (true);

CREATE POLICY "Users manage own row"
  ON public.city_board_down_tonight FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
