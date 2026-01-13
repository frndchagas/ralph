## Browser Automation

You have access to a browser automation server running at `http://localhost:9222`.

### Available Endpoints

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/health` | - | Check server status |
| GET | `/pages` | - | List all open pages |
| POST | `/pages` | `{name}` | Create/get a named page |
| POST | `/navigate` | `{name, url}` | Navigate to URL |
| POST | `/screenshot` | `{name, path?, fullPage?}` | Take screenshot |
| POST | `/content` | `{name, selector?}` | Get page content |
| POST | `/click` | `{name, selector}` | Click element |
| POST | `/fill` | `{name, selector, value}` | Fill input |
| POST | `/eval` | `{name, script}` | Run JavaScript |
| POST | `/wait` | `{name, selector, state?, timeout?}` | Wait for element |
| DELETE | `/pages/:name` | - | Close page |

### Usage Examples

```bash
# Create a page
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

### Best Practices

1. **Create named pages** for different contexts (e.g., "admin", "user")
2. **Wait for elements** before interacting with them
3. **Take screenshots** after important actions for verification
4. **Close pages** when done to free resources

### Session Persistence

The browser maintains cookies and local storage between navigations. If you need to test authenticated flows, login once and the session will persist.
