# RouteO Feature Backlog

---

## 1. Trip Planner + Place Card UX Redesign

**Place card (venue tap on map):**
- "From here" and "To here" buttons at the bottom of every venue card — tapping either pre-fills the route planner with that place and opens inline plan mode
- Star rating, review count, open/closed status in one line below the place name
- Community photos in a horizontal scroll if available

**Route results sheet:**
- "Fastest" and "Shortest Walk" tags on route options
- Visual time bar (walk/bus/walk proportions) on each route card
- Live arrival times inline on each route option
- Each route card swipeable left to reveal the map view of that route

**Route detail (active trip):**
- Left side vertical timeline with icons (walk/bus/walk)
- Each bus stop row shows live arrivals inline
- "X stops · Y min" expandable to show intermediate stops
- Destination card at bottom with photos if available

---

## 2. Community Reviews + Photo Submission for Venue Cards

**Supabase table:**
```sql
CREATE TABLE place_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id text NOT NULL,
  place_name text NOT NULL,
  device_id text NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  review_text text CHECK (length(review_text) <= 280),
  photo_url text,
  approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

**Backend — add to community.js:**
- `POST ?action=review.submit` — accepts `place_id`, `place_name`, `device_id`, `rating`, `review_text`, `photo_url` (optional, 500KB cap). Claude moderates text. Auto-approves if confidence >= 70, rejects if < 40, flags for review otherwise.
- `GET ?action=review.list&place_id=xxx` — returns approved reviews with avg rating and count

**Frontend — add to venue bottom sheet:**
- Star rating row (1–5 tappable stars) with average score and review count
- Latest 2–3 reviews shown inline with reviewer's first initial and transit context ("Near stop #0322")
- "Add review" button — opens modal with star picker, 280-char text input, optional photo upload
- Photo submissions show in a horizontal scroll at top of venue card
