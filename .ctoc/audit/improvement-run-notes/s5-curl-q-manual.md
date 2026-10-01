# What `curl -q` does, from the curl manual installed on this machine (executor read, 2026-10-01)

The validator's re-read of the returned passages (d-s5-step10-return-revalidate) could not check whether `-q` as the first argument stops curl reading its configuration file. The executor read the manual page that ships with the curl on this machine.

- `curl --version` (first line): `curl 8.7.1 (x86_64-apple-darwin25.0) libcurl/8.7.1 (SecureTransport) LibreSSL/3.3.6 zlib/1.2.12 nghttp2/1.68.1`
- Manual page: `/usr/share/man/man1/curl.1` (`man -w curl`), read with `man curl | col -b`; the entry for `-q, --disable`, verbatim:

> If used as the first parameter on the command line, the curlrc config file is not read or used. See the -K, --config for details on the default config file search path.

- The same entry adds: "Prior to 7.50.0 curl supported the short option name q but not the long option name disable." and "Providing --disable multiple times has no extra effect."
- What this does not show: how curl behaves when `-q` is not first (the manual says only that it works "as the first parameter"); and no run with a real `.curlrc` was made (none exists on this machine). The session's run of the `-q` form logged `-q` as the first argument of both calls (`s5-skill-round3-session-runs.md`, "After the second return").
