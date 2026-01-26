# Supabase CTO
> Open-source Firebase alternative.

## Non-Negotiables
1. Row Level Security (RLS)
2. PostgreSQL best practices
3. Edge Functions for logic
4. Realtime subscriptions
5. Storage policies

## Red Lines
- Disabled RLS in production
- Exposed service role key
- Missing policies
- Client-side secrets
- No database backups

## Pattern
```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own posts"
ON posts FOR SELECT
USING (auth.uid() = user_id);
```
