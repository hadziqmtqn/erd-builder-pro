import { getVersion } from '@tauri-apps/api/app';
import { appLogDir, join } from '@tauri-apps/api/path';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { progressText } from './format';
import './updater.css';

// The Desktop app opens this window when its local server does not start (OPS-009), so it must
// work without that server and without the app bundle.
const REPO = 'https://github.com/hadziqmtqn/erd-builder-pro';
// Set by the Rust side when it opens the window: "server-failed", "server-stopped" or "menu".
const reason = (window as unknown as { __ERD_UPDATER_REASON__?: string }).__ERD_UPDATER_REASON__;
const serverFailed = reason !== 'menu';
const serverStopped = reason === 'server-stopped';
const FAILED_TITLE = serverStopped ? 'The local server stopped' : 'The local server didn’t start';
const root = document.getElementById('updater') as HTMLElement;
const WARN_ICON = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

type Child = Node | string | null | false | undefined;

function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  for (const child of children) if (child) el.append(child);
  return el;
}

function button(label: string, onClick: () => unknown, kind: 'primary' | 'secondary' | 'link' = 'secondary'): HTMLButtonElement {
  const el = h('button', { type: 'button', class: kind }, label) as HTMLButtonElement;
  el.addEventListener('click', () => { void onClick(); });
  return el;
}

function header(title: string, text: string, warn: boolean): HTMLElement {
  const el = h('header', {}, h('div', {}, h('h1', {}, title), h('p', {}, text)));
  if (warn) el.insertAdjacentHTML('afterbegin', WARN_ICON);
  return el;
}

// The height setSize adds around the page (the title bar on macOS), measured once.
let chrome: number | null = null;

// Each state has its own height; fit the window to it so no empty space is left below.
async function fitWindow() {
  const win = getCurrentWindow();
  const content = Math.ceil(root.getBoundingClientRect().height);
  if (chrome === null) {
    await win.setSize(new LogicalSize(460, content));
    await new Promise((resolve) => setTimeout(resolve, 80));
    chrome = Math.max(0, content - window.innerHeight);
  }
  await win.setSize(new LogicalSize(460, content + chrome));
}

function render(...nodes: Child[]) {
  root.replaceChildren(...nodes.filter((node): node is Node | string => Boolean(node)));
  requestAnimationFrame(() => { void fitWindow().catch(() => {}); });
}

async function showLogs() {
  const dir = await appLogDir();
  // Before the first start there is no startup log yet; show the folder instead.
  await revealItemInDir(await join(dir, 'server-startup.log')).catch(() => revealItemInDir(dir)).catch(() => {});
}

const downloadPage = () => openUrl(`${REPO}/releases/latest`);

function report(version: string) {
  const query = new URLSearchParams({ template: 'bug_report.yml', title: `[Bug]: Desktop server ${serverStopped ? 'stopped' : 'did not start'}`, 'app-version': version });
  return openUrl(`${REPO}/issues/new?${query}`);
}

function row(title: string, text: string, action: HTMLButtonElement): HTMLElement {
  return h('div', { class: 'row' }, h('div', {}, h('span', {}, title), h('span', {}, text)), action);
}

function renderAvailable(update: Update) {
  // latest.json only carries a link as its notes, so the window links to the release page.
  render(
    header(serverFailed ? FAILED_TITLE : 'An update is available',
      serverFailed ? 'A newer version is available and may fix this.' : `ERD Builder Pro ${update.version} is ready to install.`, serverFailed),
    h('section', { class: 'card', 'aria-label': 'Update' },
      h('div', { class: 'versions' }, update.currentVersion, ' → ', h('strong', {}, update.version),
        button('Release notes', () => openUrl(`${REPO}/releases/tag/v${update.version}`), 'link'))),
    h('div', { class: 'actions' },
      button('Install and Restart', () => install(update), 'primary'),
      button('Show Logs', showLogs),
      button('Download manually', downloadPage, 'link')),
  );
}

async function install(update: Update) {
  const fill = h('div', { class: 'fill' });
  const track = h('div', { class: 'track', role: 'progressbar', 'aria-label': 'Download progress', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
  const percentLabel = h('span', {}, '0%');
  const sizeLabel = h('span', {}, '');
  const steps = ['Download', 'Install', 'Restart ERD Builder Pro'].map((label) => h('li', {}, label));
  const setStep = (index: number) => steps.forEach((step, i) => step.setAttribute('class', i < index ? 'done' : i === index ? 'active' : ''));
  render(
    header(`Updating to ${update.version}`, 'The app restarts by itself when the update is installed. Your projects stay as they are.', false),
    h('div', {}, track, h('div', { class: 'progress-label' }, percentLabel, sizeLabel)),
    h('ol', { class: 'steps' }, ...steps),
  );
  setStep(0);

  let total = 0;
  let downloaded = 0;
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') total = event.data.contentLength ?? 0;
      if (event.event === 'Progress') downloaded += event.data.chunkLength;
      if (event.event === 'Finished') setStep(1);
      const { percent, label } = progressText(downloaded, total);
      fill.style.width = `${percent ?? 0}%`;
      if (percent !== null) track.setAttribute('aria-valuenow', String(percent));
      percentLabel.textContent = percent === null ? '' : `${percent}%`;
      sizeLabel.textContent = label;
    });
    setStep(2);
    await relaunch();
  } catch (error) {
    render(
      header('The update could not be installed', String(error), true),
      h('div', { class: 'actions' },
        button('Try Again', () => renderAvailable(update), 'primary'),
        button('Show Logs', showLogs),
        button('Download manually', downloadPage, 'link')),
    );
  }
}

function renderLatest(version: string) {
  render(
    header(serverFailed ? FAILED_TITLE : 'You’re up to date', `You’re on ${version}, the latest version.`, serverFailed),
    h('section', { class: 'card', 'aria-label': 'What you can do' },
      row('Restart ERD Builder Pro', 'Starts the local server again. Useful after the computer was busy or asleep.', button('Restart', relaunch, 'primary')),
      row('Open the logs', 'server-startup.log shows the step that failed.', button('Show Logs', showLogs)),
      row('Report the problem', 'Opens a GitHub issue with the app version filled in.', button('Report', () => report(version)))),
    h('div', { class: 'actions' }, button('Download the app again from GitHub', downloadPage, 'link')),
  );
}

async function start() {
  const version = await getVersion().catch(() => 'unknown');
  render(header(serverFailed ? FAILED_TITLE : 'Checking for updates', 'Checking for a newer version…', serverFailed));
  let update: Update | null;
  try {
    update = await check();
  } catch (error) {
    render(
      header('Couldn’t check for updates', `Check your internet connection, then try again. (${String(error)})`, true),
      h('div', { class: 'actions' },
        button('Try Again', start, 'primary'),
        button('Show Logs', showLogs),
        button('Download manually', downloadPage, 'link')),
    );
    return;
  }
  if (update) renderAvailable(update);
  else renderLatest(version);
}

void start();
