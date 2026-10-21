// Decodes hero frames off the main thread and hands the bitmaps back (transferred, not copied).
// Safari and Firefox decode createImageBitmap(blob) on the calling thread, so decoding there would
// stall scrolling for every new frame.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; blob: Blob }>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = async (e) => {
  const { id, blob } = e.data;
  try {
    const bmp = await createImageBitmap(blob);
    scope.postMessage({ id, bmp }, [bmp]);
  } catch {
    scope.postMessage({ id, failed: true });
  }
};
