import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'fs';

const PORT = parseInt(process.env.RALPH_BROWSER_PORT || '9222');
const HEADLESS = process.env.RALPH_BROWSER_HEADLESS === 'true';
const DATA_DIR = join(process.cwd(), '.ralph-browser-data');

interface PageInfo {
  page: Page;
  contextName: string;
  createdAt: Date;
}

interface ContextInfo {
  context: BrowserContext;
  createdAt: Date;
}

const contexts = new Map<string, ContextInfo>();
const pages = new Map<string, PageInfo>();
let browser: Browser | null = null;

async function initBrowser() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  console.log(`Browser initialized (headless: ${HEADLESS})`);
}

function getContextDataDir(contextName: string): string {
  return join(DATA_DIR, `context-${contextName}`);
}

async function getOrCreateContext(name: string): Promise<BrowserContext> {
  if (contexts.has(name)) {
    return contexts.get(name)!.context;
  }

  if (!browser) {
    await initBrowser();
  }

  const contextDataDir = getContextDataDir(name);
  if (!existsSync(contextDataDir)) {
    mkdirSync(contextDataDir, { recursive: true });
  }

  const context = await browser!.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });

  const cookiesPath = join(contextDataDir, 'cookies.json');
  if (existsSync(cookiesPath)) {
    try {
      const cookies = JSON.parse(readFileSync(cookiesPath, 'utf-8'));
      await context.addCookies(cookies);
    } catch (e) {
      console.warn(`Failed to load cookies for context ${name}:`, e);
    }
  }

  contexts.set(name, { context, createdAt: new Date() });
  console.log(`Context "${name}" created`);

  return context;
}

async function saveCookies(contextName: string) {
  const contextInfo = contexts.get(contextName);
  if (contextInfo) {
    const cookies = await contextInfo.context.cookies();
    const cookiesPath = join(getContextDataDir(contextName), 'cookies.json');
    writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  }
}

async function saveAllCookies() {
  for (const [name] of contexts) {
    await saveCookies(name);
  }
}

async function getOrCreatePage(pageName: string, contextName: string = 'default'): Promise<Page> {
  if (pages.has(pageName)) {
    const pageInfo = pages.get(pageName)!;
    if (pageInfo.contextName !== contextName) {
      throw new Error(`Page "${pageName}" exists in context "${pageInfo.contextName}", not "${contextName}"`);
    }
    return pageInfo.page;
  }

  const context = await getOrCreateContext(contextName);
  const page = await context.newPage();
  pages.set(pageName, { page, contextName, createdAt: new Date() });

  page.on('close', () => {
    pages.delete(pageName);
  });

  return page;
}

async function closeContext(contextName: string): Promise<boolean> {
  const contextInfo = contexts.get(contextName);
  if (!contextInfo) {
    return false;
  }

  await saveCookies(contextName);

  for (const [pageName, pageInfo] of pages) {
    if (pageInfo.contextName === contextName) {
      await pageInfo.page.close().catch(() => {});
      pages.delete(pageName);
    }
  }

  await contextInfo.context.close().catch(() => {});
  contexts.delete(contextName);
  console.log(`Context "${contextName}" closed`);

  return true;
}

