# Supabase CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx supabase init
npx supabase start  # Local development
# Client
npm install @supabase/supabase-js
```

## Claude's Common Mistakes
1. **RLS disabled on tables** - Row Level Security is essential for Supabase
2. **Service key in client code** - Service key bypasses RLS; server-only
3. **Missing RLS policies** - Tables with RLS need explicit policies
4. **Direct database URL in client** - Use Supabase client with anon key
5. **No policy for each operation** - Need SELECT, INSERT, UPDATE, DELETE

## Correct Patterns (2026)
```sql
-- ALWAYS enable RLS on tables
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users read own posts
CREATE POLICY "Users read own posts" ON posts
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users insert own posts
CREATE POLICY "Users insert own posts" ON posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users update own posts
CREATE POLICY "Users update own posts" ON posts
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Public readable (no auth required)
CREATE POLICY "Public profiles readable" ON profiles
    FOR SELECT USING (true);
```

```typescript
import { createClient } from '@supabase/supabase-js'

// Client with anon key (SAFE for browser)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // NOT service key!
)

// Realtime subscription
const channel = supabase
  .channel('posts')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'posts' },
    (payload) => console.log('New post:', payload)
  )
  .subscribe()

// Query (RLS automatically filters to user's data)
const { data } = await supabase.from('posts').select('*')
```

## Version Gotchas
- **auth.uid()**: Returns current user's ID in RLS policies
- **Edge Functions**: Deno-based serverless functions
- **Realtime**: PostgreSQL LISTEN/NOTIFY for live updates
- **Storage**: S3-compatible with RLS-like policies

## What NOT to Do
- Do NOT disable RLS on production tables
- Do NOT expose service role key to clients
- Do NOT forget policies for each CRUD operation
- Do NOT use database URL directly (use Supabase client)
