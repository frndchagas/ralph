## Browser Automation

You have access to a browser automation server running at `http://localhost:9222`.

### Multi-Context Support

The browser server supports **multiple isolated contexts**, each with its own:
- Cookies and session storage
- Local storage
- Login state

This is useful for testing multi-user scenarios (e.g., User A chatting with User B).

### Available Endpoints

#### Context Management

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/contexts` | - | List all browser contexts |
| POST | `/contexts` | `{name, clearData?}` | Create a named context |
| DELETE | `/contexts/:name` | `?clearData=true` | Close context (optionally clear data) |

#### Page Management

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/health` | - | Check server status |
| GET | `/pages` | - | List all open pages |
| POST | `/pages` | `{name, context?}` | Create/get a named page |
| POST | `/navigate` | `{name, context?, url}` | Navigate to URL |
| POST | `/screenshot` | `{name, context?, path?, fullPage?}` | Take screenshot |
| POST | `/content` | `{name, context?, selector?}` | Get page content |
| POST | `/click` | `{name, context?, selector}` | Click element |
| POST | `/fill` | `{name, context?, selector, value}` | Fill input |
| POST | `/eval` | `{name, context?, script}` | Run JavaScript |
| POST | `/wait` | `{name, context?, selector, state?, timeout?}` | Wait for element |
| DELETE | `/pages/:name` | - | Close page |

### Multi-User Example

```bash
# 1. Create contexts for two users
curl -X POST http://localhost:9222/contexts -d '{"name":"user-a"}'
curl -X POST http://localhost:9222/contexts -d '{"name":"user-b"}'

# 2. Open pages in each context
curl -X POST http://localhost:9222/pages -d '{"name":"page-a","context":"user-a"}'
curl -X POST http://localhost:9222/pages -d '{"name":"page-b","context":"user-b"}'

# 3. Navigate both to login
curl -X POST http://localhost:9222/navigate -d '{"name":"page-a","context":"user-a","url":"http://localhost:3000/login"}'
curl -X POST http://localhost:9222/navigate -d '{"name":"page-b","context":"user-b","url":"http://localhost:3000/login"}'

# 4. Login as different users (cookies are isolated!)
curl -X POST http://localhost:9222/fill -d '{"name":"page-a","context":"user-a","selector":"input[name=email]","value":"usera@example.com"}'
curl -X POST http://localhost:9222/fill -d '{"name":"page-b","context":"user-b","selector":"input[name=email]","value":"userb@example.com"}'

# 5. Each context maintains its own session
```

### Single-User Example (Backward Compatible)

```bash
# Create a page (uses "default" context automatically)
curl -X POST http://localhost:9222/pages -d '{"name":"test"}'

# Navigate
curl -X POST http://localhost:9222/navigate -d '{"name":"test","url":"http://localhost:3000"}'

# Take screenshot
curl -X POST http://localhost:9222/screenshot -d '{"name":"test","path":"screenshot.png"}'

# Get element text
curl -X POST http://localhost:9222/content -d '{"name":"test","selector":"h1"}'

# Click button
curl -X POST http://localhost:9222/click -d '{"name":"test","selector":"button.submit"}'

# Fill form
curl -X POST http://localhost:9222/fill -d '{"name":"test","selector":"input[name=email]","value":"test@example.com"}'
```

### When to Use Browser

Use the browser server when:
- User story involves UI validation
- Need to verify visual elements
- Testing user flows (login, forms, etc.)
- Taking screenshots for documentation
- **Testing multi-user interactions** (chat, collaboration, etc.)

### Best Practices

1. **Use named contexts** for different users in multi-user tests
2. **Use named pages** for different screens within a context
3. **Wait for elements** before interacting with them
4. **Take screenshots** after important actions for verification
5. **Close contexts** when done to free resources
6. **Use `clearData: true`** to reset a user's state between test runs

### Session Persistence

Each context maintains its own cookies and local storage:
- Data persists between navigations within the same context
- Data is saved to disk when the server shuts down
- Data is loaded automatically when the context is recreated
- Use `clearData: true` to start fresh

### Data Storage

Context data is stored in `.ralph-browser-data/context-{name}/`:
- `cookies.json` - All cookies for the context
