export function formatToApiDate(d, isEnd) {
  if (!d) return '';
  const pad = n => n.toString().padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (isEnd !== undefined) {
    return `${dateStr} ${isEnd ? '23:59' : '00:00'}`;
  }
  return `${dateStr} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateOnly(d) {
  if (!d) return '';
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseFromApiDate(apiStr, isEnd) {
  if (!apiStr) return null;
  let str = apiStr.replace('T', ' ');
  if (str.length === 10) str += isEnd ? ' 23:59' : ' 00:00';
  str = str.substring(0, 16); // Only YYYY-MM-DD HH:mm
  return new Date(str.replace(' ', 'T'));
}
