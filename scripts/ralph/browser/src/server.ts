import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';

const PORT = parseInt(process.env.RALPH_BROWSER_PORT || '9222');
const HEADLESS = process.env.RALPH_BROWSER_HEADLESS === 'true';
const DATA_DIR = join(process.cwd(), '.ralph-browser-data');

interface PageInfo {
  page: Page;
  createdAt: Date;
}

const pages = new Map<string, PageInfo>();
let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function initBrowser() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });

  const cookiesPath = join(DATA_DIR, 'cookies.json');
  if (existsSync(cookiesPath)) {
    const cookies = JSON.parse(readFileSync(cookiesPath, 'utf-8'));
    await context.addCookies(cookies);
  }

  console.log(`Browser initialized (headless: ${HEADLESS})`);
}

async function saveCookies() {
  if (context) {
    const cookies = await context.cookies();
    const cookiesPath = join(DATA_DIR, 'cookies.json');
    writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  }
}

async function getOrCreatePage(name: string): Promise<Page> {
  if (pages.has(name)) {
    return pages.get(name)!.page;
  }

  if (!context) {
    await initBrowser();
  }

  const page = await context!.newPage();
  pages.set(name, { page, createdAt: new Date() });

  page.on('close', () => {
    pages.delete(name);
  });

  return page;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const method = req.method || 'GET';

  res.setHeader('Content-Type', 'application/json');

  try {
    if (method === 'GET' && url.pathname === '/health') {
      res.end(JSON.stringify({ status: 'ok', pages: Array.from(pages.keys()) }));
      return;
    }

    if (method === 'GET' && url.pathname === '/pages') {
      const pageList = Array.from(pages.entries()).map(([name, info]) => ({
        name,
        createdAt: info.createdAt,
        url: info.page.url(),
      }));
      res.end(JSON.stringify(pageList));
      return;
    }

    if (method === 'POST' && url.pathname === '/pages') {
      const body = await readBody(req);
      const { name } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');
      res.end(JSON.stringify({ name, url: page.url() }));
      return;
    }

    if (method === 'POST' && url.pathname === '/navigate') {
      const body = await readBody(req);
      const { name, url: targetUrl } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      await saveCookies();
      res.end(JSON.stringify({ success: true, url: page.url(), title: await page.title() }));
      return;
    }

    if (method === 'POST' && url.pathname === '/screenshot') {
      const body = await readBody(req);
      const { name, path: screenshotPath, fullPage } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');
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
      const { name, selector } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');

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
      const { name, selector } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');
      await page.click(selector);
      await saveCookies();
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (method === 'POST' && url.pathname === '/fill') {
      const body = await readBody(req);
      const { name, selector, value } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');
      await page.fill(selector, value);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (method === 'POST' && url.pathname === '/eval') {
      const body = await readBody(req);
      const { name, script } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');
      const result = await page.evaluate(script);
      res.end(JSON.stringify({ success: true, result }));
      return;
    }

    if (method === 'POST' && url.pathname === '/wait') {
      const body = await readBody(req);
      const { name, selector, state, timeout } = JSON.parse(body);
      const page = await getOrCreatePage(name || 'default');
      await page.waitForSelector(selector, { state: state || 'visible', timeout: timeout || 30000 });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (method === 'DELETE' && url.pathname.startsWith('/pages/')) {
      const pageName = url.pathname.replace('/pages/', '');
      if (pages.has(pageName)) {
        await pages.get(pageName)!.page.close();
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
  await saveCookies();

  for (const [name, info] of pages) {
    await info.page.close().catch(() => {});
  }
  pages.clear();

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
  console.log('  GET  /health     - Server status');
  console.log('  GET  /pages      - List pages');
  console.log('  POST /pages      - Create page {name}');
  console.log('  POST /navigate   - Navigate {name, url}');
  console.log('  POST /screenshot - Screenshot {name, path?, fullPage?}');
  console.log('  POST /content    - Get content {name, selector?}');
  console.log('  POST /click      - Click {name, selector}');
  console.log('  POST /fill       - Fill {name, selector, value}');
  console.log('  POST /eval       - Evaluate {name, script}');
  console.log('  POST /wait       - Wait {name, selector, state?, timeout?}');
  console.log('  DELETE /pages/:n - Close page');
});

initBrowser().catch(console.error);
