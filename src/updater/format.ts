const MB = 1024 * 1024;

export function progressText(downloaded: number, total: number): { percent: number | null; label: string } {
  const done = `${Math.round(downloaded / MB)} MB`;
  if (!total) return { percent: null, label: `${done} downloaded` };
  const percent = Math.min(100, Math.floor((downloaded / total) * 100));
  return { percent, label: `${done} of ${Math.round(total / MB)} MB` };
}
