// Un 'running' más viejo que esto se considera muerto (la tarea de Windows
// mata el proceso a los 30 min). Mantener sincronizado con enrich.js.
export const STALE_RUNNING_MS = 35 * 60 * 1000;

export function isRunningStale(status) {
  return (
    status.status === 'running' &&
    (!status.started_at || Date.now() - new Date(status.started_at).getTime() > STALE_RUNNING_MS)
  );
}
