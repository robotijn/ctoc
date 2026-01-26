# Supabase CTO
> Open-source Firebase alternative built on PostgreSQL.

## Commands
```bash
# Setup | Dev | Test
npx supabase init
npx supabase start
npx supabase db diff --schema public
```

## Non-Negotiables
1. Row Level Security (RLS) on all tables
2. PostgreSQL best practices throughout
3. Edge Functions for serverless logic
4. Realtime subscriptions for live data
5. Storage policies for file access control
6. Service role key never exposed to client

## Red Lines
- RLS disabled in production tables
- Service role key in client-side code
- Missing RLS policies on tables
- Secrets in client-accessible locations
- No database backup strategy

## Pattern: Secure Data Access
```sql
-- Enable RLS on table
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own posts
CREATE POLICY "Users read own posts" ON posts
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own posts
CREATE POLICY "Users insert own posts" ON posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own posts
CREATE POLICY "Users update own posts" ON posts
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Public read access
CREATE POLICY "Public profiles readable" ON profiles
    FOR SELECT USING (true);

-- Storage policy for user uploads
CREATE POLICY "Users upload to own folder" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'avatars' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
```

```typescript
import { createClient } from '@supabase/supabase-js'

// Client with anon key (safe for browser)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Realtime subscription
const channel = supabase
  .channel('posts')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'posts' },
    (payload) => console.log('New post:', payload)
  )
  .subscribe()

// Query with RLS (only returns user's data)
const { data, error } = await supabase
  .from('posts')
  .select('*')
  .order('created_at', { ascending: false })
```

## Integrates With
- **Auth**: Built-in authentication providers
- **Storage**: S3-compatible object storage
- **Functions**: Deno-based Edge Functions

## Common Errors
| Error | Fix |
|-------|-----|
| `new row violates RLS policy` | Check policy conditions |
| `permission denied for table` | Enable RLS and add policies |
| `JWT expired` | Refresh session token |
| `relation does not exist` | Run migrations with `supabase db push` |

## Prod Ready
- [ ] RLS enabled on all tables
- [ ] Policies for all access patterns
- [ ] Service role key server-side only
- [ ] Point-in-time recovery enabled
- [ ] Edge Functions for sensitive logic
