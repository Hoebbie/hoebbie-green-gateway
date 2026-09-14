export async function runReadOnlyReporter(report, onError) {
  try {
    await report();
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
