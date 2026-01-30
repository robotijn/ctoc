# Phoenix CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
mix archive.install hex phx_new
mix phx.new myapp --database postgres
cd myapp && mix deps.get
mix phx.server
```

## Claude's Common Mistakes
1. **Fat controllers** — Delegate to contexts immediately; controllers route only
2. **Missing changesets** — Never insert raw data; always validate via changeset
3. **Blocking in LiveView events** — Use `Task.async` for slow operations
4. **N+1 queries** — Use `Repo.preload` or Ecto joins
5. **Not using PubSub** — Broadcast changes for real-time updates

## Correct Patterns (2026)
```elixir
# Context module (business logic lives here)
# lib/myapp/accounts.ex
defmodule MyApp.Accounts do
  alias MyApp.Repo
  alias MyApp.Accounts.User

  def create_user(attrs) do
    %User{}
    |> User.changeset(attrs)  # Always use changeset
    |> Repo.insert()
    |> broadcast_change(:user_created)
  end

  defp broadcast_change({:ok, user} = result, event) do
    Phoenix.PubSub.broadcast(MyApp.PubSub, "users", {event, user})
    result
  end
  defp broadcast_change(result, _event), do: result
end

# LiveView with PubSub subscription
# lib/myapp_web/live/user_list_live.ex
defmodule MyAppWeb.UserListLive do
  use MyAppWeb, :live_view
  alias MyApp.Accounts

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(MyApp.PubSub, "users")
    end
    users = Accounts.list_users() |> Repo.preload(:profile)  # Avoid N+1
    {:ok, assign(socket, users: users)}
  end

  @impl true
  def handle_event("create", %{"user" => params}, socket) do
    # Non-blocking for slow operations
    Task.async(fn -> Accounts.create_user(params) end)
    {:noreply, socket}
  end

  @impl true
  def handle_info({:user_created, user}, socket) do
    {:noreply, update(socket, :users, &[user | &1])}
  end
end
```

## Version Gotchas
- **Phoenix 1.7+**: Built-in Tailwind, `verified_routes`
- **LiveView 0.20+**: Improved streams, component slots
- **Ecto 3.x**: Schemaless changesets, composable queries
- **OTP 26+**: Recommended for best performance

## What NOT to Do
- ❌ Business logic in controllers — Move to context modules
- ❌ `Repo.insert(%User{email: email})` — Use changesets
- ❌ Sync HTTP calls in `handle_event` — Use `Task.async`
- ❌ `Enum.map` then access association — Use `Repo.preload`
- ❌ Ignoring `connected?(socket)` — PubSub fails on initial render

## Context Pattern
```
lib/myapp/
├── accounts/           # Context
│   ├── user.ex         # Schema
│   └── ...
├── accounts.ex         # Context API (public functions)
```

## Common Errors
| Error | Fix |
|-------|-----|
| `Ecto.NoResultsError` | Use `Repo.get` not `Repo.get!`, handle nil |
| `Phoenix.LiveView.Static` | Check `connected?(socket)` before PubSub |
| `DBConnection.ConnectionError` | Check pool size, database connection |
| `changeset.errors not empty` | Validate data before insert |
