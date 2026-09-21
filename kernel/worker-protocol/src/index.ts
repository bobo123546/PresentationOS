export { PROTOCOL_VERSION, encodeMessage, decodeMessage, isJobRequest, isJobResponse } from './protocol.js';
export type { WorkerMessage, WorkerHandshake, JobRequest, JobResponse, Heartbeat, JobCancel, StatusQuery } from './protocol.js';
export { spawnWorker, WorkerProcess } from './spawner.js';
export type { SpawnOptions, PendingJob } from './spawner.js';
