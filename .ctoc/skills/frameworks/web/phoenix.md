# Phoenix CTO
> Real-time Elixir web framework - LiveView, fault tolerance, massive concurrency.

## Commands
```bash
# Setup | Dev | Test
mix phx.new myapp --database postgres
mix phx.server
mix test --cover
```

## Non-Negotiables
1. Contexts for domain boundaries - organize by business capability
2. Ecto changesets for all data validation
3. LiveView for real-time UI - minimize JavaScript
4. PubSub for event broadcasting
5. Proper supervision trees for fault tolerance

## Red Lines
- Fat controllers - delegate to contexts immediately
- Missing changesets - never insert raw data
- Blocking in LiveView `handle_event` - use `Task.async`
- N+1 queries - use `Repo.preload` or `Ecto.Query` joins
- Ignoring OTP patterns - let it crash, supervise

## Pattern: Context with LiveView
```elixir
# lib/myapp/accounts.ex
defmodule MyApp.Accounts do
  alias MyApp.Repo
  alias MyApp.Accounts.User

  def create_user(attrs) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
    |> broadcast_change(:user_created)
  end

  defp broadcast_change({:ok, user} = result, event) do
    Phoenix.PubSub.broadcast(MyApp.PubSub, "users", {event, user})
    result
  end
  defp broadcast_change(result, _event), do: result
end

# lib/myapp_web/live/user_list_live.ex
defmodule MyAppWeb.UserListLive do
  use MyAppWeb, :live_view

  alias MyApp.Accounts

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket), do: Phoenix.PubSub.subscribe(MyApp.PubSub, "users")
    users = Accounts.list_users()
    {:ok, assign(socket, users: users, form: to_form(Accounts.change_user()))}
  end

  @impl true
  def handle_event("save", %{"user" => params}, socket) do
    case Accounts.create_user(params) do
      {:ok, _user} ->
        {:noreply, assign(socket, form: to_form(Accounts.change_user()))}
      {:error, changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  @impl true
  def handle_info({:user_created, user}, socket) do
    {:noreply, update(socket, :users, &[user | &1])}
  end
end
```

## Integrates With
- **DB**: Ecto with PostgreSQL, use migrations
- **Auth**: `phx.gen.auth` for complete auth system
- **Cache**: ETS or Cachex for in-memory, Redis for distributed
- **Jobs**: Oban for background job processing

## Common Errors
| Error | Fix |
|-------|-----|
| `(Ecto.NoResultsError)` | Use `Repo.get` not `Repo.get!`, handle nil |
| `(Phoenix.LiveView.Static)` | Check socket connection, use `connected?/1` |
| `(DBConnection.ConnectionError)` | Check database connection, pool size |
| `changeset.errors not empty` | Validate data before insert, check constraints |

## Prod Ready
- [ ] `config/runtime.exs` for production secrets
- [ ] Database connection pool sized correctly
- [ ] LiveView disconnection handling
- [ ] Error tracking with Sentry
- [ ] Metrics with Telemetry and `phoenix_live_dashboard`
- [ ] Release built with `mix release`