async function clearContextData(contextName: string): Promise<boolean> {
  const contextDataDir = getContextDataDir(contextName);
  if (existsSync(contextDataDir)) {
    rmSync(contextDataDir, { recursive: true });
    return true;
  }
  return false;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const method = req.method || 'GET';

  res.setHeader('Content-Type', 'application/json');

  try {
    if (method === 'GET' && url.pathname === '/health') {
      res.end(JSON.stringify({
        status: 'ok',
        contexts: Array.from(contexts.keys()),
        pages: Array.from(pages.keys()),
      }));
      return;
    }

    if (method === 'GET' && url.pathname === '/contexts') {
      const contextList = Array.from(contexts.entries()).map(([name, info]) => {
        const contextPages = Array.from(pages.entries())
          .filter(([, p]) => p.contextName === name)
          .map(([pageName]) => pageName);
        return {
          name,
          createdAt: info.createdAt,
          pages: contextPages,
        };
      });
      res.end(JSON.stringify(contextList));
      return;
    }

    if (method === 'POST' && url.pathname === '/contexts') {
      const body = await readBody(req);
      const { name, clearData } = JSON.parse(body);
      const contextName = name || 'default';

      if (clearData) {
        await closeContext(contextName);
        await clearContextData(contextName);
      }

      await getOrCreateContext(contextName);
      res.end(JSON.stringify({ success: true, name: contextName }));
      return;
    }

    if (method === 'DELETE' && url.pathname.startsWith('/contexts/')) {
      const contextName = decodeURIComponent(url.pathname.replace('/contexts/', ''));
      const clearData = url.searchParams.get('clearData') === 'true';

      const closed = await closeContext(contextName);
      if (clearData) {
        await clearContextData(contextName);
      }

      res.end(JSON.stringify({ success: closed, cleared: clearData }));
      return;
    }

    if (method === 'GET' && url.pathname === '/pages') {
      const pageList = Array.from(pages.entries()).map(([name, info]) => ({
        name,
        context: info.contextName,
        createdAt: info.createdAt,
        url: info.page.url(),
      }));
      res.end(JSON.stringify(pageList));
      return;
    }

    if (method === 'POST' && url.pathname === '/pages') {
      const body = await readBody(req);
      const { name, context: contextName } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');
      res.end(JSON.stringify({ name, context: contextName || 'default', url: page.url() }));
      return;
    }

    if (method === 'POST' && url.pathname === '/navigate') {
      const body = await readBody(req);
      const { name, context: contextName, url: targetUrl } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      await saveCookies(contextName || 'default');
      res.end(JSON.stringify({ success: true, url: page.url(), title: await page.title() }));
      return;
    }

    if (method === 'POST' && url.pathname === '/screenshot') {
      const body = await readBody(req);
      const { name, context: contextName, path: screenshotPath, fullPage } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');
      const buffer = await page.screenshot({ fullPage: fullPage || false });

      if (screenshotPath) {
        writeFileSync(screenshotPath, buffer);
        res.end(JSON.stringify({ success: true, path: screenshotPath }));
      } else {
        res.end(JSON.stringify({ success: true, base64: buffer.toString('base64') }));
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/content') {
      const body = await readBody(req);
      const { name, context: contextName, selector } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');

      let content: string;
      if (selector) {
        content = await page.locator(selector).textContent() || '';
      } else {
        content = await page.content();
      }

      res.end(JSON.stringify({ success: true, content }));
      return;
    }

    if (method === 'POST' && url.pathname === '/click') {
      const body = await readBody(req);
      const { name, context: contextName, selector } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');
      await page.click(selector);
      await saveCookies(contextName || 'default');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (method === 'POST' && url.pathname === '/fill') {
      const body = await readBody(req);
      const { name, context: contextName, selector, value } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');
      await page.fill(selector, value);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (method === 'POST' && url.pathname === '/eval') {
      const body = await readBody(req);
      const { name, context: contextName, script } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');
      const result = await page.evaluate(script);
      res.end(JSON.stringify({ success: true, result }));
      return;
    }

    if (method === 'POST' && url.pathname === '/wait') {
      const body = await readBody(req);
      const { name, context: contextName, selector, state, timeout } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default', contextName || 'default');
      await page.waitForSelector(selector, { state: state || 'visible', timeout: timeout || 30000 });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (method === 'DELETE' && url.pathname.startsWith('/pages/')) {
      const pageName = decodeURIComponent(url.pathname.replace('/pages/', ''));
      if (pages.has(pageName)) {
        const pageInfo = pages.get(pageName)!;
        await saveCookies(pageInfo.contextName);
        await pageInfo.page.close();
        pages.delete(pageName);
      }
      res.end(JSON.stringify({ success: true }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(error) }));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function cleanup() {
  console.log('\nShutting down...');
  await saveAllCookies();

  for (const [, info] of pages) {
    await info.page.close().catch(() => {});
  }
  pages.clear();

  for (const [, info] of contexts) {
    await info.context.close().catch(() => {});
  }
  contexts.clear();

  if (browser) {
    await browser.close().catch(() => {});
  }

  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`Ralph Browser Server running on http://localhost:${PORT}`);
  console.log(`Headless: ${HEADLESS}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log('\nEndpoints:');
  console.log('  GET  /health       - Server status');
  console.log('  GET  /contexts     - List browser contexts');
  console.log('  POST /contexts     - Create context {name, clearData?}');
  console.log('  DELETE /contexts/n - Close context (?clearData=true)');
  console.log('  GET  /pages        - List pages');
  console.log('  POST /pages        - Create page {name, context?}');
  console.log('  POST /navigate     - Navigate {name, context?, url}');
  console.log('  POST /screenshot   - Screenshot {name, context?, path?, fullPage?}');
  console.log('  POST /content      - Get content {name, context?, selector?}');
  console.log('  POST /click        - Click {name, context?, selector}');
  console.log('  POST /fill         - Fill {name, context?, selector, value}');
  console.log('  POST /eval         - Evaluate {name, context?, script}');
  console.log('  POST /wait         - Wait {name, context?, selector, state?, timeout?}');
  console.log('  DELETE /pages/:n   - Close page');
  console.log('\nMulti-user example:');
  console.log('  1. POST /contexts {name: "user-a"} - Create context for User A');
  console.log('  2. POST /contexts {name: "user-b"} - Create context for User B');
  console.log('  3. POST /navigate {name: "page1", context: "user-a", url: "..."}');
  console.log('  4. POST /navigate {name: "page2", context: "user-b", url: "..."}');
});

initBrowser().catch(console.error);
