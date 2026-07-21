/**
 * 瀏覽器端下載工具：Blob → object URL → 觸發 <a download> → 立刻 revoke (EX-01)。
 */
export function downloadText(filename: string, mimeType: string, text: string): number {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
  return blob.size;
}
