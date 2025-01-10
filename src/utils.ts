export function humanFileSize(size: number): { value: number; unit: string } {
  const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  const value = parseFloat((size / Math.pow(1024, i)).toFixed(2));
  const unit = ['b', 'kb', 'Mb', 'Gb', 'Tb'][i];
  return { value, unit };
}
