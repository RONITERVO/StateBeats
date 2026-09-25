export const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export const button = (id: string, action: () => void) => el(id).addEventListener('click', action);
export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
